import Group from "../models/Group.js";
import Ledger from "../models/Ledger.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import InventoryStock from "../models/InventoryStock.js";
import Voucher from "../models/Voucher.js";
import Trip from "../models/Trip.js";
import DieselStation from "../models/DieselStation.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";
import { toSignedValue } from "../utils/balanceUtils.js";
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

// Build unified balance map from Vouchers, Trips, and Inventory Stocks
const buildUnifiedBalanceMap = (allVouchers, allTrips, allStocks, idToNameMap) => {
  const map = new Map(); // Key: normalized name (lowercase string)

  const updateMap = (nameOrId, debit, credit) => {
    if (!nameOrId) return;

    // Resolve name if it's an ID
    let name = nameOrId;
    if (mongoose.Types.ObjectId.isValid(nameOrId)) {
      name = idToNameMap.get(nameOrId.toString()) || nameOrId.toString();
    } else if (typeof nameOrId === 'object' && nameOrId._id) {
      // Handle populated objects
      name = idToNameMap.get(nameOrId._id.toString()) || nameOrId.name || nameOrId.vendorName || nameOrId.shopName || nameOrId.toString();
    }

    const key = name.toString().trim().toLowerCase();
    const current = map.get(key) || { debitTotal: 0, creditTotal: 0 };
    map.set(key, {
      debitTotal: current.debitTotal + (Number(debit) || 0),
      creditTotal: current.creditTotal + (Number(credit) || 0)
    });
  };

  // 1. Process Vouchers
  allVouchers.forEach(v => {
    if (!v.isActive) return;
    (v.entries || []).forEach(e => {
      updateMap(e.account, e.debitAmount, e.creditAmount);
    });
  });

  // 2. Process Inventory Stocks (Purchases, Sales, Receipts, Consumptions)
  allStocks.forEach(s => {
    if (s.type === 'purchase' || s.type === 'opening') {
      // Purchase increases liability to Vendor (Credit)
      updateMap(s.vendorId, 0, s.amount);
    } else if (s.type === 'sale') {
      // Sale increases Customer debt (Debit)
      updateMap(s.customerId, s.amount, 0);
      // Payments/Discounts decrease Customer debt (Credit)
      const totalCredit = (Number(s.cashPaid) || 0) + (Number(s.onlinePaid) || 0) + (Number(s.discount) || 0);
      updateMap(s.customerId, 0, totalCredit);

      // Payments increase Cash/Bank ledger balance (Debit)
      if (s.cashPaid > 0) updateMap(s.cashLedgerId, s.cashPaid, 0);
      if (s.onlinePaid > 0) updateMap(s.onlineLedgerId, s.onlinePaid, 0);
    } else if (s.type === 'receipt') {
      // Receipt decreases Customer debt (Credit)
      const totalCredit = (Number(s.cashPaid) || 0) + (Number(s.onlinePaid) || 0) + (Number(s.discount) || 0);
      updateMap(s.customerId, 0, totalCredit);

      // Payments increase Cash/Bank ledger balance (Debit)
      if (s.cashPaid > 0) updateMap(s.cashLedgerId, s.cashPaid, 0);
      if (s.onlinePaid > 0) updateMap(s.onlineLedgerId, s.onlinePaid, 0);
    } else if (s.type === 'consume') {
      // Consumption increases Expense (Debit)
      updateMap(s.expenseLedgerId, s.amount, 0);
    }
  });

  // 3. Process Trips (Purchases, Sales, Diesel, Expenses)
  allTrips.forEach(t => {
    // A. Trip Purchases
    (t.purchases || []).forEach(p => {
      updateMap(p.supplier, 0, p.amount);
    });

    // B. Trip Sales
    (t.sales || []).forEach(s => {
      // Sale increases Customer debt (Debit)
      updateMap(s.client, s.amount, 0);
      // Payments/Discounts decrease Customer debt (Credit)
      const totalCredit = (Number(s.cashPaid) || 0) + (Number(s.onlinePaid) || 0) + (Number(s.discount) || 0);
      updateMap(s.client, 0, totalCredit);

      // Payments increase Cash/Bank ledger balance (Debit)
      if (s.cashPaid > 0) updateMap(s.cashLedger, s.cashPaid, 0);
      if (s.onlinePaid > 0) updateMap(s.onlineLedger, s.onlinePaid, 0);
    });

    // C. Trip Diesel (Credit to Station, offset if paid from ledger)
    (t.diesel?.stations || []).forEach(ds => {
      updateMap(ds.dieselStation, 0, ds.amount);
      if (ds.paymentLedger) {
        // Payment decreases ledger balance (Credit)
        updateMap(ds.paymentLedger, 0, ds.amount);
        // Payment decreases station liability (Debit)
        updateMap(ds.dieselStation, ds.amount, 0);
      }
    });

    // D. Trip Expenses (Debit Expense - for now we just track magnitude for Capital calculation if possible)
    // Note: Since trip expenses aren't linked to a specific ledger, they only affect Capital via P&L.
  });

  return map;
};

