import Group from "../models/Group.js";
import Ledger from "../models/Ledger.js";
import Voucher from "../models/Voucher.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";
import mongoose from "mongoose";

// Build hierarchical tree structure
const buildTree = (groups) => {
  const groupMap = new Map();
  const rootGroups = [];

  // Helper to convert ID to string for consistent comparison
  const getIdString = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (id.toString) return id.toString();
    return String(id);
  };

  // First pass: create map of all groups (convert Mongoose documents to plain objects)
  groups.forEach(group => {
    // Convert Mongoose document to plain object if needed
    const plainGroup = group.toObject ? group.toObject() : group;
    const groupId = getIdString(plainGroup._id || plainGroup.id);
    if (groupId) {
      groupMap.set(groupId, {
        ...plainGroup,
        _id: groupId,
        id: groupId,
        children: [],
        ledgers: []
      });
    }
  });

  // Second pass: build tree
  groups.forEach(group => {
    const plainGroup = group.toObject ? group.toObject() : group;
    const groupId = getIdString(plainGroup._id || plainGroup.id);
    const node = groupMap.get(groupId);

    if (node) {
      // Handle parentGroup - it might be populated or just an ID
      let parentGroupId = null;
      if (plainGroup.parentGroup) {
        if (typeof plainGroup.parentGroup === 'object') {
          parentGroupId = getIdString(plainGroup.parentGroup._id || plainGroup.parentGroup.id);
        } else {
          parentGroupId = getIdString(plainGroup.parentGroup);
        }
      }

      if (parentGroupId && groupMap.has(parentGroupId)) {
        const parent = groupMap.get(parentGroupId);
        parent.children.push(node);
      } else {
        rootGroups.push(node);
      }
    }
  });

  return rootGroups;
};

// Build voucher balance map (optimized - fetch once, use many times)
const buildVoucherBalanceMap = async (asOnDate = null) => {
  try {
    const query = {
      isActive: true
    };

    if (asOnDate) {
      query.date = { $lte: new Date(asOnDate) };
    }

    // Use aggregation to calculate balances efficiently
    const balanceMap = await Voucher.aggregate([
      { $match: query },
      { $unwind: '$entries' },
      {
        $group: {
          _id: '$entries.account',
          debitTotal: { $sum: { $ifNull: ['$entries.debitAmount', 0] } },
          creditTotal: { $sum: { $ifNull: ['$entries.creditAmount', 0] } }
        }
      }
    ]);

    // Create a map for fast lookup (normalize account names to lowercase)
    const map = new Map();
    balanceMap.forEach(item => {
      if (item._id) {
        const normalizedName = item._id.toString().trim().toLowerCase();
        map.set(normalizedName, {
          debitTotal: item.debitTotal || 0,
          creditTotal: item.creditTotal || 0
        });
      }
    });

    return map;
  } catch (error) {
    console.error('Error building voucher balance map:', error);
    return new Map();
  }
};

// Calculate ledger balance from voucher map (optimized)
const calculateLedgerBalance = (ledgerName, voucherBalanceMap) => {
  try {
    const normalizedName = ledgerName.toString().trim().toLowerCase();
    const balance = voucherBalanceMap.get(normalizedName) || { debitTotal: 0, creditTotal: 0 };

    return {
      debitTotal: balance.debitTotal,
      creditTotal: balance.creditTotal,
      balance: balance.debitTotal - balance.creditTotal
    };
  } catch (error) {
    console.error('Error calculating ledger balance:', error);
    return { debitTotal: 0, creditTotal: 0, balance: 0 };
  }
};

// Calculate group balance (sum of all ledgers in group and its children) - optimized
const calculateGroupBalance = async (group, voucherBalanceMap, ledgerGroupMap, asOnDate = null) => {
  let totalBalance = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  let totalOpeningBalance = 0;
  let totalOutstandingBalance = 0;

  // Get all ledgers in this group (from map)
  const groupId = group.id || group._id;
  const ledgers = ledgerGroupMap.get(groupId.toString()) || [];

  // Process all ledgers
  for (const ledger of ledgers) {
    const ledgerBalance = calculateLedgerBalance(ledger.name, voucherBalanceMap);
    totalDebit += ledgerBalance.debitTotal;
    totalCredit += ledgerBalance.creditTotal;
    totalOpeningBalance += ledger.openingBalance || 0;
    totalOutstandingBalance += ledger.outstandingBalance ?? ledger.openingBalance ?? 0;

    // For Assets: Debit - Credit (positive means asset)
    // For Liability: Credit - Debit (positive means liability)
    if (group.type === 'Assets') {
      totalBalance += ledgerBalance.balance;
    } else if (group.type === 'Liability') {
      totalBalance -= ledgerBalance.balance; // Credit - Debit
    }
  }

  // Recursively calculate children balances
  if (group.children && group.children.length > 0) {
    for (const child of group.children) {
      const childBalance = await calculateGroupBalance(child, voucherBalanceMap, ledgerGroupMap, asOnDate);
      totalBalance += childBalance.totalBalance;
      totalDebit += childBalance.totalDebit;
      totalCredit += childBalance.totalCredit;
      totalOpeningBalance += childBalance.totalOpeningBalance;
      totalOutstandingBalance += childBalance.totalOutstandingBalance;
    }
  }

  return { totalBalance, totalDebit, totalCredit, totalOpeningBalance, totalOutstandingBalance };
};

