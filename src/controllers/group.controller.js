import Group from "../models/Group.js";
import Ledger from "../models/Ledger.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import Voucher from "../models/Voucher.js";
import Trip from "../models/Trip.js";
import InventoryStock from "../models/InventoryStock.js";
import IndirectSale from "../models/IndirectSale.js";
import DieselStation from "../models/DieselStation.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";
import { toSignedValue, fromSignedValue } from "../utils/balanceUtils.js";

// Helper function to check for circular references
const checkCircularReference = async (groupId, parentGroupId) => {
    if (!parentGroupId) return true;

    // Convert to string for comparison, handle null groupId (for new groups)
    const groupIdStr = groupId ? groupId.toString() : null;
    const parentGroupIdStr = parentGroupId.toString();

    if (groupIdStr && groupIdStr === parentGroupIdStr) {
        throw new AppError('A group cannot be its own parent', 400);
    }

    let currentParentId = parentGroupId;
    const visited = new Set();

    // Only add groupId to visited set if it exists (not null for new groups)
    if (groupIdStr) {
        visited.add(groupIdStr);
    }

    while (currentParentId) {
        const currentParentIdStr = currentParentId.toString();
        if (visited.has(currentParentIdStr)) {
            throw new AppError('Circular reference detected. This would create an infinite loop.', 400);
        }
        visited.add(currentParentIdStr);

        const parent = await Group.findById(currentParentId);
        if (!parent) break;
        currentParentId = parent.parentGroup;
    }

    return true;
};

export const addGroup = async (req, res, next) => {
    try {
        const { name, type, parentGroup } = req.body;

        // Validate parent group exists if provided
        if (parentGroup) {
            const parent = await Group.findById(parentGroup);
            if (!parent || !parent.isActive) {
                throw new AppError('Parent group not found or inactive', 404);
            }
            // Check for circular reference
            await checkCircularReference(null, parentGroup);
        }

        const groupData = {
            name,
            type,
            parentGroup: parentGroup || null,
            createdBy: req.user._id,
            updatedBy: req.user._id
        };

        const group = new Group(groupData);
        await group.save();

        const populatedGroup = await Group.findById(group._id)
            .populate('parentGroup', 'name type slug')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "New group added", 201, populatedGroup);
    } catch (error) {
        next(error);
    }
};

export const getGroups = async (req, res, next) => {
    try {
        const { type } = req.query;
        const query = { isActive: true };

        if (type) {
            query.type = type;
        }

        // Parallel fetch of groups and ledger counts
        const [groups, ledgerCounts] = await Promise.all([
            Group.find(query)
                .populate('parentGroup', 'name type slug')
                .populate('createdBy', 'name')
                .populate('updatedBy', 'name')
                .sort({ name: 1 })
                .lean(),
            Ledger.aggregate([
                { $match: { isActive: true, group: { $exists: true, $ne: null } } },
                { $group: { _id: '$group', count: { $sum: 1 } } }
            ])
        ]);

        // Create a map of groupId -> ledger count
        const countMap = {};
        ledgerCounts.forEach(item => {
            if (item._id) {
                countMap[item._id.toString()] = item.count;
            }
        });

        // Add ledger count to each group and normalize parentGroup
        const groupsWithCounts = groups.map(group => ({
            ...group,
            id: group._id.toString(),
            ledgerCount: countMap[group._id.toString()] || 0,
            parentGroup: group.parentGroup ? {
                ...group.parentGroup,
                id: group.parentGroup._id ? group.parentGroup._id.toString() : (group.parentGroup.id || null)
            } : null
        }));

        successResponse(res, "Groups retrieved successfully", 200, groupsWithCounts);
    } catch (error) {
        next(error);
    }
};

export const getGroupById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const group = await Group.findOne({ _id: id, isActive: true })
            .populate('parentGroup', 'name type')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        if (!group) {
            throw new AppError('Group not found', 404);
        }

        // Get child groups
        const childGroups = await Group.find({ parentGroup: id, isActive: true })
            .populate('parentGroup', 'name type')
            .select('name type parentGroup');

        // Get ledgers in this group
        const ledgers = await Ledger.find({ group: id, isActive: true })
            .populate('vendor', 'vendorName')
            .populate('customer', 'shopName')
            .select('name ledgerType vendor customer');

        const groupData = {
            ...group.toObject(),
            childGroups,
            ledgers
        };

        successResponse(res, "Group retrieved successfully", 200, groupData);
    } catch (error) {
        next(error);
    }
};

export const updateGroup = async (req, res, next) => {
    const { id } = req.params;
    try {
        const { name, type, parentGroup } = req.body;

        const group = await Group.findById(id);
        if (!group || !group.isActive) {
            throw new AppError('Group not found', 404);
        }

        // Prevent editing predefined groups (optional - can be removed if needed)
        // if (group.isPredefined && (name !== group.name || type !== group.type)) {
        //     throw new AppError('Cannot modify name or type of predefined groups', 400);
        // }

        // Validate parent group if provided
        if (parentGroup) {
            if (parentGroup.toString() === id) {
                throw new AppError('A group cannot be its own parent', 400);
            }
            const parent = await Group.findById(parentGroup);
            if (!parent || !parent.isActive) {
                throw new AppError('Parent group not found or inactive', 404);
            }
            // Check for circular reference
            await checkCircularReference(id, parentGroup);
        }

        const updateData = {
            ...(name && { name }),
            ...(type && { type }),
            parentGroup: parentGroup !== undefined ? (parentGroup || null) : group.parentGroup,
            updatedBy: req.user._id
        };

        const updatedGroup = await Group.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('parentGroup', 'name type slug')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "Group updated successfully", 200, updatedGroup);
    } catch (error) {
        next(error);
    }
};

export const deleteGroup = async (req, res, next) => {
    const { id } = req.params;
    try {
        const group = await Group.findById(id);
        if (!group || !group.isActive) {
            throw new AppError('Group not found', 404);
        }

        // Check if group has child groups
        const childGroups = await Group.countDocuments({ parentGroup: id, isActive: true });
        if (childGroups > 0) {
            throw new AppError('Cannot delete group with child groups. Please delete or move child groups first.', 400);
        }

        // Check if group has ledgers
        const ledgersCount = await Ledger.countDocuments({ group: id, isActive: true });
        if (ledgersCount > 0) {
            throw new AppError('Cannot delete group with ledgers. Please delete or move ledgers first.', 400);
        }

        // Soft delete
        const deletedGroup = await Group.findByIdAndUpdate(
            id,
            { isActive: false, updatedBy: req.user._id },
            { new: true }
        );

        successResponse(res, "Group deleted successfully", 200, deletedGroup);
    } catch (error) {
        next(error);
    }
};

export const getGroupsByType = async (req, res, next) => {
    const { type } = req.params;
    try {
        const validTypes = ['Liability', 'Assets', 'Expenses', 'Income', 'Others'];
        if (!validTypes.includes(type)) {
            throw new AppError('Invalid group type', 400);
        }

        const groups = await Group.find({ type, isActive: true })
            .populate('parentGroup', 'name type')
            .sort({ name: 1 });

        successResponse(res, `Groups of type ${type} retrieved successfully`, 200, groups);
    } catch (error) {
        next(error);
    }
};

// Calculate ledger balance from vouchers up to asOnDate