// Calculate ledger balance from opening balance + date-filtered entries
const calculateLedgerBalance = (ledger, unifiedBalanceMap) => {
  try {
    const openingSigned = toSignedValue(ledger.openingBalance || 0, ledger.openingBalanceType || 'debit');

    // Look up entries by ledger name
    const normalizedName = (ledger.name || '').toString().trim().toLowerCase();
    const entryData = unifiedBalanceMap ? unifiedBalanceMap.get(normalizedName) : null;
    const debitTotal = entryData ? entryData.debitTotal : 0;
    const creditTotal = entryData ? entryData.creditTotal : 0;

    // Balance = opening balance (signed) + debit entries - credit entries
    const balance = openingSigned + debitTotal - creditTotal;

    return {
      debitTotal,
      creditTotal,
      balance
    };
  } catch (error) {
    console.error('Error calculating ledger balance:', error);
    return { debitTotal: 0, creditTotal: 0, balance: 0 };
  }
};

// Calculate customer balance from opening balance + date-filtered entries
const calculateCustomerBalance = (customer, unifiedBalanceMap) => {
  const openingSigned = toSignedValue(customer.openingBalance || 0, customer.openingBalanceType || 'debit');

  const normalizedName = (customer.shopName || '').toString().trim().toLowerCase();
  const entryData = unifiedBalanceMap ? unifiedBalanceMap.get(normalizedName) : null;
  const debitTotal = entryData ? entryData.debitTotal : 0;
  const creditTotal = entryData ? entryData.creditTotal : 0;

  return openingSigned + debitTotal - creditTotal;
};

// Calculate vendor balance from opening balance + date-filtered entries
const calculateVendorBalance = (vendor, unifiedBalanceMap) => {
  const openingSigned = toSignedValue(vendor.openingBalance || 0, vendor.openingBalanceType || 'credit');

  const normalizedName = (vendor.vendorName || '').toString().trim().toLowerCase();
  const entryData = unifiedBalanceMap ? unifiedBalanceMap.get(normalizedName) : null;
  const debitTotal = entryData ? entryData.debitTotal : 0;
  const creditTotal = entryData ? entryData.creditTotal : 0;

  return openingSigned + debitTotal - creditTotal;
};

// Calculate diesel station balance from opening balance + date-filtered entries
const calculateDieselStationBalance = (station, unifiedBalanceMap) => {
  const openingSigned = toSignedValue(station.openingBalance || 0, station.openingBalanceType || 'credit');

  const normalizedName = (station.name || '').toString().trim().toLowerCase();
  const entryData = unifiedBalanceMap ? unifiedBalanceMap.get(normalizedName) : null;
  const debitTotal = entryData ? entryData.debitTotal : 0;
  const creditTotal = entryData ? entryData.creditTotal : 0;

  return openingSigned + debitTotal - creditTotal;
};

