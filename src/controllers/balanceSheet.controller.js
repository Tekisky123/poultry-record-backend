import Group from "../models/Group.js";
import Ledger from "../models/Ledger.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import InventoryStock from "../models/InventoryStock.js";
import Voucher from "../models/Voucher.js";
import Trip from "../models/Trip.js";
import DieselStation from "../models/DieselStation.js";
import IndirectSale from "../models/IndirectSale.js";
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
const buildUnifiedBalanceMap = (allVouchers, allTrips, allStocks, allIndirectSales, idToNameMap) => {
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
    if (v.voucherType === 'Payment' || v.voucherType === 'Receipt') {
      const isPayment = v.voucherType === 'Payment';
      if (v.account) {
        const totalAmount = (v.parties || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        if (isPayment) {
          // Payment: Credit header account
          updateMap(v.account, 0, totalAmount);
        } else {
          // Receipt: Debit header account
          updateMap(v.account, totalAmount, 0);
        }
      }
      (v.parties || []).forEach(p => {
        if (p.partyId) {
          if (isPayment) {
            // Payment: Debit party account
            updateMap(p.partyId, p.amount, 0);
          } else {
            // Receipt: Credit party account
            updateMap(p.partyId, 0, p.amount);
          }
        }
      });
    } else {
      (v.entries || []).forEach(e => {
        updateMap(e.account, e.debitAmount, e.creditAmount);
      });
    }
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
      updateMap(p.supplier || p.vendorName, 0, p.amount);
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
  });

  // 4. Process Indirect Sales
  (allIndirectSales || []).forEach(s => {
    updateMap(s.customer, s.summary?.salesAmount || 0, 0);
    updateMap(s.vendor, 0, s.summary?.totalPurchaseAmount || 0);
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

const calculateGroupBalance = async (group, unifiedBalanceMap, ledgerGroupMap, vendorGroupMap, customerGroupMap, dieselStationGroupMap, allVouchers, allTrips, allStocks, asOnDate = null, stockMetrics = null) => {
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
      const childBalance = await calculateGroupBalance(child, unifiedBalanceMap, ledgerGroupMap, vendorGroupMap, customerGroupMap, dieselStationGroupMap, allVouchers, allTrips, allStocks, asOnDate, stockMetrics);
      totalBalance += childBalance.totalBalance;
      totalDebit += childBalance.totalDebit;
      totalCredit += childBalance.totalCredit;
      totalOpeningBalance += childBalance.totalOpeningBalance;
      totalOutstandingBalance += childBalance.totalOutstandingBalance;
    }
  }

  // Override stock group balances if stockMetrics are provided
  if (stockMetrics) {
    const groupSlug = group.slug ? group.slug.trim().toLowerCase() : '';
    const groupName = group.name ? group.name.trim().toUpperCase() : '';

    if (groupSlug === 'stock-in-hand' || groupName === 'STOCK-IN-HAND' || groupName === 'STOCK IN HAND') {
      totalBalance = stockMetrics.totalClosingStock;
    } else if (groupSlug === 'birds-stock' || groupName === 'BIRDS STOCK') {
      totalBalance = stockMetrics.metricBirdsClosingStock;
    } else if (groupSlug === 'feed-stock' || groupName === 'FEED STOCK') {
      totalBalance = stockMetrics.metricFeedClosingStock;
    }
  }

  return { totalBalance, totalDebit, totalCredit, totalOpeningBalance, totalOutstandingBalance };
};

// Calculate Capital/Equity (Income - Expenses) - optimized
const calculateCapital = async (
  unifiedBalanceMap,
  allLedgers,
  openingStockValue = 0,
  closingStockValue = 0,
  totalPeriodPurchases = 0,
  totalPeriodSales = 0
) => {
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

    return (totalIncome + closingStockValue + totalPeriodSales) - (totalExpenses + openingStockValue + totalPeriodPurchases);
  } catch (error) {
    console.error('Error calculating capital:', error);
    return 0;
  }
};