// Updated to accept ledgerDoc and calculate correctly using outstandingBalance
const calculateLedgerBalance = (ledgerDoc, startDate = null, endDate = null, preFetchedVouchers = null, preFetchedTrips = null, preFetchedStocks = null) => {
    try {
        let periodDebit = 0;
        let periodCredit = 0;
        let allDebit = 0;
        let allCredit = 0;
        let voucherAmount = 0;
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        const ledgerId = ledgerDoc._id;
        const ledgerName = ledgerDoc.name;

        // Process Vouchers (using logic from getLedgerTransactions)
        if (Array.isArray(preFetchedVouchers)) {
            preFetchedVouchers.forEach(v => {
                const vDate = new Date(v.date);
                if (end && vDate > end) return;

                // For period stats, we only count within start/end
                const isInPeriod = (!start || vDate >= start);

                let debit = 0;
                let credit = 0;
                let isMatch = false;

                // Determine Debit/Credit
                if (v.voucherType === 'Payment' || v.voucherType === 'Receipt') {
                    if (v.account && v.account.toString() === ledgerId.toString()) {
                        // Header match
                        const totalAmount = v.parties ? v.parties.reduce((sum, p) => sum + (p.amount || 0), 0) : 0;
                        if (v.voucherType === 'Payment') credit += totalAmount;
                        else debit += totalAmount;
                        isMatch = true;
                    }
                    if (v.parties) {
                        v.parties.forEach(p => {
                            if (p.partyId && p.partyId.toString() === ledgerId.toString()) {
                                if (v.voucherType === 'Payment') debit += p.amount || 0;
                                else credit += p.amount || 0;
                                isMatch = true;
                            }
                        });
                    }
                } else {
                    // Journal/Contra
                    if (v.entries) {
                        v.entries.forEach(e => {
                            if (e.account && e.account.toString().trim().toLowerCase() === ledgerName.trim().toLowerCase()) {
                                debit += e.debitAmount || 0;
                                credit += e.creditAmount || 0;
                                isMatch = true;
                            }
                        });
                    }
                }

                if (isMatch) {
                    allDebit += debit;
                    allCredit += credit;
                    if (isInPeriod) {
                        periodDebit += debit;
                        periodCredit += credit;
                        // Discount logic (heuristic: Journals are often adjustments/discounts)
                        if (v.voucherType === 'Journal' || v.voucherType === 'Contra') {
                            voucherAmount += (debit + credit);
                        }
                    }
                }
            });
        }

        // Process Trips
        if (Array.isArray(preFetchedTrips)) {
            preFetchedTrips.forEach(t => {
                const tDate = new Date(t.createdAt);
                if (end && tDate > end) return;
                const isInPeriod = (!start || tDate >= start);

                if (t.sales) {
                    t.sales.forEach(s => {
                        let localDebit = 0;
                        if (s.cashLedger && s.cashLedger.toString() === ledgerId.toString()) {
                            localDebit += s.cashPaid || 0;
                        }
                        if (s.onlineLedger && s.onlineLedger.toString() === ledgerId.toString()) {
                            localDebit += s.onlinePaid || 0;
                        }
                        if (localDebit > 0) {
                            allDebit += localDebit;
                            if (isInPeriod) periodDebit += localDebit;
                        }
                    });
                }
            });
        }

        // Process Stocks
        if (Array.isArray(preFetchedStocks)) {
            preFetchedStocks.forEach(s => {
                const sDate = new Date(s.date);
                if (end && sDate > end) return;
                const isInPeriod = (!start || sDate >= start);

                let debit = 0;
                // Cash Payment
                if (s.cashLedgerId && s.cashLedgerId.toString() === ledgerId.toString()) {
                    debit += s.cashPaid || 0;
                }
                // Online Payment
                if (s.onlineLedgerId && s.onlineLedgerId.toString() === ledgerId.toString()) {
                    debit += s.onlinePaid || 0;
                }
                // Expense 
                if (s.expenseLedgerId && s.expenseLedgerId.toString() === ledgerId.toString()) {
                    debit += s.amount || 0;
                }
                if (debit > 0) {
                    allDebit += debit;
                    if (isInPeriod) periodDebit += debit;
                }
            });
        }

        // Compute finalBalance from opening balance + all transactions up to endDate
        const openingSigned = toSignedValue(ledgerDoc.openingBalance || 0, ledgerDoc.openingBalanceType || 'debit');
        const finalSigned = openingSigned + allDebit - allCredit;

        // Calculated Opening = Closing - period transactions (for period report display)
        const calculatedOpening = finalSigned - (periodDebit - periodCredit);

        return {
            debitTotal: periodDebit,
            creditTotal: periodCredit,
            finalBalance: finalSigned,
            openingBalance: calculatedOpening,
            discountAndOther: voucherAmount
        };
    } catch (error) {
        console.error('Error calculating ledger balance:', error);
        return { debitTotal: 0, creditTotal: 0, finalBalance: 0, openingBalance: 0 };
    }
};




// Calculate customer balance from vouchers and sales up to asOnDate
// Calculate customer balance (using logic from getCustomerPurchaseLedger)
const calculateCustomerBalance = (customerDoc, startDate = null, endDate = null, preFetchedVouchers = null, preFetchedTrips = null, preFetchedIndirectSales = null, preFetchedStocks = null) => {
    try {
        let periodDebit = 0; // Sales count as Debit (Receivable)
        let periodCredit = 0; // Receipts count as Credit
        let allDebit = 0;
        let allCredit = 0;
        let birdsTotal = 0;
        let weightTotal = 0;
        let discountAndOther = 0;

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        const customerId = customerDoc._id;
        const customerName = customerDoc.shopName || customerDoc.ownerName || '';

        // 1. Process Vouchers
        if (Array.isArray(preFetchedVouchers)) {
            preFetchedVouchers.forEach(v => {
                const vDate = new Date(v.date);
                if (end && vDate > end) return;
                const isInPeriod = (!start || vDate >= start);

                let amount = 0;
                let isMatch = false;
                let type = '';

                if (v.voucherType === 'Payment') {
                    const partyData = v.parties?.find(p => p.partyId && p.partyId.toString() === customerId.toString());
                    if (partyData) {
                        amount = partyData.amount || 0;
                        type = 'debit';
                        isMatch = true;
                    }
                } else if (v.voucherType === 'Receipt') {
                    // Receipt from Customer -> Credit (Decreases Receivable).
                    const partyData = v.parties?.find(p => p.partyId && p.partyId.toString() === customerId.toString());
                    if (partyData) {
                        amount = partyData.amount || 0;
                        type = 'credit';
                        isMatch = true;
                    }
                } else {
                    // Journal
                    const entry = v.entries?.find(e => e.account === customerName);
                    if (entry) {
                        amount = entry.debitAmount || entry.creditAmount;
                        type = entry.debitAmount > 0 ? 'debit' : 'credit';
                        isMatch = true;
                    }
                }

                if (isMatch && amount > 0) {
                    if (type === 'debit') {
                        allDebit += amount;
                        if (isInPeriod) periodDebit += amount;
                    } else if (type === 'credit') {
                        allCredit += amount;
                        if (isInPeriod) periodCredit += amount;
                    }

                    // Add to Discount/Other if Journal
                    if (isInPeriod && v.voucherType !== 'Payment' && v.voucherType !== 'Receipt') {
                        discountAndOther += amount;
                    }
                }
            });
        }

        // 2. Process Trips (Direct Sales)
        if (Array.isArray(preFetchedTrips)) {
            preFetchedTrips.forEach(trip => {
                const tDate = new Date(trip.createdAt);
                if (end && tDate > end) return;
                const isInPeriod = (!start || tDate >= start);

                if (trip.sales) {
                    trip.sales.forEach(sale => {
                        if (sale.client && sale.client.toString() === customerId.toString()) {
                            const saleAmt = sale.amount || 0;
                            const receiptAmt = (sale.cashPaid || 0) + (sale.onlinePaid || 0) + (sale.discount || 0);
                            const birds = (sale.birds || sale.birdsCount || 0);
                            const weight = sale.weight || 0;

                            allDebit += saleAmt;
                            allCredit += receiptAmt;

                            if (isInPeriod) {
                                periodDebit += saleAmt;
                                periodCredit += receiptAmt;
                                birdsTotal += birds;
                                weightTotal += weight;
                                discountAndOther += sale.discount || 0;
                            }
                        }
                    });
                }
            });
        }

        // 3. Process Indirect Sales
        if (Array.isArray(preFetchedIndirectSales)) {
            preFetchedIndirectSales.forEach(sale => {
                const sDate = new Date(sale.date);
                if (end && sDate > end) return;
                const isInPeriod = (!start || sDate >= start);

                if (sale.customer && sale.customer.toString() === customerId.toString()) {
                    const salesInfo = sale.sales || {};
                    const saleAmt = salesInfo.amount || 0;

                    allDebit += saleAmt;

                    if (isInPeriod) {
                        periodDebit += saleAmt;
                        birdsTotal += salesInfo.birds || 0;
                        weightTotal += salesInfo.weight || 0;
                    }
                }
            });
        }

        // 4. Process Stocks (Direct Sales via Manage Stocks)
        if (Array.isArray(preFetchedStocks)) {
            preFetchedStocks.forEach(stock => {
                const sDate = new Date(stock.date);
                if (end && sDate > end) return;
                const isInPeriod = (!start || sDate >= start);

                if (stock.customerId && stock.customerId.toString() === customerId.toString()) {
                    if (stock.type === 'sale' || stock.type === 'receipt') {
                        const saleAmt = stock.type === 'sale' ? (stock.amount || 0) : 0;
                        const receiptAmt = (stock.cashPaid || 0) + (stock.onlinePaid || 0) + (stock.discount || 0);

                        allDebit += saleAmt;
                        allCredit += receiptAmt;

                        if (isInPeriod) {
                            if (stock.type === 'sale') {
                                periodDebit += stock.amount || 0;
                                birdsTotal += stock.birds || 0;
                                weightTotal += stock.weight || 0;
                            }
                            periodCredit += receiptAmt;
                            discountAndOther += stock.discount || 0;
                        }
                    }
                }
            });
        }

        // Compute finalBalance from opening balance + all transactions up to endDate
        const openingSigned = toSignedValue(customerDoc.openingBalance || 0, customerDoc.openingBalanceType || 'debit');
        const finalSigned = openingSigned + allDebit - allCredit;
        const calculatedOpening = finalSigned - (periodDebit - periodCredit);

        return {
            debitTotal: periodDebit,
            creditTotal: periodCredit,
            finalBalance: finalSigned,
            openingBalance: calculatedOpening,
            birdsTotal,
            weightTotal,
            discountAndOther
        };
    } catch (error) {
        console.error('Error calculating customer balance:', error);
        return { debitTotal: 0, creditTotal: 0, finalBalance: 0, openingBalance: 0, birdsTotal: 0, weightTotal: 0 };
    }
};


