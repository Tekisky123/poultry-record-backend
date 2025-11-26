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

// Calculate ledger balance from vouchers
const calculateLedgerBalance = async (ledgerName, asOnDate = null) => {
  try {
    const query = {
      isActive: true,
      status: 'posted'
    };

    if (asOnDate) {
      query.date = { $lte: new Date(asOnDate) };
    }

    const vouchers = await Voucher.find(query);

    let debitTotal = 0;
    let creditTotal = 0;

    vouchers.forEach(voucher => {
      voucher.entries.forEach(entry => {
        // Match by account name (ledger name)
        if (entry.account && entry.account.toString().trim().toLowerCase() === ledgerName.toString().trim().toLowerCase()) {
          debitTotal += entry.debitAmount || 0;
          creditTotal += entry.creditAmount || 0;
        }
      });
    });

    // For Assets: Debit - Credit (positive means asset)
    // For Liability: Credit - Debit (positive means liability)
    return { debitTotal, creditTotal, balance: debitTotal - creditTotal };
  } catch (error) {
    console.error('Error calculating ledger balance:', error);
    return { debitTotal: 0, creditTotal: 0, balance: 0 };
  }
};

// Calculate group balance (sum of all ledgers in group and its children)
const calculateGroupBalance = async (group, asOnDate = null) => {
  let totalBalance = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  let totalOpeningBalance = 0;
  let totalOutstandingBalance = 0;

  // Get all ledgers in this group
  const groupId = group.id || group._id;
  const ledgers = await Ledger.find({ group: groupId, isActive: true });
  
  for (const ledger of ledgers) {
    const ledgerBalance = await calculateLedgerBalance(ledger.name, asOnDate);
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
      const childBalance = await calculateGroupBalance(child, asOnDate);
      totalBalance += childBalance.totalBalance;
      totalDebit += childBalance.totalDebit;
      totalCredit += childBalance.totalCredit;
      totalOpeningBalance += childBalance.totalOpeningBalance;
      totalOutstandingBalance += childBalance.totalOutstandingBalance;
    }
  }

  return { totalBalance, totalDebit, totalCredit, totalOpeningBalance, totalOutstandingBalance };
};

// Calculate Capital/Equity (Income - Expenses)
const calculateCapital = async (asOnDate = null) => {
  try {
    const query = {
      isActive: true,
      status: 'posted'
    };

    if (asOnDate) {
      query.date = { $lte: new Date(asOnDate) };
    }

    // Get all income and expense groups
    const incomeGroups = await Group.find({ type: 'Income', isActive: true });
    const expenseGroups = await Group.find({ type: 'Expenses', isActive: true });

    let totalIncome = 0;
    let totalExpenses = 0;

    // Calculate income from vouchers
    for (const group of incomeGroups) {
      const ledgers = await Ledger.find({ group: group._id, isActive: true });
      for (const ledger of ledgers) {
        const balance = await calculateLedgerBalance(ledger.name, asOnDate);
        // Income: Credit - Debit
        totalIncome += (balance.creditTotal - balance.debitTotal);
      }
    }

    // Calculate expenses from vouchers
    for (const group of expenseGroups) {
      const ledgers = await Ledger.find({ group: group._id, isActive: true });
      for (const ledger of ledgers) {
        const balance = await calculateLedgerBalance(ledger.name, asOnDate);
        // Expenses: Debit - Credit
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

    // Get all Assets and Liability groups (using lean() to get plain objects)
    const assetsGroups = await Group.find({ type: 'Assets', isActive: true })
      .populate('parentGroup', 'name type')
      .lean()
      .sort({ name: 1 });

    const liabilityGroups = await Group.find({ type: 'Liability', isActive: true })
      .populate('parentGroup', 'name type')
      .lean()
      .sort({ name: 1 });

    // Build tree structures
    const assetsTree = buildTree(assetsGroups);
    const liabilityTree = buildTree(liabilityGroups);

    // Calculate balances for each group
    const processGroups = async (groups) => {
      const processedGroups = [];
      for (const group of groups) {
        const balance = await calculateGroupBalance(group, date);
        // Ensure we have a clean plain object
        const groupId = group._id || group.id;
        const processedGroup = {
          _id: groupId,
          id: groupId,
          name: group.name,
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

    // Calculate capital/equity
    const capital = await calculateCapital(date);

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