// Calculate Capital/Equity (Income - Expenses) - optimized
const calculateCapital = async (voucherBalanceMap, allLedgers, asOnDate = null) => {
  try {
    // Get all income and expense groups to filters ledgers
    // Better way: Filter allLedgers based on their populated Group type
    // Since we didn't populate group type in the global fetch, we might need a set of group IDs.
    // However, the original code fetched groups to get IDs.

    // Efficient approach: Fetch Income/Expense group IDs
    const incomeGroups = await Group.find({ type: 'Income', isActive: true }).select('_id').lean();
    const expenseGroups = await Group.find({ type: 'Expenses', isActive: true }).select('_id').lean();

    const incomeGroupIds = new Set(incomeGroups.map(g => g._id.toString()));
    const expenseGroupIds = new Set(expenseGroups.map(g => g._id.toString()));

    let totalIncome = 0;
    let totalExpenses = 0;

    // Iterate through all ledgers
    for (const ledger of allLedgers) {
      if (!ledger.group) continue;
      const groupId = ledger.group.toString();

      if (incomeGroupIds.has(groupId)) {
        const balance = calculateLedgerBalance(ledger.name, voucherBalanceMap);
        totalIncome += (balance.creditTotal - balance.debitTotal);
      } else if (expenseGroupIds.has(groupId)) {
        const balance = calculateLedgerBalance(ledger.name, voucherBalanceMap);
        totalExpenses += (balance.debitTotal - balance.creditTotal);
      }
    }

    // Capital = Income - Expenses
    return totalIncome - totalExpenses;
  } catch (error) {
    console.error('Error calculating capital:', error);
    return 0;
  }
};

// Get balance sheet data
export const getBalanceSheet = async (req, res, next) => {
  try {
    const { asOnDate } = req.query;
    const date = asOnDate ? new Date(asOnDate) : new Date();

    // OPTIMIZATION: batch fetch all needed data
    const [voucherBalanceMap, allLedgers, assetsGroups, liabilityGroups] = await Promise.all([
      buildVoucherBalanceMap(date),
      Ledger.find({ isActive: true }).lean(),
      Group.find({ type: 'Assets', isActive: true }).populate('parentGroup', 'name type slug').lean().sort({ name: 1 }),
      Group.find({ type: 'Liability', isActive: true }).populate('parentGroup', 'name type slug').lean().sort({ name: 1 })
    ]);

    // Build Ledger Map (GroupId -> Ledgers)
    const ledgerGroupMap = new Map();
    allLedgers.forEach(ledger => {
      if (ledger.group) {
        const groupId = ledger.group.toString();
        if (!ledgerGroupMap.has(groupId)) {
          ledgerGroupMap.set(groupId, []);
        }
        ledgerGroupMap.get(groupId).push(ledger);
      }
    });

    // Build tree structures
    const assetsTree = buildTree(assetsGroups);
    const liabilityTree = buildTree(liabilityGroups);

    // Calculate balances for each group (pass voucher map to avoid re-fetching)
    const processGroups = async (groups) => {
      const processedGroups = [];
      for (const group of groups) {
        const balance = await calculateGroupBalance(group, voucherBalanceMap, ledgerGroupMap, date);
        // Ensure we have a clean plain object
        const groupId = group._id || group.id;
        const processedGroup = {
          _id: groupId,
          id: groupId,
          name: group.name,
          slug: group.slug,
          type: group.type,
          parentGroup: group.parentGroup,
          isPredefined: group.isPredefined,
          isActive: group.isActive,
          balance: balance.totalBalance,
          debitTotal: balance.totalDebit,
          creditTotal: balance.totalCredit,
          openingBalance: balance.totalOpeningBalance,
          outstandingBalance: balance.totalOutstandingBalance,
          children: group.children && group.children.length > 0
            ? await processGroups(group.children)
            : [],
          ledgers: []
        };
        processedGroups.push(processedGroup);
      }
      return processedGroups;
    };

    const processedAssets = await processGroups(assetsTree);
    const processedLiabilities = await processGroups(liabilityTree);

    // Calculate capital/equity (pass voucher map)
    const capital = await calculateCapital(voucherBalanceMap, allLedgers, date);

    // Calculate totals
    const calculateTotal = (groups) => {
      let total = 0;
      groups.forEach(group => {
        total += Math.abs(group.balance);
        if (group.children && group.children.length > 0) {
          total += calculateTotal(group.children);
        }
      });
      return total;
    };

    const totalAssets = calculateTotal(processedAssets);
    const totalLiabilities = calculateTotal(processedLiabilities);
    const totalCapital = Math.abs(capital);
    const totalLiabilitiesAndCapital = totalLiabilities + totalCapital;

    successResponse(res, "Balance sheet retrieved successfully", 200, {
      asOnDate: date,
      assets: {
        groups: processedAssets,
        total: totalAssets
      },
      liabilities: {
        groups: processedLiabilities,
        total: totalLiabilities
      },
      capital: {
        amount: capital,
        total: totalCapital
      },
      totals: {
        totalAssets,
        totalLiabilities,
        totalCapital,
        totalLiabilitiesAndCapital,
        balance: totalAssets - totalLiabilitiesAndCapital
      }
    });
  } catch (error) {
    next(error);
  }
};