const calculateGroupBalance = async (group, unifiedBalanceMap, ledgerGroupMap, vendorGroupMap, customerGroupMap, dieselStationGroupMap, allVouchers, allTrips, allStocks, asOnDate = null) => {
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
    const ledgerBalance = calculateLedgerBalance(ledger, unifiedBalanceMap);
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

  // Process vendors
  const vendors = vendorGroupMap.get(groupId.toString()) || [];
  for (const vendor of vendors) {
    const balance = calculateVendorBalance(vendor, unifiedBalanceMap);
    // Assuming vendor balance is Debit - Credit (so usually negative for liability)

    if (balance >= 0) {
      totalDebit += balance;
    } else {
      totalCredit += Math.abs(balance);
    }

    totalOpeningBalance += vendor.openingBalance || 0;

    if (group.type === 'Assets') {
      totalBalance += balance;
    } else if (group.type === 'Liability') {
      totalBalance -= balance;
    }
  }

  // Process customers
  const customers = customerGroupMap.get(groupId.toString()) || [];
  for (const customer of customers) {
    const balance = calculateCustomerBalance(customer, unifiedBalanceMap);

    if (balance >= 0) {
      totalDebit += balance;
    } else {
      totalCredit += Math.abs(balance);
    }

    totalOpeningBalance += customer.openingBalance || 0;

    if (group.type === 'Assets') {
      totalBalance += balance;
    } else if (group.type === 'Liability') {
      totalBalance -= balance;
    }
  }

  // Process diesel stations
  const dieselStations = dieselStationGroupMap.get(groupId.toString()) || [];
  for (const station of dieselStations) {
    const balance = calculateDieselStationBalance(station, unifiedBalanceMap);
    if (balance >= 0) {
      totalDebit += balance;
    } else {
      totalCredit += Math.abs(balance);
    }
    totalOpeningBalance += station.openingBalance || 0;

    if (group.type === 'Assets') {
      totalBalance += balance;
    } else if (group.type === 'Liability') {
      totalBalance -= balance;
    }
  }

  // Recursively calculate children balances
  if (group.children && group.children.length > 0) {
    for (const child of group.children) {
      const childBalance = await calculateGroupBalance(child, unifiedBalanceMap, ledgerGroupMap, vendorGroupMap, customerGroupMap, dieselStationGroupMap, allVouchers, allTrips, allStocks, asOnDate);
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
const calculateCapital = async (unifiedBalanceMap, allLedgers) => {
  try {
    const incomeGroups = await Group.find({ type: 'Income', isActive: true }).select('_id').lean();
    const expenseGroups = await Group.find({ type: 'Expenses', isActive: true }).select('_id').lean();

    const incomeGroupIds = new Set(incomeGroups.map(g => g._id.toString()));
    const expenseGroupIds = new Set(expenseGroups.map(g => g._id.toString()));

    let totalIncome = 0;
    let totalExpenses = 0;

    for (const ledger of allLedgers) {
      if (!ledger.group) continue;
      const groupId = ledger.group.toString();

      if (incomeGroupIds.has(groupId)) {
        const balance = calculateLedgerBalance(ledger, unifiedBalanceMap);
        totalIncome -= balance.balance;
      } else if (expenseGroupIds.has(groupId)) {
        const balance = calculateLedgerBalance(ledger, unifiedBalanceMap);
        totalExpenses += balance.balance;
      }
    }

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
    // Query for vouchers/trips/stocks (all active)
    const queryBase = { isActive: true };
    const dateQuery = date ? { date: { $lte: date } } : {};
    const createdQuery = date ? { createdAt: { $lte: date } } : {};

    const [allLedgers, allVendors, allCustomers, allVouchers, allTrips, allStocks, assetsGroups, liabilityGroups, allDieselStations] = await Promise.all([
      Ledger.find({ isActive: true }).lean(),
      Vendor.find({ isActive: true }).lean(),
      Customer.find({ isActive: true }).lean(),
      Voucher.find({ ...queryBase, ...dateQuery }).lean(),
      Trip.find(createdQuery).lean(), // Trip uses createdAt
      InventoryStock.find({ ...dateQuery }).lean(), // InventoryStock uses date
      Group.find({ type: 'Assets', isActive: true }).populate('parentGroup', 'name type slug').lean().sort({ name: 1 }),
      Group.find({ type: 'Liability', isActive: true }).populate('parentGroup', 'name type slug').lean().sort({ name: 1 }),
      DieselStation.find({ isActive: true }).lean()
    ]);

    // Build Ledger Map (GroupId -> Ledgers)
    const ledgerGroupMap = new Map();
    allLedgers.forEach(ledger => {
      if (ledger.group) {
        const groupId = ledger.group.toString();
        if (!ledgerGroupMap.has(groupId)) ledgerGroupMap.set(groupId, []);
        ledgerGroupMap.get(groupId).push(ledger);
      }
    });

    // Build Vendor Map
    const vendorGroupMap = new Map();
    allVendors.forEach(vendor => {
      if (vendor.group) {
        const groupId = vendor.group.toString();
        if (!vendorGroupMap.has(groupId)) vendorGroupMap.set(groupId, []);
        vendorGroupMap.get(groupId).push(vendor);
      }
    });

    // Build Customer Map
    const customerGroupMap = new Map();
    allCustomers.forEach(customer => {
      if (customer.group) {
        const groupId = customer.group.toString();
        if (!customerGroupMap.has(groupId)) customerGroupMap.set(groupId, []);
        customerGroupMap.get(groupId).push(customer);
      }
    });

    // Build Diesel Station Map
    const dieselStationGroupMap = new Map();
    allDieselStations.forEach(station => {
      if (station.group) {
        const groupId = station.group.toString();
        if (!dieselStationGroupMap.has(groupId)) dieselStationGroupMap.set(groupId, []);
        dieselStationGroupMap.get(groupId).push(station);
      }
    });

    // Build tree structures
    const assetsTree = buildTree(assetsGroups);
    const liabilityTree = buildTree(liabilityGroups);

    // Build ID to Name Maps for ID resolution in Trips and Stocks
    const idToNameMap = new Map();
    allLedgers.forEach(l => idToNameMap.set(l._id.toString(), l.name));
    allVendors.forEach(v => idToNameMap.set(v._id.toString(), v.vendorName));
    allCustomers.forEach(c => idToNameMap.set(c._id.toString(), c.shopName));
    allDieselStations.forEach(d => idToNameMap.set(d._id.toString(), d.name));

    // Build unified balance map
    const unifiedBalanceMap = buildUnifiedBalanceMap(allVouchers, allTrips, allStocks, idToNameMap);

    // Calculate balances for each group (pass unified map)
    const processGroups = async (groups) => {
      const processedGroups = [];
      for (const group of groups) {
        const balance = await calculateGroupBalance(
          group,
          unifiedBalanceMap,
          ledgerGroupMap,
          vendorGroupMap,
          customerGroupMap,
          dieselStationGroupMap,
          allVouchers,
          allTrips,
          allStocks,
          date
        );
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

    // Calculate capital/equity (pass unified map)
    const capital = await calculateCapital(unifiedBalanceMap, allLedgers);

    // Calculate totals
    const calculateTotal = (groups) => {
      let total = 0;
      groups.forEach(group => {
        total += Math.abs(group.balance);
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