// Helpers for stock calculations
const calculateStockValue = (combinedStocks, inventoryType, targetDate) => {
  const typeStocks = combinedStocks.filter(s => s.inventoryType === inventoryType);
  const firstOpStock = typeStocks.find(s => s.type === 'opening');
  let fyAnchorDate = new Date(0);
  if (firstOpStock) {
    const bOpDate = new Date(firstOpStock.date);
    const bOpYear = bOpDate.getFullYear();
    const bOpMonth = bOpDate.getMonth();
    const bOpFyStartYear = bOpMonth >= 3 ? bOpYear : bOpYear - 1;
    fyAnchorDate = new Date(`${bOpFyStartYear}-04-01T00:00:00.000Z`);
  }

  let pBags = 0, pWt = 0, pAmt = 0;
  let outBags = 0, outWt = 0, outAmt = 0;

  typeStocks.forEach(s => {
    const date = new Date(s.date);
    if (date > targetDate) return;

    if (s.type === 'opening') {
      if (!firstOpStock || s._id?.toString() !== firstOpStock._id?.toString()) return;
    } else {
      if (date < fyAnchorDate) return;
    }

    const b = Number(s.bags) || 0;
    const w = Number(s.weight) || 0;
    const amt = Number(s.amount) || 0;

    if (s.type === 'purchase' || s.type === 'opening') {
      pBags += b;
      pWt += w;
      pAmt += amt;
    } else {
      outBags += b;
      outWt += w;
      outAmt += amt;
    }
  });

  if (inventoryType === 'bird') {
    const closingWeight = pWt - outWt;
    const avgRate = pWt > 0 ? (pAmt / pWt) : 0;
    return closingWeight * avgRate;
  } else {
    return pAmt - outAmt;
  }
};

const getOpeningStockValue = (combinedStocks, inventoryType, startDate, endDate) => {
  const sDate = new Date(startDate);
  const eDate = new Date(endDate);
  eDate.setHours(23, 59, 59, 999);

  // 1. Stock value just before the period
  const beforePeriodDate = new Date(sDate.getTime() - 1);
  const valBefore = calculateStockValue(combinedStocks, inventoryType, beforePeriodDate);

  // 2. Any opening stock documents within the period
  let valWithin = 0;
  const typeStocks = combinedStocks.filter(s => s.inventoryType === inventoryType && s.type === 'opening');
  if (typeStocks.length > 0) {
    const allTypeStocks = combinedStocks.filter(s => s.inventoryType === inventoryType);
    const firstOpStock = allTypeStocks.find(s => s.type === 'opening');
    
    typeStocks.forEach(s => {
      const date = new Date(s.date);
      if (date >= sDate && date <= eDate) {
        if (firstOpStock && s._id?.toString() === firstOpStock._id?.toString()) {
          valWithin += Number(s.amount) || 0;
        }
      }
    });
  }

  return valBefore + valWithin;
};