// Calculate vendor balance from vouchers and purchases up to asOnDate
// Calculate vendor balance (using logic from getVendorLedger)
const calculateVendorBalance = (vendorDoc, startDate = null, endDate = null, preFetchedVouchers = null, preFetchedTrips = null, preFetchedStocks = null, preFetchedIndirectSales = null) => {
    try {
        let periodDebit = 0; // Payable Decreases (Payments)
        let periodCredit = 0; // Payable Increases (Purchases)
        let allDebit = 0;
        let allCredit = 0;
        let birdsTotal = 0;
        let weightTotal = 0;
        let discountAndOther = 0;

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        const vendorId = vendorDoc._id;
        const vendorName = vendorDoc.vendorName;

        // 1. Vouchers
        if (Array.isArray(preFetchedVouchers)) {
            preFetchedVouchers.forEach(v => {
                const vDate = new Date(v.date);
                if (end && vDate > end) return;
                const isInPeriod = (!start || vDate >= start);

                let amount = 0;
                let type = 'debit';
                let isMatch = false;

                if (v.voucherType === 'Journal') {
                    const entry = v.entries?.find(e => e.account && e.account.trim().toLowerCase() === vendorName.trim().toLowerCase());
                    if (entry) {
                        if (entry.creditAmount > 0) {
                            amount = entry.creditAmount;
                            type = 'credit';
                        } else {
                            amount = entry.debitAmount;
                            type = 'debit';
                        }
                        isMatch = true;
                    }
                } else {
                    // Payment/Receipt
                    if (v.parties && v.parties.length > 0) {
                        const partyEntry = v.parties.find(p => p.partyId && p.partyId.toString() === vendorId.toString());
                        if (partyEntry) {
                            amount = partyEntry.amount || 0;
                            isMatch = true;
                        }
                    } else if (v.party && v.party.toString() === vendorId.toString()) { // Old schema support
                        amount = v.totalDebit || v.totalCredit;
                        isMatch = true;
                    }

                    if (isMatch) {
                        // Payment/Receipt usually reduces payable -> Debit
                        type = 'debit';
                    }
                }

                if (isMatch && amount > 0) {
                    if (type === 'credit') {
                        allCredit += amount;
                        if (isInPeriod) {
                            periodCredit += amount;
                            if (v.voucherType === 'Journal' || v.voucherType === 'Receipt') discountAndOther += amount;
                        }
                    } else {
                        allDebit += amount;
                        if (isInPeriod) periodDebit += amount;
                    }
                }
            });
        }

        // 2. Trips (Purchases)
        if (Array.isArray(preFetchedTrips)) {
            preFetchedTrips.forEach(trip => {
                const tDate = new Date(trip.createdAt);
                if (end && tDate > end) return;
                const isInPeriod = (!start || tDate >= start);

                trip.purchases.forEach(purchase => {
                    if (purchase.supplier && purchase.supplier.toString() === vendorId.toString()) {
                        let purchaseAmount = purchase.amount || 0;
                        let tdsAmount = 0;
                        if (vendorDoc.tdsApplicable && (vendorDoc.tdsUpdatedAt && new Date(trip.date) > new Date(vendorDoc.tdsUpdatedAt))) {
                            tdsAmount = purchaseAmount * 0.001;
                        }

                        allCredit += purchaseAmount;
                        allDebit += tdsAmount;

                        if (isInPeriod) {
                            if (tdsAmount > 0) periodDebit += tdsAmount;
                            periodCredit += purchaseAmount;
                            birdsTotal += purchase.birds || 0;
                            weightTotal += purchase.weight || 0;
                        }
                    }
                });
            });
        }

        // 3. Indirect Sales (Vendor is seller to company)
        if (Array.isArray(preFetchedIndirectSales)) {
            preFetchedIndirectSales.forEach(sale => {
                const sDate = new Date(sale.date);
                if (end && sDate > end) return;
                const isInPeriod = (!start || sDate >= start);

                if (sale.vendor && sale.vendor.toString() === vendorId.toString()) {
                    const purchaseAmt = sale.summary?.totalPurchaseAmount || 0;
                    let tdsAmount = 0;
                    if (vendorDoc.tdsApplicable && (vendorDoc.tdsUpdatedAt && new Date(sale.date) > new Date(vendorDoc.tdsUpdatedAt))) {
                        tdsAmount = purchaseAmt * 0.001;
                    }

                    allCredit += purchaseAmt;
                    allDebit += tdsAmount;

                    if (isInPeriod) {
                        if (tdsAmount > 0) periodDebit += tdsAmount;
                        periodCredit += purchaseAmt;
                        birdsTotal += sale.summary?.totalPurchaseBirds || 0;
                        weightTotal += sale.summary?.totalPurchaseWeight || 0;
                    }
                }
            });
        }

        // 4. Stocks (Purchases)
        if (Array.isArray(preFetchedStocks)) {
            preFetchedStocks.forEach(stock => {
                const sDate = new Date(stock.date);
                if (end && sDate > end) return;
                const isInPeriod = (!start || sDate >= start);

                const stockVendorId = stock.vendorId?._id || stock.vendorId;
                const stockLedgerId = stock.ledgerId?._id || stock.ledgerId;
                if ((stockVendorId && stockVendorId.toString() === vendorId.toString()) || (stockLedgerId && stockLedgerId.toString() === vendorId.toString())) {
                    if (stock.type === 'purchase' || stock.type === 'opening' || stock.inventoryType === 'feed') {
                        let stockAmount = stock.amount || 0;
                        let tdsAmount = 0;
                        if (vendorDoc.tdsApplicable && (vendorDoc.tdsUpdatedAt && new Date(stock.date) > new Date(vendorDoc.tdsUpdatedAt))) {
                            tdsAmount = stockAmount * 0.001;
                        }

                        allCredit += stockAmount;
                        allDebit += tdsAmount;

                        if (isInPeriod) {
                            if (tdsAmount > 0) periodDebit += tdsAmount;
                            periodCredit += stockAmount;
                            birdsTotal += stock.bags || stock.birds || 0;
                            weightTotal += stock.feedQty || stock.weight || 0;
                        }
                    }
                }
            });
        }

        // Compute finalBalance from opening balance + all transactions up to endDate
        const openingSigned = toSignedValue(vendorDoc.openingBalance || 0, vendorDoc.openingBalanceType || 'credit');
        const finalSigned = openingSigned + allDebit - allCredit;
        const calculatedOpening = finalSigned - (periodDebit - periodCredit);

        return {
            debitTotal: periodDebit,
            creditTotal: periodCredit,
            finalBalance: finalSigned,
            openingBalance: calculatedOpening,
            birdsTotal,
            weightTotal,
            discountAndOther
        };
    } catch (error) {
        console.error('Error calculating vendor balance:', error);
        return { debitTotal: 0, creditTotal: 0, finalBalance: 0, openingBalance: 0, birdsTotal: 0, weightTotal: 0 };
    }
};


