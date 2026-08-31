import Trip from "../models/Trip.js";
import Group from "../models/Group.js";
import Ledger from "../models/Ledger.js";
import Voucher from "../models/Voucher.js";
import InventoryStock from "../models/InventoryStock.js";
import IndirectSale from "../models/IndirectSale.js";
import Vendor from "../models/Vendor.js";
import Customer from "../models/Customer.js";
import AppError from "../utils/AppError.js";
import { successResponse } from "../utils/responseHandler.js";
import mongoose from "mongoose";

// Helper functions (duplicated from balanceSheet.controller.js)
const buildTree = (groups) => {
    const groupMap = new Map();
    const rootGroups = [];
    const getIdString = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (id.toString) return id.toString();
        return String(id);
    };
    groups.forEach(group => {
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
    groups.forEach(group => {
        const plainGroup = group.toObject ? group.toObject() : group;
        const groupId = getIdString(plainGroup._id || plainGroup.id);
        const node = groupMap.get(groupId);
        if (node) {
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

// Helper to merge Periodic Balance into Map
const mergeToBalanceMap = (map, ledgerName, debit = 0, credit = 0) => {
    if (!ledgerName) return;
    const normalizedName = ledgerName.trim().toLowerCase();

    if (!map.has(normalizedName)) {
        map.set(normalizedName, { debitTotal: 0, creditTotal: 0 });
    }
    const entry = map.get(normalizedName);
    entry.debitTotal += debit;
    entry.creditTotal += credit;
};

// Build Period Balance Map (Vouchers + Trips + Stocks)
const buildPeriodBalanceMap = async (startDate, endDate, allLedgers) => {
    try {
        const query = { isActive: true };
        let sDate = null;
        let eDate = null;

        if (startDate) {
            sDate = new Date(startDate);
            sDate.setHours(0, 0, 0, 0);
        }
        if (endDate) {
            eDate = new Date(endDate);
            eDate.setHours(23, 59, 59, 999);
        }

        if (sDate || eDate) {
            query.date = {};
            if (sDate) query.date.$gte = sDate;
            if (eDate) query.date.$lte = eDate;
        }

        // Map ID -> Name for lookups
        const ledgerNameMap = new Map();
        allLedgers.forEach(l => {
            if (l._id && l.name) ledgerNameMap.set(l._id.toString(), l.name);
        });

        const resolveLedgerName = (nameOrId) => {
            if (!nameOrId) return null;
            const str = nameOrId.toString();
            if (ledgerNameMap.has(str)) return ledgerNameMap.get(str);
            return str;
        };

        // 1. Process Vouchers (Payment, Receipt, Journal, Contra)
        const vouchers = await Voucher.find(query).lean();
        const map = new Map();

        vouchers.forEach(v => {
            if (v.voucherType === 'Payment' || v.voucherType === 'Receipt') {
                const isPayment = v.voucherType === 'Payment';
                if (v.account) {
                    const accName = resolveLedgerName(v.account);
                    const totalAmount = (v.parties || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                    if (isPayment) mergeToBalanceMap(map, accName, 0, totalAmount);
                    else mergeToBalanceMap(map, accName, totalAmount, 0);
                }
                if (v.parties) {
                    v.parties.forEach(p => {
                        if (p.partyId) {
                            const partyName = resolveLedgerName(p.partyId);
                            if (isPayment) mergeToBalanceMap(map, partyName, Number(p.amount) || 0, 0);
                            else mergeToBalanceMap(map, partyName, 0, Number(p.amount) || 0);
                        }
                    });
                }
            } else {
                if (v.entries && v.entries.length > 0) {
                    v.entries.forEach(e => {
                        if (e.account) {
                            const accName = resolveLedgerName(e.account);
                            mergeToBalanceMap(map, accName, Number(e.debitAmount) || 0, Number(e.creditAmount) || 0);
                        }
                    });
                }
            }
        });

        // 2. Process Trips (Date filtering on date / createdAt)
        const tripDateQuery = {};
        if (sDate) tripDateQuery.$gte = sDate;
        if (eDate) tripDateQuery.$lte = eDate;

        let tQuery = {};
        if (sDate || eDate) {
            tQuery.$or = [
                { date: tripDateQuery },
                { createdAt: tripDateQuery }
            ];
        }

        const trips = await Trip.find(tQuery).lean();

        trips.forEach(t => {
            if (t.sales) {
                t.sales.forEach(s => {
                    // Cash Sale -> Debit Cash Ledger
                    if (s.cashLedger) {
                        const name = ledgerNameMap.get(s.cashLedger.toString());
                        if (name) mergeToBalanceMap(map, name, s.cashPaid || 0, 0);
                    }
                    // Online Sale -> Debit Bank(Online) Ledger
                    if (s.onlineLedger) {
                        const name = ledgerNameMap.get(s.onlineLedger.toString());
                        if (name) mergeToBalanceMap(map, name, s.onlinePaid || 0, 0);
                    }
                });
            }
        });

        // 3. Process Stocks (Date filtering on date)
        const stockDateQuery = {};
        if (sDate) stockDateQuery.$gte = sDate;
        if (eDate) stockDateQuery.$lte = eDate;

        let sQuery = {};
        if (sDate || eDate) sQuery.date = stockDateQuery;

        const stocks = await InventoryStock.find(sQuery).lean();

        stocks.forEach(s => {
            const amt = Number(s.amount) || ((Number(s.weight) || Number(s.feedQty) || 0) * (Number(s.rate) || 0)) || 0;

            // Expense
            if (s.expenseLedgerId) {
                const name = ledgerNameMap.get(s.expenseLedgerId.toString());
                if (name) mergeToBalanceMap(map, name, amt, 0); // Debit Expense
            }

            const stType = (s.type || '').toString().toLowerCase();
            if (stType === 'consume' || stType === 'feed_consume' || stType === 'consumption') {
                mergeToBalanceMap(map, 'FEED CONSUME', amt, 0);
                mergeToBalanceMap(map, 'FEED CONSUMPTION', amt, 0);
                mergeToBalanceMap(map, 'FEED CUNSUMTION', amt, 0);
            }

            // Cash/Online Payments/Receipts handling
            // Purchase/Opening -> Credit Cash/Bank
            // Sale/Receipt -> Debit Cash/Bank

            const isCredit = (s.type === 'purchase' || s.type === 'opening');

            if (s.cashLedgerId) {
                const name = ledgerNameMap.get(s.cashLedgerId.toString());
                if (name) {
                    const amt = s.cashPaid || 0;
                    if (isCredit) mergeToBalanceMap(map, name, 0, amt);
                    else mergeToBalanceMap(map, name, amt, 0);
                }
            }

            if (s.onlineLedgerId) {
                const name = ledgerNameMap.get(s.onlineLedgerId.toString());
                if (name) {
                    const amt = s.onlinePaid || 0;
                    if (isCredit) mergeToBalanceMap(map, name, 0, amt);
                    else mergeToBalanceMap(map, name, amt, 0);
                }
            }
        });

        return map;
    } catch (error) {
        console.error('Error building period balance map:', error);
        return new Map();
    }
};

const calculateLedgerBalance = (ledger, balanceMap) => {
    try {
        const ledgerName = typeof ledger === 'string' ? ledger : (ledger?.name || '');
        const normalizedName = ledgerName.toString().trim().toLowerCase();
        const balance = balanceMap.get(normalizedName) || { debitTotal: 0, creditTotal: 0 };

        let opDebit = 0;
        let opCredit = 0;
        if (typeof ledger === 'object' && ledger && ledger.openingBalance) {
            const amt = Number(ledger.openingBalance) || 0;
            if (ledger.openingBalanceType === 'credit') {
                opCredit = amt;
            } else {
                opDebit = amt;
            }
        }

        const debitTotal = balance.debitTotal + opDebit;
        const creditTotal = balance.creditTotal + opCredit;

        return {
            debitTotal,
            creditTotal,
            balance: debitTotal - creditTotal
        };
    } catch (error) {
        return { debitTotal: 0, creditTotal: 0, balance: 0 };
    }
};

const calculateGroupBalance = async (group, balanceMap, ledgerGroupMap) => {
    let totalBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const groupId = group.id || group._id;
    const ledgers = ledgerGroupMap.get(groupId.toString()) || [];

    for (const ledger of ledgers) {
        const ledgerBalance = calculateLedgerBalance(ledger, balanceMap);
        totalDebit += ledgerBalance.debitTotal;
        totalCredit += ledgerBalance.creditTotal;

        // P&L Logic
        // Income (Credit nature): Credit - Debit (Positive Income means Credit > Debit)
        // Expenses (Debit nature): Debit - Credit (Positive Expense means Debit > Credit)
        if (group.type === 'Income') {
            totalBalance += (ledgerBalance.creditTotal - ledgerBalance.debitTotal);
        } else if (group.type === 'Expenses' || group.type === 'Assets') {
            totalBalance += (ledgerBalance.debitTotal - ledgerBalance.creditTotal);
        }
    }

    if (group.children && group.children.length > 0) {
        for (const child of group.children) {
            const childBalance = await calculateGroupBalance(child, balanceMap, ledgerGroupMap);
            totalBalance += childBalance.totalBalance;
            totalDebit += childBalance.totalDebit;
            totalCredit += childBalance.totalCredit;
        }
    }
    return { totalBalance, totalDebit, totalCredit };
};


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


export const getProfitAndLoss = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;

        // Fetch data
        const [allLedgers, allGroupsData] = await Promise.all([
            Ledger.find({ isActive: true }).lean(),
            Group.find({ isActive: true }).populate('parentGroup', 'name type slug').lean().sort({ name: 1 })
        ]);

        // Build Comprehensive Map
        const periodBalanceMap = await buildPeriodBalanceMap(startDate, endDate, allLedgers);

        // Map Ledgers to Groups
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

        // Build Full Tree of all active groups
        const fullTree = buildTree(allGroupsData);

        // Separate groups into respective sides
        const incomeGroups = fullTree.filter(g => g.type === 'Income');
        const expenseGroups = fullTree.filter(g => g.type === 'Expenses');

        // Opening Stock -> Expenses, Closing Stock -> Income (including their sub-groups)
        const openingStock = fullTree.find(g => g.name === 'Opening Stock');
        if (openingStock && openingStock.type !== 'Expenses') {
            expenseGroups.push(openingStock);
        }

        const closingStock = fullTree.find(g => g.name === 'Closing Stock');
        if (closingStock && closingStock.type !== 'Income') {
            incomeGroups.push(closingStock);
        }

        // Process Groups (calculates balances combining child balances)
        const processGroups = async (groups) => {
            const processedGroups = [];
            for (const group of groups) {
                const balance = await calculateGroupBalance(group, periodBalanceMap, ledgerGroupMap);
                const groupId = group._id || group.id;
                const processedGroup = {
                    _id: groupId,
                    id: groupId,
                    name: group.name,
                    slug: group.slug,
                    type: group.type,
                    parentGroup: group.parentGroup,
                    balance: balance.totalBalance,
                    debitTotal: balance.totalDebit,
                    creditTotal: balance.totalCredit,
                    children: group.children && group.children.length > 0
                        ? await processGroups(group.children)
                        : [],
                    ledgers: []
                };
                processedGroups.push(processedGroup);
            }
            return processedGroups;
        };

        const processedIncome = await processGroups(incomeGroups);
        const processedExpenses = await processGroups(expenseGroups);

        const injectNatives = async (incomeList, expenseList, startDate, endDate) => {
            let sDate = startDate ? new Date(startDate) : new Date(0);
            let eDate = endDate ? new Date(endDate) : new Date();
            // ensure eDate goes to end of day
            eDate.setHours(23, 59, 59, 999);

            const [stocks, trips, isales, allVendors, allCustomers] = await Promise.all([
                InventoryStock.find({ date: { $lte: eDate } }).lean(),
                Trip.find({ date: { $lte: eDate } }).lean(),
                IndirectSale.find({ date: { $gte: sDate, $lte: eDate } }).lean(),
                Vendor.find({ isActive: true }).lean(),
                Customer.find({ isActive: true }).lean()
            ]);

            let metricPurchase = 0;
            let metricFeedPurchase = 0;
            let metricSales = 0;
            let metricBirdSales = 0;
            let metricFeedSales = 0;
            let metricMortality = 0;
            let metricWeightLoss = 0;
            let metricTripExpenses = 0;
            let metricFeedConsume = 0;

            let c_pWt = 0; let c_pAmt = 0; let c_outWt = 0;
            let prevDate = new Date(sDate.getTime() - 1);
            let o_pWt = 0; let o_pAmt = 0; let o_outWt = 0;

            // Feed stock cumulative trackers
            let c_fpWt = 0; let c_fpAmt = 0; let c_fOutWt = 0;
            let o_fpWt = 0; let o_fpAmt = 0; let o_fOutWt = 0;

            trips.forEach(t => {
                const tDate = new Date(t.date);
                const tDateIsPeriod = tDate >= sDate && tDate <= eDate;

                if (tDateIsPeriod) {
                    metricPurchase += (t.summary?.totalPurchaseAmount || 0);
                    const tripSalesAmt = (t.summary?.totalSalesAmount || 0);
                    metricSales += tripSalesAmt;
                    metricBirdSales += tripSalesAmt;
                    if (t.expenses) t.expenses.forEach(e => metricTripExpenses += (e.amount || 0));
                    if (t.losses) t.losses.forEach(l => {
                        const lDate = new Date(l.date);
                        if (lDate >= sDate && lDate <= eDate) metricMortality += (l.total || 0);
                    });
                    metricWeightLoss += ((t.summary?.birdWeightLoss || 0) * (t.summary?.avgPurchaseRate || 0));
                }
                if (t.stocks && t.stocks.length > 0) {
                    t.stocks.forEach(st => {
                        const stDate = new Date(st.addedAt || tDate);
                        if (stDate <= eDate) { c_pWt += (st.weight || 0); c_pAmt += (st.value || 0); }
                        if (stDate <= prevDate) { o_pWt += (st.weight || 0); o_pAmt += (st.value || 0); }
                    });
                }
            });

            stocks.forEach(s => {
                let sDateVal = s.date ? new Date(s.date) : (s.createdAt ? new Date(s.createdAt) : new Date(0));
                if (isNaN(sDateVal.getTime())) sDateVal = new Date(0);
                const isPeriod = sDateVal >= sDate && sDateVal <= eDate;

                if (s.inventoryType === 'bird') {
                    if (s.type === 'purchase' || s.type === 'opening') {
                        if (sDateVal <= eDate) { c_pWt += (s.weight || 0); c_pAmt += (s.amount || 0); }
                        if (sDateVal <= prevDate) { o_pWt += (s.weight || 0); o_pAmt += (s.amount || 0); }
                    } else {
                        if (sDateVal <= eDate) c_outWt += (s.weight || 0);
                        if (sDateVal <= prevDate) o_outWt += (s.weight || 0);
                    }
                }

                if (s.inventoryType === 'feed') {
                    if (s.type === 'purchase' || s.type === 'opening') {
                        if (sDateVal <= eDate) { c_fpWt += (s.weight || 0); c_fpAmt += (s.amount || 0); }
                        if (sDateVal <= prevDate) { o_fpWt += (s.weight || 0); o_fpAmt += (s.amount || 0); }
                    } else {
                        if (sDateVal <= eDate) c_fOutWt += (s.weight || 0);
                        if (sDateVal <= prevDate) o_fOutWt += (s.weight || 0);
                    }
                }

                let amt = Number(s.amount) || ((Number(s.weight) || Number(s.feedQty) || Number(s.bags) || 0) * (Number(s.rate) || 0)) || 0;
                const stType = (s.type || '').toString().toLowerCase();

                if (stType === 'consume' || stType === 'feed_consume' || stType === 'consumption' || stType.includes('consume') || stType.includes('cunsum')) {
                    if (isPeriod || !startDate) {
                        metricFeedConsume += amt;
                    }
                }

                if (isPeriod) {
                    if (s.type === 'purchase') {
                        if (s.inventoryType === 'feed') {
                            metricFeedPurchase += amt;
                        } else {
                            metricPurchase += amt;
                        }
                    }
                    if (s.type === 'sale') {
                        metricSales += amt;
                        if (s.inventoryType === 'feed') {
                            metricFeedSales += amt;
                        } else {
                            metricBirdSales += amt;
                        }
                    }
                    if (s.type === 'mortality') metricMortality += amt;
                    if (s.type === 'weight_loss' || s.type === 'natural_weight_loss') metricWeightLoss += amt;
                }
            });

            isales.forEach(s => {
                metricPurchase += (s.summary?.totalPurchaseAmount || 0);
                const indSaleAmt = (s.summary?.salesAmount || 0);
                metricSales += indSaleAmt;
                metricBirdSales += indSaleAmt;
                metricMortality += (s.mortality?.amount || 0);
            });

            const oRate = o_pWt > 0 ? (o_pAmt / o_pWt) : 0;
            const cRate = c_pWt > 0 ? (c_pAmt / c_pWt) : 0;
            const oFRate = o_fpWt > 0 ? (o_fpAmt / o_fpWt) : 0;
            const cFRate = c_fpWt > 0 ? (c_fpAmt / c_fpWt) : 0;

            const metricOpeningStockLegacy = Math.max(0, c_pWt - c_outWt) * cRate; // legacy for LIVE POULTRY BIRDS inClosing

            // Compute period-based opening and closing stocks
            const tripStocks = [];
            trips.forEach(t => {
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
            const combinedStocks = [...stocks, ...tripStocks].sort((a, b) => new Date(a.date) - new Date(b.date));

            const metricBirdsOpeningStock = getOpeningStockValue(combinedStocks, 'bird', sDate, eDate);
            const metricFeedOpeningStock = getOpeningStockValue(combinedStocks, 'feed', sDate, eDate);

            const metricBirdsClosingStock = calculateStockValue(combinedStocks, 'bird', eDate);
            const metricFeedClosingStock = calculateStockValue(combinedStocks, 'feed', eDate);

            const metricOpeningStock = metricBirdsOpeningStock + metricFeedOpeningStock;
            const metricClosingStock = metricBirdsClosingStock + metricFeedClosingStock;

            const updateTrees = (grpList, isOpeningParent = false, isClosingParent = false) => {
                let diffAccumulator = 0;
                grpList.forEach(g => {
                    const name = g.name.trim().toUpperCase();
                    const inOpening = isOpeningParent || name === 'OPENING STOCK';
                    const inClosing = isClosingParent || name === 'CLOSING STOCK';

                    let childDiff = 0;
                    if (g.children && g.children.length > 0) {
                        childDiff = updateTrees(g.children, inOpening, inClosing);
                    }

                    let oldBalance = g.balance || 0;
                    let targetValue = null;

                    if (name.includes('POULTRY FEED PURCHASE')) targetValue = metricFeedPurchase;
                    else if (name.includes('LIVE POULTRY BIRDS PURCHASE') || name.includes('LIVE POULTRY BIRDS PURCHASES')) targetValue = metricPurchase;
                    else if (name.includes('LIVE POULTRY BIRDS SALES') || (name.includes('LIVE POULTRY BIRDS') && name.includes('SALES'))) targetValue = metricSales;
                    else if (name.includes('BIRDS MORTALITY')) targetValue = metricMortality;
                    else if (name.includes('BIRDS WEIGHT LOSS')) targetValue = metricWeightLoss;
                    else if (name.includes('TRIP EXPENSES')) targetValue = metricTripExpenses;
                    else if (name.includes('FEED CONSUMPTION') || name.includes('FEED CUNSUMTION') || name.includes('FEED CONSUME') || name.includes('FEED CONSUMED') || (name.includes('FEED') && (name.includes('CONSUM') || name.includes('CUNSUM')))) {
                        targetValue = metricFeedConsume > 0 ? metricFeedConsume : oldBalance;
                    }
                    else if (name === 'BIRDS STOCK' && inClosing) targetValue = metricBirdsClosingStock;
                    else if (name === 'FEED STOCK' && inClosing) targetValue = metricFeedClosingStock;
                    else if (name === 'BIRDS OPENING STOCK') targetValue = metricBirdsOpeningStock;
                    else if (name === 'FEED OPENING STOCK') targetValue = metricFeedOpeningStock;
                    else if (name.includes('LIVE POULTRY BIRDS') && inOpening) targetValue = metricOpeningStock;
                    else if (name.includes('LIVE POULTRY BIRDS') && inClosing) targetValue = metricClosingStock;
                    else if (name === 'OPENING STOCK') {
                        targetValue = metricOpeningStock;
                        g.children = [
                            {
                                _id: 'birds-opening-stock',
                                id: 'birds-opening-stock',
                                name: 'Birds Opening Stock',
                                slug: 'birds-opening-stock',
                                type: 'Expenses',
                                balance: metricBirdsOpeningStock,
                                debitTotal: metricBirdsOpeningStock,
                                creditTotal: 0,
                                children: [],
                                ledgers: []
                            },
                            {
                                _id: 'feed-opening-stock',
                                id: 'feed-opening-stock',
                                name: 'Feed Opening Stock',
                                slug: 'feed-opening-stock',
                                type: 'Expenses',
                                balance: metricFeedOpeningStock,
                                debitTotal: metricFeedOpeningStock,
                                creditTotal: 0,
                                children: [],
                                ledgers: []
                            }
                        ];
                    }
                    else if (name === 'CLOSING STOCK') {
                        targetValue = metricClosingStock;
                        g.children = [
                            {
                                _id: 'birds-closing-stock',
                                id: 'birds-closing-stock',
                                name: 'Birds Closing Stock',
                                slug: 'birds-closing-stock',
                                type: 'Income',
                                balance: metricBirdsClosingStock,
                                debitTotal: 0,
                                creditTotal: metricBirdsClosingStock,
                                children: [],
                                ledgers: []
                            },
                            {
                                _id: 'feed-closing-stock',
                                id: 'feed-closing-stock',
                                name: 'Feed Closing Stock',
                                slug: 'feed-closing-stock',
                                type: 'Income',
                                balance: metricFeedClosingStock,
                                debitTotal: 0,
                                creditTotal: metricFeedClosingStock,
                                children: [],
                                ledgers: []
                            }
                        ];
                    }
                    else if (name === 'PURCHASE ACCOUNTS') {
                        targetValue = metricPurchase + metricFeedPurchase;

                        g.children = [
                            {
                                _id: 'birds-purchase',
                                id: 'birds-purchase',
                                name: 'Birds Purchase',
                                slug: 'birds-purchase',
                                type: 'Expenses',
                                balance: metricPurchase,
                                debitTotal: metricPurchase,
                                creditTotal: 0,
                                children: [],
                                ledgers: []
                            },
                            {
                                _id: 'feed-purchase',
                                id: 'feed-purchase',
                                name: 'Feed Purchase',
                                slug: 'feed-purchase',
                                type: 'Expenses',
                                balance: metricFeedPurchase,
                                debitTotal: metricFeedPurchase,
                                creditTotal: 0,
                                children: [],
                                ledgers: []
                            }
                        ];
                    }
                    else if (name === 'SALES ACCOUNTS') {
                        targetValue = metricSales;

                        g.children = [
                            {
                                _id: 'birds-sales',
                                id: 'birds-sales',
                                name: 'Birds Sales',
                                slug: 'birds-sales',
                                type: 'Income',
                                balance: metricBirdSales,
                                debitTotal: 0,
                                creditTotal: metricBirdSales,
                                children: [],
                                ledgers: []
                            },
                            {
                                _id: 'feed-sales',
                                id: 'feed-sales',
                                name: 'Feed Sales',
                                slug: 'feed-sales',
                                type: 'Income',
                                balance: metricFeedSales,
                                debitTotal: 0,
                                creditTotal: metricFeedSales,
                                children: [],
                                ledgers: []
                            }
                        ];
                    }
                    else if (name === 'OPENING STOCK') targetValue = metricOpeningStock;
                    else if (name === 'CLOSING STOCK') targetValue = metricClosingStock;

                    if (targetValue !== null) {
                        const localDiff = targetValue - oldBalance;
                        g.balance = targetValue;
                        diffAccumulator += localDiff + childDiff;
                    } else if (childDiff !== 0) {
                        g.balance += childDiff;
                        diffAccumulator += childDiff;
                    }
                });
                return diffAccumulator;
            };

            updateTrees(incomeList);
            updateTrees(expenseList);
        };

        await injectNatives(processedIncome, processedExpenses, startDate, endDate);

        // Calculate Totals - using the processed root groups
        const calculateTotal = (groups) => {
            let total = 0;
            groups.forEach(group => {
                total += (group.balance || 0);
            });
            return total;
        };

        const totalIncome = calculateTotal(processedIncome);
        const totalExpenses = calculateTotal(processedExpenses);
        const netProfit = totalIncome - totalExpenses;

        successResponse(res, "Profit and Loss data retrieved", 200, {
            income: {
                groups: processedIncome,
                total: totalIncome
            },
            expenses: {
                groups: processedExpenses,
                total: totalExpenses
            },
            totals: {
                totalIncome,
                totalExpenses,
                netProfit
            }
        });

    } catch (error) {
        next(error);
    }
};

export const getStats = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;

        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.date = {};
            if (startDate) dateFilter.date.$gte = new Date(startDate);
            if (endDate) dateFilter.date.$lte = new Date(endDate);
        }

        let userFilter = {};
        if (req.user.role === 'supervisor') {
            userFilter.supervisor = new mongoose.Types.ObjectId(req.user._id);
        }

        const query = { ...dateFilter, ...userFilter };

        const stats = await Trip.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalTrips: { $sum: 1 },
                    completedTrips: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    totalSales: { $sum: '$summary.totalSalesAmount' },
                    totalPurchases: { $sum: '$summary.totalPurchaseAmount' },
                    totalProfit: { $sum: '$summary.netProfit' },
                    totalBirdsSold: { $sum: '$summary.totalBirdsSold' },
                    totalWeightSold: { $sum: '$summary.totalWeightSold' }
                }
            }
        ]);

        const dashboardStats = stats[0] || {
            totalTrips: 0,
            completedTrips: 0,
            totalSales: 0,
            totalPurchases: 0,
            totalProfit: 0,
            totalBirdsSold: 0,
            totalWeightSold: 0
        };

        // Recent trips
        const recentTrips = await Trip.find(query)
            .populate('vehicle', 'vehicleNumber')
            .populate('supervisor', 'name')
            .sort({ createdAt: -1 })
            .limit(5);

        successResponse(res, "dashboard stats", 200, {
            stats: dashboardStats,
            recentTrips
        })
    } catch (error) {
        next(error)
    }
}