// Get balance sheet data
export const getBalanceSheet = async (req, res, next) => {
  try {
    const { asOnDate } = req.query;
    const date = asOnDate ? new Date(asOnDate) : new Date();
    if (asOnDate) {
      date.setHours(23, 59, 59, 999);
    }

    // OPTIMIZATION: batch fetch all needed data
    // Query for vouchers/trips/stocks (all active)
    const queryBase = { isActive: true };
    const dateQuery = date ? { date: { $lte: date } } : {};
    const createdQuery = date ? { createdAt: { $lte: date } } : {};

    const [allLedgers, allVendors, allCustomers, allVouchers, allTrips, allStocks, assetsGroups, liabilityGroups, allDieselStations, allIndirectSales] = await Promise.all([
      Ledger.find({ isActive: true }).lean(),
      Vendor.find({ isActive: true }).lean(),
      Customer.find({ isActive: true }).lean(),
      Voucher.find({ ...queryBase, ...dateQuery }).lean(),
      Trip.find(createdQuery).lean(), // Trip uses createdAt
      InventoryStock.find({ ...dateQuery }).lean(), // InventoryStock uses date
      Group.find({ type: 'Assets', isActive: true }).populate('parentGroup', 'name type slug').lean().sort({ name: 1 }),
      Group.find({ type: 'Liability', isActive: true }).populate('parentGroup', 'name type slug').lean().sort({ name: 1 }),
      DieselStation.find({ isActive: true }).lean(),
      IndirectSale.find({ ...dateQuery }).lean() // IndirectSale uses date
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
    const unifiedBalanceMap = buildUnifiedBalanceMap(allVouchers, allTrips, allStocks, allIndirectSales, idToNameMap);

    // Build combinedStocks
    const tripStocks = [];
    allTrips.forEach(t => {
      if (t.stocks && t.stocks.length > 0) {
        t.stocks.forEach(st => {
          tripStocks.push({
            _id: st._id,
            type: 'purchase',
            inventoryType: 'bird',
            date: st.addedAt || t.date,
            weight: Number(st.weight) || 0,
            amount: Number(st.value) || 0,
            rate: Number(st.rate) || 0
          });
        });
      }
    });
    const combinedStocks = [...allStocks, ...tripStocks].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate fiscal year start
    const fyStartYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    const fyStart = new Date(`${fyStartYear}-04-01T00:00:00.000Z`);

    // Calculate total purchases and sales from fyStart to date
    let metricPurchase = 0;
    let metricFeedPurchase = 0;
    let metricSales = 0;

    // 1. From Trips
    allTrips.forEach(t => {
      const tDate = new Date(t.date);
      if (tDate >= fyStart && tDate <= date) {
        metricPurchase += (t.summary?.totalPurchaseAmount || 0);
        metricSales += (t.summary?.totalSalesAmount || 0);
      }
    });

    // 2. From Stocks
    allStocks.forEach(s => {
      const sDateVal = new Date(s.date);
      if (sDateVal >= fyStart && sDateVal <= date) {
        let amt = s.amount || (s.weight * s.rate) || 0;
        if (s.type === 'purchase') {
          if (s.inventoryType === 'feed') {
            metricFeedPurchase += amt;
          } else {
            metricPurchase += amt;
          }
        }
        if (s.type === 'sale') metricSales += amt;
      }
    });

    // 3. From Indirect Sales
    allIndirectSales.forEach(s => {
      const sDateVal = new Date(s.date);
      if (sDateVal >= fyStart && sDateVal <= date) {
        metricPurchase += (s.summary?.totalPurchaseAmount || 0);
        metricSales += (s.summary?.salesAmount || 0);
      }
    });

    const totalPeriodPurchases = metricPurchase + metricFeedPurchase;
    const totalPeriodSales = metricSales;

    // Calculate opening and closing stock values
    const birdsOpeningStockValue = getOpeningStockValue(combinedStocks, 'bird', fyStart, date);
    const feedOpeningStockValue = getOpeningStockValue(combinedStocks, 'feed', fyStart, date);
    
    const birdsClosingStockValue = calculateStockValue(combinedStocks, 'bird', date);
    const feedClosingStockValue = calculateStockValue(combinedStocks, 'feed', date);

    const totalOpeningStock = birdsOpeningStockValue + feedOpeningStockValue;
    const totalClosingStock = birdsClosingStockValue + feedClosingStockValue;

    const stockMetrics = {
      totalClosingStock,
      metricBirdsClosingStock: birdsClosingStockValue,
      metricFeedClosingStock: feedClosingStockValue
    };

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
          date,
          stockMetrics
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

    // Calculate total assets and liabilities using signed values to ensure mathematical correctness
    const calculateTotalSigned = (groups) => {
      let total = 0;
      groups.forEach(group => {
        total += group.balance;
      });
      return total;
    };

    const totalAssets = calculateTotalSigned(processedAssets);
    const totalLiabilities = calculateTotalSigned(processedLiabilities);
    const capital = totalAssets - totalLiabilities;
    const totalCapital = capital;
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