// Recursive function to get all ledgers in a group (including subgroups)
const getAllLedgersInGroup = async (groupId) => {
    // Get ledgers directly in this group
    const directLedgers = await Ledger.find({ group: groupId, isActive: true }).lean();

    // Get sub-groups
    const subGroups = await Group.find({ parentGroup: groupId, isActive: true }).lean();

    let allLedgers = [...directLedgers];

    // Recursively get ledgers from sub-groups
    for (const subGroup of subGroups) {
        const subGroupLedgers = await getAllLedgersInGroup(subGroup._id);
        allLedgers = [...allLedgers, ...subGroupLedgers];
    }

    return allLedgers;
};

// Recursive function to get all customers in a group
const getAllCustomersInGroup = async (groupId) => {
    const directCustomers = await Customer.find({ group: groupId, isActive: true }).lean();
    const subGroups = await Group.find({ parentGroup: groupId, isActive: true }).lean();

    let allCustomers = [...directCustomers];

    for (const subGroup of subGroups) {
        const subGroupCustomers = await getAllCustomersInGroup(subGroup._id);
        allCustomers = [...allCustomers, ...subGroupCustomers];
    }

    return allCustomers;
};

// Recursive function to get all vendors in a group
const getAllVendorsInGroup = async (groupId) => {
    const directVendors = await Vendor.find({ group: groupId, isActive: true }).lean();
    const subGroups = await Group.find({ parentGroup: groupId, isActive: true }).lean();

    let allVendors = [...directVendors];

    for (const subGroup of subGroups) {
        const subGroupVendors = await getAllVendorsInGroup(subGroup._id);
        allVendors = [...allVendors, ...subGroupVendors];
    }

    return allVendors;
};

// Calculate diesel station balance
const calculateDieselStationBalance = (stationDoc, startDate = null, endDate = null, preFetchedVouchers = null, preFetchedTrips = null) => {
    try {
        let periodDebit = 0; // Payments to station
        let periodCredit = 0; // Purchase from station
        let allDebit = 0;
        let allCredit = 0;
        let periodVolume = 0;
        let discountAndOther = 0;

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        const stationId = stationDoc._id;
        const stationName = stationDoc.name;

        // 1. Vouchers (Payments)
        if (Array.isArray(preFetchedVouchers)) {
            preFetchedVouchers.forEach(v => {
                const vDate = new Date(v.date);
                if (end && vDate > end) return;
                const isInPeriod = (!start || vDate >= start);

                let amount = 0;
                let isMatch = false;
                let type = 'debit';

                if (v.voucherType === 'Payment') {
                    // Check parties
                    const partyData = v.parties?.find(p => p.partyId && p.partyId.toString() === stationId.toString());
                    if (partyData) {
                        amount = partyData.amount || 0;
                        isMatch = true;
                        type = 'debit'; // Payment reduces liability
                    }
                } else if (v.voucherType === 'Journal') {
                    // Journal check entries
                    const entry = v.entries?.find(e => e.account === stationName); // Assuming account name match for journal
                    if (entry) {
                        if (entry.creditAmount > 0) {
                            amount = entry.creditAmount;
                            type = 'credit';
                        } else {
                            amount = entry.debitAmount;
                            type = 'debit';
                        }
                        isMatch = true;
                    }
                }

                if (isMatch) {
                    if (type === 'credit') {
                        allCredit += amount;
                        if (isInPeriod) {
                            periodCredit += amount;
                            if (v.voucherType === 'Journal') discountAndOther += amount;
                        }
                    } else {
                        allDebit += amount;
                        if (isInPeriod) periodDebit += amount;
                    }
                }
            });
        }

        // 2. Trips (Purchases - Diesel Entries)
        if (Array.isArray(preFetchedTrips)) {
            preFetchedTrips.forEach(trip => {
                const tDate = new Date(trip.createdAt); // Or trip.date? Trip usually has createdAt or date. Using createdAt for consistency with other parts.
                // Actually trip.date is better if available, but controller mainly uses createdAt for trips in other funcs?
                // calculateVendorBalance uses createdAt (line 632). 

                if (end && tDate > end) return;
                const isInPeriod = (!start || tDate >= start);

                if (isInPeriod && trip.diesel && trip.diesel.stations) {
                    trip.diesel.stations.forEach(station => {
                        if (station.dieselStation && station.dieselStation.toString() === stationId.toString()) {
                            const stationAmt = station.amount || 0;
                            const stationVol = station.volume || 0;
                            allCredit += stationAmt;
                            periodCredit += stationAmt;
                            periodVolume += stationVol;
                        }
                    });
                } else if (!isInPeriod && trip.diesel && trip.diesel.stations) {
                    trip.diesel.stations.forEach(station => {
                        if (station.dieselStation && station.dieselStation.toString() === stationId.toString()) {
                            allCredit += station.amount || 0;
                        }
                    });
                }
            });
        }

        // Compute finalBalance from opening balance + all transactions up to endDate
        const openingSigned = toSignedValue(stationDoc.openingBalance || 0, stationDoc.openingBalanceType || 'credit');
        const finalSigned = openingSigned + allDebit - allCredit;
        // Opening = Closing - period transactions
        const calculatedOpening = finalSigned - (periodDebit - periodCredit);

        return {
            debitTotal: periodDebit,
            creditTotal: periodCredit,
            finalBalance: finalSigned,
            openingBalance: calculatedOpening,
            discountAndOther,
            volume: periodVolume
        };
    } catch (error) {
        console.error('Error calculating diesel station balance:', error);
        return { debitTotal: 0, creditTotal: 0, finalBalance: 0, openingBalance: 0 };
    }
};

// Recursive function to get all diesel stations in a group
const getAllDieselStationsInGroup = async (groupId) => {
    const directStations = await DieselStation.find({ group: groupId, isActive: true }).lean();
    const subGroups = await Group.find({ parentGroup: groupId, isActive: true }).lean();

    let allStations = [...directStations];

    for (const subGroup of subGroups) {
        const subGroupStations = await getAllDieselStationsInGroup(subGroup._id);
        allStations = [...allStations, ...subGroupStations];
    }

    return allStations;
};

// Calculate group debit/credit from all ledgers, customers, and vendors
// OPTIMIZED: Uses pre-fetched data
const calculateGroupDebitCredit = async (groupId, groupType, startDate = null, endDate = null, preFetchedVouchers = null, preFetchedTrips = null, preFetchedStocks = null, preFetchedIndirectSales = null) => {
    // Note: getAllLedgers/Customers/Vendors still do recursive DB calls. 
    // Optimization: We could optimize these formatted calls too, but passing vouchers down is the biggest win.

    const allLedgers = await getAllLedgersInGroup(groupId);
    const allCustomers = await getAllCustomersInGroup(groupId);

    // Check group name for Purchase Account special case
    let allVendors = [];
    const groupDoc = await Group.findById(groupId).select('name');
    if (groupDoc && (groupDoc.name.trim().toLowerCase() === 'purchase account' || groupDoc.name.trim().toLowerCase() === 'purchase accounts')) {
        allVendors = await Vendor.find({ isActive: true }).lean();
    } else {
        allVendors = await getAllVendorsInGroup(groupId);
    }

    let totalDebit = 0; // Closing Debit
    let totalCredit = 0; // Closing Credit
    let totalBirds = 0;
    let totalWeight = 0;
    let totalTransactionDebit = 0;
    let totalTransactionCredit = 0;
    let totalDiscountAndOther = 0;

    // Calculate from ledgers
    for (const ledger of allLedgers) {
        const ledgerBalance = await calculateLedgerBalance(
            ledger,
            startDate,
            endDate,
            preFetchedVouchers,
            preFetchedTrips,
            preFetchedStocks
        );

        const finalSigned = ledgerBalance.finalBalance;
        totalTransactionDebit += ledgerBalance.debitTotal || 0;
        totalTransactionCredit += ledgerBalance.creditTotal || 0;
        totalDiscountAndOther += ledgerBalance.discountAndOther || 0;

        if (groupType === 'Assets' || groupType === 'Expenses') {
            if (finalSigned >= 0) {
                totalDebit += Math.abs(finalSigned);
            } else {
                totalCredit += Math.abs(finalSigned);
            }
        } else if (groupType === 'Liability' || groupType === 'Income') {
            if (finalSigned >= 0) {
                totalCredit += Math.abs(finalSigned);
            } else {
                totalDebit += Math.abs(finalSigned);
            }
        } else {
            // For Others type, use Assets logic
            if (finalSigned >= 0) {
                totalDebit += Math.abs(finalSigned);
            } else {
                totalCredit += Math.abs(finalSigned);
            }
        }
    }

    // Calculate from customers
    for (const customer of allCustomers) {
        const customerBalance = await calculateCustomerBalance(
            customer,
            startDate,
            endDate,
            preFetchedVouchers,
            preFetchedTrips,
            preFetchedIndirectSales,
            preFetchedStocks
        );

        const finalSigned = customerBalance.finalBalance;
        totalBirds += customerBalance.birdsTotal || 0;
        totalWeight += customerBalance.weightTotal || 0;
        totalTransactionDebit += customerBalance.debitTotal || 0;
        totalTransactionCredit += customerBalance.creditTotal || 0;
        totalDiscountAndOther += customerBalance.discountAndOther || 0;

        if (groupType === 'Assets' || groupType === 'Expenses') {
            if (finalSigned >= 0) {
                totalDebit += Math.abs(finalSigned);
            } else {
                totalCredit += Math.abs(finalSigned);
            }
        } else if (groupType === 'Liability' || groupType === 'Income') {
            if (finalSigned >= 0) {
                totalCredit += Math.abs(finalSigned);
            } else {
                totalDebit += Math.abs(finalSigned);
            }
        } else {
            if (finalSigned >= 0) {
                totalDebit += Math.abs(finalSigned);
            } else {
                totalCredit += Math.abs(finalSigned);
            }
        }
    }

    // Calculate from vendors
    for (const vendor of allVendors) {
        const vendorBalance = await calculateVendorBalance(
            vendor,
            startDate,
            endDate,
            preFetchedVouchers,
            preFetchedTrips,
            preFetchedStocks,
            preFetchedIndirectSales
        );

        const finalSigned = vendorBalance.finalBalance;
        totalBirds += vendorBalance.birdsTotal || 0;
        totalWeight += vendorBalance.weightTotal || 0;
        totalTransactionDebit += vendorBalance.debitTotal || 0;
        totalTransactionCredit += vendorBalance.creditTotal || 0;
        totalDiscountAndOther += vendorBalance.discountAndOther || 0;

        if (groupType === 'Assets' || groupType === 'Expenses') {
            if (finalSigned >= 0) {
                totalDebit += Math.abs(finalSigned);
            } else {
                totalCredit += Math.abs(finalSigned);
            }
        } else if (groupType === 'Liability' || groupType === 'Income') {
            if (finalSigned >= 0) {
                totalCredit += Math.abs(finalSigned);
            } else {
                totalDebit += Math.abs(finalSigned);
            }
        } else {
            if (finalSigned >= 0) {
                totalDebit += Math.abs(finalSigned);
            } else {
                totalCredit += Math.abs(finalSigned);
            }
        }
    }

    // Calculate from diesel stations
    const allStations = await getAllDieselStationsInGroup(groupId);
    for (const station of allStations) {
        const stationBalance = await calculateDieselStationBalance(
            station,
            startDate,
            endDate,
            preFetchedVouchers,
            preFetchedTrips
        );

        const finalSigned = stationBalance.finalBalance;
        totalTransactionDebit += stationBalance.debitTotal || 0;
        totalTransactionCredit += stationBalance.creditTotal || 0;
        totalDiscountAndOther += stationBalance.discountAndOther || 0;

        if (groupType === 'Assets' || groupType === 'Expenses') {
            if (finalSigned >= 0) {
                totalDebit += Math.abs(finalSigned);
            } else {
                totalCredit += Math.abs(finalSigned);
            }
        } else if (groupType === 'Liability' || groupType === 'Income') {
            if (finalSigned >= 0) {
                totalCredit += Math.abs(finalSigned);
            } else {
                totalDebit += Math.abs(finalSigned);
            }
        } else {
            if (finalSigned >= 0) {
                totalCredit += Math.abs(finalSigned);
            } else {
                totalDebit += Math.abs(finalSigned);
            }
        }
    }

    return {
        debit: totalDebit,
        credit: totalCredit,
        birds: totalBirds,
        weight: totalWeight,
        transactionDebit: totalTransactionDebit,
        transactionCredit: totalTransactionCredit,
        discountAndOther: totalDiscountAndOther
    };
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

// Get group summary with ledgers and sub-groups
export const getGroupSummary = async (req, res, next) => {
    const { id } = req.params;
    const { asOnDate, startDate, endDate } = req.query;

    const finalEndDate = endDate || asOnDate;
    const finalStartDate = startDate || null;

    try {
        let endDateObj = null;
        if (finalEndDate) {
            endDateObj = new Date(finalEndDate);
            endDateObj.setHours(23, 59, 59, 999);
        }
        const startDateObj = finalStartDate ? new Date(finalStartDate) : null;

        const voucherQuery = { isActive: true };
        if (endDateObj) voucherQuery.date = { $lte: endDateObj };

        const tripQuery = {};
        if (endDateObj) tripQuery.createdAt = { $lte: endDateObj };

        const stockQuery = {};
        if (endDateObj) stockQuery.date = { $lte: endDateObj };

        const indirectSaleQuery = {};
        if (endDateObj) indirectSaleQuery.date = { $lte: endDateObj };

        // Parallel batch fetch of ALL needed collections in a single round-trip
        const [
            allGroups,
            allLedgers,
            allCustomers,
            allVendors,
            allStations,
            vouchers,
            trips,
            stocks,
            indirectSales
        ] = await Promise.all([
            Group.find({ isActive: true }).lean(),
            Ledger.find({ isActive: true }).lean(),
            Customer.find({ isActive: true }).lean(),
            Vendor.find({ isActive: true }).lean(),
            DieselStation.find({ isActive: true }).lean(),
            Voucher.find(voucherQuery).lean(),
            Trip.find(tripQuery).select('date createdAt sales purchases diesel stocks').lean(),
            InventoryStock.find(stockQuery).lean(),
            IndirectSale.find(indirectSaleQuery).lean()
        ]);

        const group = allGroups.find(g => g._id.toString() === id.toString());
        if (!group) {
            throw new AppError('Group not found', 404);
        }

        // Precompute descendants for each group in memory
        const childrenMap = new Map();
        allGroups.forEach(g => {
            const pId = g.parentGroup ? (g.parentGroup._id || g.parentGroup).toString() : null;
            if (pId) {
                if (!childrenMap.has(pId)) childrenMap.set(pId, []);
                childrenMap.get(pId).push(g._id.toString());
            }
        });

        const getDescendants = (targetId) => {
            const result = new Set([targetId.toString()]);
            const queue = [targetId.toString()];
            while (queue.length > 0) {
                const curr = queue.shift();
                const children = childrenMap.get(curr);
                if (children) {
                    for (const c of children) {
                        if (!result.has(c)) {
                            result.add(c);
                            queue.push(c);
                        }
                    }
                }
            }
            return result;
        };

        // Stock value calculation for stock-in-hand
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

        const queryDate = endDateObj || new Date();
        const birdsClosingStockValue = calculateStockValue(combinedStocks, 'bird', queryDate);
        const feedClosingStockValue = calculateStockValue(combinedStocks, 'feed', queryDate);
        const totalClosingStock = birdsClosingStockValue + feedClosingStockValue;

        // Single-pass Transaction Accumulators
        const initAccumulator = () => ({
            allDebit: 0,
            allCredit: 0,
            periodDebit: 0,
            periodCredit: 0,
            birdsTotal: 0,
            weightTotal: 0,
            volume: 0,
            discountAndOther: 0
        });

        const customerSummary = new Map();
        const vendorSummary = new Map();
        const ledgerSummary = new Map();
        const stationSummary = new Map();

        const getCustomerAcc = (cId) => {
            const idStr = cId.toString();
            if (!customerSummary.has(idStr)) customerSummary.set(idStr, initAccumulator());
            return customerSummary.get(idStr);
        };
        const getVendorAcc = (vId) => {
            const idStr = vId.toString();
            if (!vendorSummary.has(idStr)) vendorSummary.set(idStr, initAccumulator());
            return vendorSummary.get(idStr);
        };
        const getLedgerAcc = (lId) => {
            const idStr = lId.toString();
            if (!ledgerSummary.has(idStr)) ledgerSummary.set(idStr, initAccumulator());
            return ledgerSummary.get(idStr);
        };
        const getStationAcc = (sId) => {
            const idStr = sId.toString();
            if (!stationSummary.has(idStr)) stationSummary.set(idStr, initAccumulator());
            return stationSummary.get(idStr);
        };

        // Name maps for Journal lookups
        const customerByName = new Map();
        allCustomers.forEach(c => {
            const name = (c.shopName || c.ownerName || '').trim().toLowerCase();
            if (name) customerByName.set(name, c._id.toString());
        });
        const vendorByName = new Map();
        allVendors.forEach(v => {
            if (v.vendorName) vendorByName.set(v.vendorName.trim().toLowerCase(), v._id.toString());
            if (v.companyName) vendorByName.set(v.companyName.trim().toLowerCase(), v._id.toString());
        });
        const ledgerByName = new Map();
        allLedgers.forEach(l => {
            if (l.name) ledgerByName.set(l.name.trim().toLowerCase(), l._id.toString());
        });
        const stationByName = new Map();
        allStations.forEach(s => {
            if (s.name) stationByName.set(s.name.trim().toLowerCase(), s._id.toString());
        });

        // 1. Process Vouchers ONCE
        vouchers.forEach(v => {
            const vDate = new Date(v.date);
            if (endDateObj && vDate > endDateObj) return;
            const isInPeriod = (!startDateObj || vDate >= startDateObj);

            if (v.voucherType === 'Payment' || v.voucherType === 'Receipt') {
                const isPayment = v.voucherType === 'Payment';
                const totalAmount = (v.parties || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

                if (v.account) {
                    const accId = ledgerByName.get(v.account.toString().trim().toLowerCase()) || v.account.toString();
                    const acc = getLedgerAcc(accId);
                    if (isPayment) {
                        acc.allCredit += totalAmount;
                        if (isInPeriod) acc.periodCredit += totalAmount;
                    } else {
                        acc.allDebit += totalAmount;
                        if (isInPeriod) acc.periodDebit += totalAmount;
                    }
                }

                (v.parties || []).forEach(p => {
                    if (!p.partyId) return;
                    const pId = p.partyId.toString();
                    const pAmt = Number(p.amount) || 0;
                    if (pAmt <= 0) return;

                    const cAcc = customerSummary.has(pId) ? customerSummary.get(pId) : (allCustomers.some(c => c._id.toString() === pId) ? getCustomerAcc(pId) : null);
                    if (cAcc) {
                        if (isPayment) {
                            cAcc.allDebit += pAmt;
                            if (isInPeriod) cAcc.periodDebit += pAmt;
                        } else {
                            cAcc.allCredit += pAmt;
                            if (isInPeriod) cAcc.periodCredit += pAmt;
                        }
                    }

                    const vAcc = vendorSummary.has(pId) ? vendorSummary.get(pId) : (allVendors.some(v => v._id.toString() === pId) ? getVendorAcc(pId) : null);
                    if (vAcc) {
                        vAcc.allDebit += pAmt;
                        if (isInPeriod) vAcc.periodDebit += pAmt;
                    }

                    const sAcc = stationSummary.has(pId) ? stationSummary.get(pId) : (allStations.some(s => s._id.toString() === pId) ? getStationAcc(pId) : null);
                    if (sAcc) {
                        if (isPayment) {
                            sAcc.allDebit += pAmt;
                            if (isInPeriod) sAcc.periodDebit += pAmt;
                        }
                    }

                    const lAcc = ledgerSummary.has(pId) ? ledgerSummary.get(pId) : (allLedgers.some(l => l._id.toString() === pId) ? getLedgerAcc(pId) : null);
                    if (lAcc) {
                        if (isPayment) {
                            lAcc.allDebit += pAmt;
                            if (isInPeriod) lAcc.periodDebit += pAmt;
                        } else {
                            lAcc.allCredit += pAmt;
                            if (isInPeriod) lAcc.periodCredit += pAmt;
                        }
                    }
                });
            } else {
                (v.entries || []).forEach(e => {
                    const accName = (e.account || '').toString().trim().toLowerCase();
                    const dAmt = Number(e.debitAmount) || 0;
                    const cAmt = Number(e.creditAmount) || 0;
                    const amt = dAmt || cAmt;
                    if (amt <= 0) return;

                    const cId = customerByName.get(accName);
                    if (cId) {
                        const acc = getCustomerAcc(cId);
                        if (dAmt > 0) {
                            acc.allDebit += dAmt;
                            if (isInPeriod) { acc.periodDebit += dAmt; acc.discountAndOther += dAmt; }
                        } else {
                            acc.allCredit += cAmt;
                            if (isInPeriod) { acc.periodCredit += cAmt; acc.discountAndOther += cAmt; }
                        }
                    }

                    const vId = vendorByName.get(accName);
                    if (vId) {
                        const acc = getVendorAcc(vId);
                        if (cAmt > 0) {
                            acc.allCredit += cAmt;
                            if (isInPeriod) { acc.periodCredit += cAmt; acc.discountAndOther += cAmt; }
                        } else {
                            acc.allDebit += dAmt;
                            if (isInPeriod) acc.periodDebit += dAmt;
                        }
                    }

                    const sId = stationByName.get(accName);
                    if (sId) {
                        const acc = getStationAcc(sId);
                        if (cAmt > 0) {
                            acc.allCredit += cAmt;
                            if (isInPeriod) { acc.periodCredit += cAmt; acc.discountAndOther += cAmt; }
                        } else {
                            acc.allDebit += dAmt;
                            if (isInPeriod) acc.periodDebit += dAmt;
                        }
                    }

                    const lId = ledgerByName.get(accName);
                    if (lId) {
                        const acc = getLedgerAcc(lId);
                        acc.allDebit += dAmt;
                        acc.allCredit += cAmt;
                        if (isInPeriod) {
                            acc.periodDebit += dAmt;
                            acc.periodCredit += cAmt;
                        }
                    }
                });
            }
        });

        // 2. Process Trips ONCE
        trips.forEach(trip => {
            const tDate = new Date(trip.createdAt || trip.date);
            if (endDateObj && tDate > endDateObj) return;
            const isInPeriod = (!startDateObj || tDate >= startDateObj);

            (trip.sales || []).forEach(sale => {
                const saleAmt = Number(sale.amount) || 0;
                const cashPaid = Number(sale.cashPaid) || 0;
                const onlinePaid = Number(sale.onlinePaid) || 0;
                const discount = Number(sale.discount) || 0;
                const receiptAmt = cashPaid + onlinePaid + discount;
                const birds = Number(sale.birds || sale.birdsCount) || 0;
                const weight = Number(sale.weight) || 0;

                if (sale.client) {
                    const cAcc = getCustomerAcc(sale.client);
                    cAcc.allDebit += saleAmt;
                    cAcc.allCredit += receiptAmt;
                    if (isInPeriod) {
                        cAcc.periodDebit += saleAmt;
                        cAcc.periodCredit += receiptAmt;
                        cAcc.birdsTotal += birds;
                        cAcc.weightTotal += weight;
                        cAcc.discountAndOther += discount;
                    }
                }

                if (sale.cashLedger && cashPaid > 0) {
                    const lAcc = getLedgerAcc(sale.cashLedger);
                    lAcc.allDebit += cashPaid;
                    if (isInPeriod) lAcc.periodDebit += cashPaid;
                }
                if (sale.onlineLedger && onlinePaid > 0) {
                    const lAcc = getLedgerAcc(sale.onlineLedger);
                    lAcc.allDebit += onlinePaid;
                    if (isInPeriod) lAcc.periodDebit += onlinePaid;
                }
            });

            (trip.purchases || []).forEach(p => {
                const supplierId = p.supplier?._id || p.supplier;
                const vId = supplierId ? supplierId.toString() : (p.vendorName ? vendorByName.get(p.vendorName.trim().toLowerCase()) : null);
                if (vId) {
                    const vAcc = getVendorAcc(vId);
                    const pAmt = Number(p.amount) || 0;
                    const pBirds = Number(p.birds) || 0;
                    const pWeight = Number(p.weight) || 0;
                    vAcc.allCredit += pAmt;
                    if (isInPeriod) {
                        vAcc.periodCredit += pAmt;
                        vAcc.birdsTotal += pBirds;
                        vAcc.weightTotal += pWeight;
                    }
                }
            });

            if (trip.diesel?.stations) {
                trip.diesel.stations.forEach(station => {
                    if (station.dieselStation) {
                        const sAcc = getStationAcc(station.dieselStation);
                        const sAmt = Number(station.amount) || 0;
                        const sVol = Number(station.volume) || 0;
                        sAcc.allCredit += sAmt;
                        if (isInPeriod) {
                            sAcc.periodCredit += sAmt;
                            sAcc.volume += sVol;
                        }
                    }
                });
            }
        });

        // 3. Process Indirect Sales ONCE
        indirectSales.forEach(sale => {
            const sDate = new Date(sale.date);
            if (endDateObj && sDate > endDateObj) return;
            const isInPeriod = (!startDateObj || sDate >= startDateObj);

            if (sale.customer) {
                const cAcc = getCustomerAcc(sale.customer);
                const salesInfo = sale.sales || {};
                const saleAmt = Number(salesInfo.amount) || 0;
                cAcc.allDebit += saleAmt;
                if (isInPeriod) {
                    cAcc.periodDebit += saleAmt;
                    cAcc.birdsTotal += Number(salesInfo.birds) || 0;
                    cAcc.weightTotal += Number(salesInfo.weight) || 0;
                }
            }

            if (sale.vendor) {
                const vAcc = getVendorAcc(sale.vendor);
                const amt = Number(sale.summary?.totalPurchaseAmount) || 0;
                vAcc.allCredit += amt;
                if (isInPeriod) {
                    vAcc.periodCredit += amt;
                    vAcc.birdsTotal += Number(sale.summary?.totalPurchaseBirds) || 0;
                    vAcc.weightTotal += Number(sale.summary?.totalPurchaseWeight) || 0;
                }
            }
        });

        // 4. Process Inventory Stocks ONCE
        stocks.forEach(stock => {
            const sDate = new Date(stock.date);
            if (endDateObj && sDate > endDateObj) return;
            const isInPeriod = (!startDateObj || sDate >= startDateObj);

            if (stock.customerId && (stock.type === 'sale' || stock.type === 'receipt')) {
                const cAcc = getCustomerAcc(stock.customerId);
                const saleAmt = stock.type === 'sale' ? (Number(stock.amount) || 0) : 0;
                const receiptAmt = (Number(stock.cashPaid) || 0) + (Number(stock.onlinePaid) || 0) + (Number(stock.discount) || 0);

                cAcc.allDebit += saleAmt;
                cAcc.allCredit += receiptAmt;
                if (isInPeriod) {
                    if (stock.type === 'sale') {
                        cAcc.periodDebit += Number(stock.amount) || 0;
                        cAcc.birdsTotal += Number(stock.birds) || 0;
                        cAcc.weightTotal += Number(stock.weight) || 0;
                    }
                    cAcc.periodCredit += receiptAmt;
                    cAcc.discountAndOther += Number(stock.discount) || 0;
                }
            }

            if (stock.vendorId && (stock.type === 'purchase' || stock.type === 'opening')) {
                const vAcc = getVendorAcc(stock.vendorId);
                const amt = Number(stock.amount) || 0;
                vAcc.allCredit += amt;
                if (isInPeriod) {
                    vAcc.periodCredit += amt;
                    vAcc.birdsTotal += Number(stock.bags || stock.birds) || 0;
                    vAcc.weightTotal += Number(stock.feedQty || stock.weight) || 0;
                }
            }

            if (stock.type === 'sale' || stock.type === 'receipt') {
                if (stock.cashLedgerId && Number(stock.cashPaid) > 0) {
                    const lAcc = getLedgerAcc(stock.cashLedgerId);
                    lAcc.allDebit += Number(stock.cashPaid);
                    if (isInPeriod) lAcc.periodDebit += Number(stock.cashPaid);
                }
                if (stock.onlineLedgerId && Number(stock.onlinePaid) > 0) {
                    const lAcc = getLedgerAcc(stock.onlineLedgerId);
                    lAcc.allDebit += Number(stock.onlinePaid);
                    if (isInPeriod) lAcc.periodDebit += Number(stock.onlinePaid);
                }
            }

            if (stock.expenseLedgerId && Number(stock.amount) > 0) {
                const lAcc = getLedgerAcc(stock.expenseLedgerId);
                lAcc.allDebit += Number(stock.amount);
                if (isInPeriod) lAcc.periodDebit += Number(stock.amount);
            }
        });

        // Entity evaluators
        const evalCustomer = (c) => {
            const cId = c._id.toString();
            const acc = customerSummary.get(cId) || initAccumulator();
            const openingSigned = toSignedValue(c.openingBalance || 0, c.openingBalanceType || 'debit');
            const finalSigned = openingSigned + acc.allDebit - acc.allCredit;
            return {
                debitTotal: acc.periodDebit,
                creditTotal: acc.periodCredit,
                finalBalance: finalSigned,
                birdsTotal: acc.birdsTotal,
                weightTotal: acc.weightTotal,
                discountAndOther: acc.discountAndOther
            };
        };

        const evalVendor = (v) => {
            const vId = v._id.toString();
            const acc = vendorSummary.get(vId) || initAccumulator();
            const openingSigned = toSignedValue(v.openingBalance || 0, v.openingBalanceType || 'credit');
            const finalSigned = openingSigned + acc.allCredit - acc.allDebit;
            return {
                debitTotal: acc.periodDebit,
                creditTotal: acc.periodCredit,
                finalBalance: finalSigned,
                birdsTotal: acc.birdsTotal,
                weightTotal: acc.weightTotal,
                discountAndOther: acc.discountAndOther
            };
        };

        const evalLedger = (l) => {
            const lId = l._id.toString();
            const acc = ledgerSummary.get(lId) || initAccumulator();
            const openingSigned = toSignedValue(l.openingBalance || 0, l.openingBalanceType || 'debit');
            const finalSigned = openingSigned + acc.allDebit - acc.allCredit;
            return {
                debitTotal: acc.periodDebit,
                creditTotal: acc.periodCredit,
                finalBalance: finalSigned,
                discountAndOther: acc.discountAndOther
            };
        };

        const evalStation = (s) => {
            const sId = s._id.toString();
            const acc = stationSummary.get(sId) || initAccumulator();
            const openingSigned = toSignedValue(s.openingBalance || 0, s.openingBalanceType || 'credit');
            const finalSigned = openingSigned + acc.allDebit - acc.allCredit;
            return {
                debitTotal: acc.periodDebit,
                creditTotal: acc.periodCredit,
                finalBalance: finalSigned,
                volume: acc.volume,
                discountAndOther: acc.discountAndOther
            };
        };

        const applyGroupTypeSign = (type, finalSigned) => {
            let debit = 0;
            let credit = 0;
            if (type === 'Assets' || type === 'Expenses') {
                if (finalSigned >= 0) debit = Math.abs(finalSigned);
                else credit = Math.abs(finalSigned);
            } else if (type === 'Liability' || type === 'Income') {
                if (finalSigned >= 0) credit = Math.abs(finalSigned);
                else debit = Math.abs(finalSigned);
            } else {
                if (finalSigned >= 0) debit = Math.abs(finalSigned);
                else credit = Math.abs(finalSigned);
            }
            return { debit, credit };
        };

        const entries = [];

        // 1. Subgroups
        const subGroups = allGroups.filter(g => {
            const pId = g.parentGroup ? (g.parentGroup._id || g.parentGroup).toString() : null;
            return pId === id.toString();
        }).sort((a, b) => a.name.localeCompare(b.name));

        for (const subGroup of subGroups) {
            const groupSlug = subGroup.slug ? subGroup.slug.trim().toLowerCase() : '';
            const groupName = subGroup.name ? subGroup.name.trim().toUpperCase() : '';

            let debit = 0;
            let credit = 0;
            let birds = 0;
            let weight = 0;
            let transactionDebit = 0;
            let transactionCredit = 0;
            let discountAndOther = 0;
            let closingBalance = 0;

            if (groupSlug === 'stock-in-hand' || groupName === 'STOCK-IN-HAND' || groupName === 'STOCK IN HAND') {
                closingBalance = totalClosingStock;
            } else if (groupSlug === 'birds-stock' || groupName === 'BIRDS STOCK') {
                closingBalance = birdsClosingStockValue;
            } else if (groupSlug === 'feed-stock' || groupName === 'FEED STOCK') {
                closingBalance = feedClosingStockValue;
            } else {
                const descendantIds = getDescendants(subGroup._id);

                for (const ledger of allLedgers) {
                    if (ledger.group && descendantIds.has(ledger.group.toString())) {
                        const bal = evalLedger(ledger);
                        transactionDebit += bal.debitTotal;
                        transactionCredit += bal.creditTotal;
                        discountAndOther += bal.discountAndOther;
                        const dc = applyGroupTypeSign(group.type, bal.finalBalance);
                        debit += dc.debit;
                        credit += dc.credit;
                    }
                }

                for (const customer of allCustomers) {
                    if (customer.group && descendantIds.has(customer.group.toString())) {
                        const bal = evalCustomer(customer);
                        transactionDebit += bal.debitTotal;
                        transactionCredit += bal.creditTotal;
                        birds += bal.birdsTotal;
                        weight += bal.weightTotal;
                        discountAndOther += bal.discountAndOther;
                        const dc = applyGroupTypeSign(group.type, bal.finalBalance);
                        debit += dc.debit;
                        credit += dc.credit;
                    }
                }

                const isPurchaseAcc = subGroup.name && (subGroup.name.trim().toLowerCase() === 'purchase account' || subGroup.name.trim().toLowerCase() === 'purchase accounts');
                for (const vendor of allVendors) {
                    if (isPurchaseAcc || (vendor.group && descendantIds.has(vendor.group.toString()))) {
                        const bal = evalVendor(vendor);
                        transactionDebit += bal.debitTotal;
                        transactionCredit += bal.creditTotal;
                        birds += bal.birdsTotal;
                        weight += bal.weightTotal;
                        discountAndOther += bal.discountAndOther;
                        const dc = applyGroupTypeSign(group.type, bal.finalBalance);
                        debit += dc.debit;
                        credit += dc.credit;
                    }
                }

                for (const station of allStations) {
                    if (station.group && descendantIds.has(station.group.toString())) {
                        const bal = evalStation(station);
                        transactionDebit += bal.debitTotal;
                        transactionCredit += bal.creditTotal;
                        discountAndOther += bal.discountAndOther;
                        const dc = applyGroupTypeSign(group.type, bal.finalBalance);
                        debit += dc.debit;
                        credit += dc.credit;
                    }
                }

                closingBalance = debit - credit;
            }

            entries.push({
                type: 'subgroup',
                id: subGroup._id.toString(),
                name: subGroup.name,
                debit,
                credit,
                birds: birds || 0,
                weight: weight || 0,
                transactionDebit: transactionDebit || 0,
                transactionCredit: transactionCredit || 0,
                discountAndOther: discountAndOther || 0,
                closingBalance
            });
        }

        // 2. Direct Ledgers
        const directLedgers = allLedgers.filter(l => l.group && l.group.toString() === id.toString()).sort((a, b) => a.name.localeCompare(b.name));
        for (const ledger of directLedgers) {
            const bal = evalLedger(ledger);
            const dc = applyGroupTypeSign(group.type, bal.finalBalance);
            entries.push({
                type: 'ledger',
                id: ledger._id.toString(),
                name: ledger.name,
                debit: dc.debit,
                credit: dc.credit,
                birds: 0,
                weight: 0,
                transactionDebit: bal.debitTotal || 0,
                transactionCredit: bal.creditTotal || 0,
                discountAndOther: bal.discountAndOther || 0,
                closingBalance: bal.finalBalance
            });
        }

        // 3. Direct Customers
        const directCustomers = allCustomers.filter(c => c.group && c.group.toString() === id.toString()).sort((a, b) => (a.shopName || a.ownerName || '').localeCompare(b.shopName || b.ownerName || ''));
        for (const customer of directCustomers) {
            const bal = evalCustomer(customer);
            const dc = applyGroupTypeSign(group.type, bal.finalBalance);
            entries.push({
                type: 'customer',
                id: customer._id.toString(),
                name: customer.shopName || customer.ownerName || 'Customer',
                debit: dc.debit,
                credit: dc.credit,
                birds: bal.birdsTotal || 0,
                weight: bal.weightTotal || 0,
                transactionDebit: bal.debitTotal || 0,
                transactionCredit: bal.creditTotal || 0,
                discountAndOther: bal.discountAndOther || 0,
                closingBalance: bal.finalBalance
            });
        }

        // 4. Direct Vendors
        const isMainPurchaseAcc = group.name && (group.name.trim().toLowerCase() === 'purchase account' || group.name.trim().toLowerCase() === 'purchase accounts');
        const directVendors = (isMainPurchaseAcc ? allVendors : allVendors.filter(v => v.group && v.group.toString() === id.toString())).sort((a, b) => (a.companyName || a.vendorName || '').localeCompare(b.companyName || b.vendorName || ''));
        for (const vendor of directVendors) {
            const bal = evalVendor(vendor);
            const dc = applyGroupTypeSign(group.type, bal.finalBalance);
            entries.push({
                type: 'vendor',
                id: vendor._id.toString(),
                name: vendor.companyName || vendor.vendorName,
                debit: dc.debit,
                credit: dc.credit,
                birds: bal.birdsTotal || 0,
                weight: bal.weightTotal || 0,
                transactionDebit: bal.debitTotal || 0,
                transactionCredit: bal.creditTotal || 0,
                discountAndOther: bal.discountAndOther || 0,
                closingBalance: bal.finalBalance
            });
        }

        // 5. Direct Diesel Stations
        const directStations = allStations.filter(s => s.group && s.group.toString() === id.toString()).sort((a, b) => a.name.localeCompare(b.name));
        for (const station of directStations) {
            const bal = evalStation(station);
            let debit = 0, credit = 0;
            if (group.type === 'Assets' || group.type === 'Expenses') {
                if (bal.finalBalance >= 0) debit = Math.abs(bal.finalBalance);
                else credit = Math.abs(bal.finalBalance);
            } else {
                if (bal.finalBalance >= 0) credit = Math.abs(bal.finalBalance);
                else debit = Math.abs(bal.finalBalance);
            }
            entries.push({
                type: 'dieselStation',
                id: station._id.toString(),
                name: station.name,
                debit,
                credit,
                birds: 0,
                weight: 0,
                volume: bal.volume || 0,
                transactionDebit: bal.debitTotal || 0,
                transactionCredit: bal.creditTotal || 0,
                discountAndOther: bal.discountAndOther || 0,
                closingBalance: bal.finalBalance
            });
        }

        const totals = entries.reduce((acc, entry) => ({
            debit: acc.debit + (entry.debit || 0),
            credit: acc.credit + (entry.credit || 0),
            birds: acc.birds + (entry.birds || 0),
            weight: acc.weight + (entry.weight || 0),
            volume: acc.volume + (entry.volume || 0),
            discountAndOther: acc.discountAndOther + (entry.discountAndOther || 0)
        }), { debit: 0, credit: 0, birds: 0, weight: 0, volume: 0, discountAndOther: 0 });

        successResponse(res, "Group summary retrieved", 200, {
            group: {
                _id: group._id,
                name: group.name,
                type: group.type,
                parentGroup: group.parentGroup
            },
            entries,
            totals,
            dateRange: {
                startDate: finalStartDate,
                endDate: finalEndDate
            }
        });
    } catch (error) {
        next(error);
    }
};
