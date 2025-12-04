import Group from "../models/Group.js";
import Ledger from "../models/Ledger.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import Voucher from "../models/Voucher.js";
import Trip from "../models/Trip.js";
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
            .populate('parentGroup', 'name type')
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

        const groups = await Group.find(query)
            .populate('parentGroup', 'name type')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .sort({ name: 1 })
            .lean();

        // Get ledger counts for all groups in a single aggregation query
        const ledgerCounts = await Ledger.aggregate([
            { $match: { isActive: true, group: { $exists: true, $ne: null } } },
            { $group: { _id: '$group', count: { $sum: 1 } } }
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
            .populate('parentGroup', 'name type')
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
const calculateLedgerBalance = async (ledgerId, openingBalance, openingBalanceType, asOnDate = null) => {
    try {
        const query = {
            isActive: true
        };

        if (asOnDate) {
            query.date = { $lte: new Date(asOnDate) };
        }

        const vouchers = await Voucher.find(query).lean();

        let debitTotal = 0;
        let creditTotal = 0;

        vouchers.forEach(voucher => {
            voucher.entries.forEach(entry => {
                // Match by ledger ID
                if (entry.account && entry.account.toString() === ledgerId.toString()) {
                    debitTotal += entry.debitAmount || 0;
                    creditTotal += entry.creditAmount || 0;
                }
            });
        });

        // Start with opening balance
        const openingSigned = toSignedValue(openingBalance || 0, openingBalanceType || 'debit');
        
        // Add transactions
        const finalSigned = openingSigned + debitTotal - creditTotal;

        return { 
            debitTotal, 
            creditTotal, 
            finalBalance: finalSigned 
        };
    } catch (error) {
        console.error('Error calculating ledger balance:', error);
        return { debitTotal: 0, creditTotal: 0, finalBalance: 0 };
    }
};

// Calculate customer balance from vouchers and sales up to asOnDate
const calculateCustomerBalance = async (customerId, customerName, openingBalance, openingBalanceType, asOnDate = null) => {
    try {
        let debitTotal = 0;
        let creditTotal = 0;

        // Get vouchers up to asOnDate
        const voucherQuery = {
            isActive: true,
            status: 'posted'
        };

        if (asOnDate) {
            voucherQuery.date = { $lte: new Date(asOnDate) };
        }

        const vouchers = await Voucher.find(voucherQuery).lean();

        // Process vouchers
        vouchers.forEach(voucher => {
            // Check Payment/Receipt vouchers with parties array
            if ((voucher.voucherType === 'Payment' || voucher.voucherType === 'Receipt') && voucher.parties) {
                voucher.parties.forEach(party => {
                    if (party.partyId && party.partyId.toString() === customerId.toString() && party.partyType === 'customer') {
                        if (voucher.voucherType === 'Payment') {
                            // Payment: customer balance increases (debit to customer)
                            debitTotal += party.amount || 0;
                        } else if (voucher.voucherType === 'Receipt') {
                            // Receipt: customer balance decreases (credit to customer)
                            creditTotal += party.amount || 0;
                        }
                    }
                });
            }

            // Check entries array for customer name match
            voucher.entries.forEach(entry => {
                if (entry.account && entry.account.trim().toLowerCase() === customerName.trim().toLowerCase()) {
                    debitTotal += entry.debitAmount || 0;
                    creditTotal += entry.creditAmount || 0;
                }
            });
        });

        // Get sales from trips up to asOnDate
        const tripQuery = {
            'sales.client': customerId,
            'sales.isReceipt': { $ne: true }
        };

        if (asOnDate) {
            tripQuery.createdAt = { $lte: new Date(asOnDate) };
        }

        const trips = await Trip.find(tripQuery).lean();

        trips.forEach(trip => {
            trip.sales.forEach(sale => {
                if (sale.client && sale.client.toString() === customerId.toString() && !sale.isReceipt) {
                    // Sales increase customer balance (debit to customer)
                    debitTotal += sale.amount || 0;
                    // Payments decrease customer balance (credit to customer)
                    creditTotal += (sale.cashPaid || 0) + (sale.onlinePaid || 0) + (sale.discount || 0);
                }
            });
        });

        // Start with opening balance
        const openingSigned = toSignedValue(openingBalance || 0, openingBalanceType || 'debit');
        
        // Add transactions
        const finalSigned = openingSigned + debitTotal - creditTotal;

        return { 
            debitTotal, 
            creditTotal, 
            finalBalance: finalSigned 
        };
    } catch (error) {
        console.error('Error calculating customer balance:', error);
        return { debitTotal: 0, creditTotal: 0, finalBalance: 0 };
    }
};

// Calculate vendor balance from vouchers and purchases up to asOnDate
const calculateVendorBalance = async (vendorId, vendorName, asOnDate = null) => {
    try {
        let debitTotal = 0;
        let creditTotal = 0;

        // Get vouchers up to asOnDate
        const voucherQuery = {
            isActive: true,
            status: 'posted'
        };

        if (asOnDate) {
            voucherQuery.date = { $lte: new Date(asOnDate) };
        }

        const vouchers = await Voucher.find(voucherQuery).lean();

        // Process vouchers
        vouchers.forEach(voucher => {
            // Check Payment/Receipt vouchers with parties array
            if ((voucher.voucherType === 'Payment' || voucher.voucherType === 'Receipt') && voucher.parties) {
                voucher.parties.forEach(party => {
                    if (party.partyId && party.partyId.toString() === vendorId.toString() && party.partyType === 'vendor') {
                        if (voucher.voucherType === 'Payment') {
                            // Payment: vendor balance increases (debit to vendor - we owe them more)
                            debitTotal += party.amount || 0;
                        } else if (voucher.voucherType === 'Receipt') {
                            // Receipt: vendor balance decreases (credit to vendor - we pay them)
                            creditTotal += party.amount || 0;
                        }
                    }
                });
            }

            // Check entries array for vendor name match
            voucher.entries.forEach(entry => {
                if (entry.account && entry.account.trim().toLowerCase() === vendorName.trim().toLowerCase()) {
                    debitTotal += entry.debitAmount || 0;
                    creditTotal += entry.creditAmount || 0;
                }
            });
        });

        // Get purchases from trips up to asOnDate
        const tripQuery = {
            'purchases.supplier': vendorId
        };

        if (asOnDate) {
            tripQuery.createdAt = { $lte: new Date(asOnDate) };
        }

        const trips = await Trip.find(tripQuery).lean();

        trips.forEach(trip => {
            trip.purchases.forEach(purchase => {
                if (purchase.supplier && purchase.supplier.toString() === vendorId.toString()) {
                    // Purchases increase vendor balance (debit to vendor - we owe them)
                    debitTotal += purchase.amount || 0;
                }
            });
        });

        // Vendors don't have opening balance, start from 0
        // Add transactions
        const finalSigned = debitTotal - creditTotal;

        return { 
            debitTotal, 
            creditTotal, 
            finalBalance: finalSigned 
        };
    } catch (error) {
        console.error('Error calculating vendor balance:', error);
        return { debitTotal: 0, creditTotal: 0, finalBalance: 0 };
    }
};

// Recursively get all ledgers in a group (including nested sub-groups)
const getAllLedgersInGroup = async (groupId) => {
    const allLedgers = [];
    
    // Get direct ledgers
    const directLedgers = await Ledger.find({ group: groupId, isActive: true }).lean();
    allLedgers.push(...directLedgers);
    
    // Get all sub-groups (direct children)
    const subGroups = await Group.find({ parentGroup: groupId, isActive: true }).lean();
    
    // Recursively get ledgers from sub-groups
    for (const subGroup of subGroups) {
        const subGroupLedgers = await getAllLedgersInGroup(subGroup._id);
        allLedgers.push(...subGroupLedgers);
    }
    
    return allLedgers;
};

// Recursively get all customers in a group (including nested sub-groups)
const getAllCustomersInGroup = async (groupId) => {
    const allCustomers = [];
    
    // Get direct customers
    const directCustomers = await Customer.find({ group: groupId, isActive: true }).lean();
    allCustomers.push(...directCustomers);
    
    // Get all sub-groups (direct children)
    const subGroups = await Group.find({ parentGroup: groupId, isActive: true }).lean();
    
    // Recursively get customers from sub-groups
    for (const subGroup of subGroups) {
        const subGroupCustomers = await getAllCustomersInGroup(subGroup._id);
        allCustomers.push(...subGroupCustomers);
    }
    
    return allCustomers;
};

// Recursively get all vendors in a group (including nested sub-groups)
const getAllVendorsInGroup = async (groupId) => {
    const allVendors = [];
    
    // Get direct vendors
    const directVendors = await Vendor.find({ group: groupId, isActive: true }).lean();
    allVendors.push(...directVendors);
    
    // Get all sub-groups (direct children)
    const subGroups = await Group.find({ parentGroup: groupId, isActive: true }).lean();
    
    // Recursively get vendors from sub-groups
    for (const subGroup of subGroups) {
        const subGroupVendors = await getAllVendorsInGroup(subGroup._id);
        allVendors.push(...subGroupVendors);
    }
    
    return allVendors;
};

// Calculate group debit/credit from all ledgers, customers, and vendors
const calculateGroupDebitCredit = async (groupId, groupType, asOnDate = null) => {
    const allLedgers = await getAllLedgersInGroup(groupId);
    const allCustomers = await getAllCustomersInGroup(groupId);
    const allVendors = await getAllVendorsInGroup(groupId);
    
    let totalDebit = 0;
    let totalCredit = 0;
    
    // Calculate from ledgers
    for (const ledger of allLedgers) {
        const openingBalance = ledger.openingBalance || 0;
        const openingBalanceType = ledger.openingBalanceType || 'debit';
        
        const ledgerBalance = await calculateLedgerBalance(
            ledger._id, 
            openingBalance, 
            openingBalanceType, 
            asOnDate
        );
        
        const finalSigned = ledgerBalance.finalBalance;
        
        // For Assets: Debit increases, Credit decreases
        // For Liability: Credit increases, Debit decreases
        // For Income: Credit increases, Debit decreases (similar to Liability)
        // For Expenses: Debit increases, Credit decreases (similar to Assets)
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
        const openingBalance = customer.openingBalance || 0;
        const openingBalanceType = customer.openingBalanceType || 'debit';
        const customerName = customer.shopName || customer.ownerName || 'Customer';
        
        const customerBalance = await calculateCustomerBalance(
            customer._id,
            customerName,
            openingBalance,
            openingBalanceType,
            asOnDate
        );
        
        const finalSigned = customerBalance.finalBalance;
        
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
        const vendorName = vendor.vendorName || 'Vendor';
        
        const vendorBalance = await calculateVendorBalance(
            vendor._id,
            vendorName,
            asOnDate
        );
        
        const finalSigned = vendorBalance.finalBalance;
        
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
    
    return { debit: totalDebit, credit: totalCredit };
};

// Get group summary with ledgers and sub-groups
export const getGroupSummary = async (req, res, next) => {
    const { id } = req.params;
    const { asOnDate } = req.query;
    
    try {
        const group = await Group.findById(id).lean();
        if (!group || !group.isActive) {
            throw new AppError('Group not found', 404);
        }

        // Get all sub-groups (direct children only)
        const subGroups = await Group.find({ parentGroup: id, isActive: true })
            .sort({ name: 1 })
            .lean();

        // Get all ledgers directly in this group (not in sub-groups)
        const directLedgers = await Ledger.find({ group: id, isActive: true })
            .sort({ name: 1 })
            .lean();

        // Get all customers directly in this group (not in sub-groups)
        const directCustomers = await Customer.find({ group: id, isActive: true })
            .sort({ shopName: 1 })
            .lean();

        // Get all vendors directly in this group (not in sub-groups)
        const directVendors = await Vendor.find({ group: id, isActive: true })
            .sort({ vendorName: 1 })
            .lean();

        // Prepare entries array
        const entries = [];

        // Add sub-groups with their calculated debit/credit (sum of all ledgers in that group)
        for (const subGroup of subGroups) {
            const { debit, credit } = await calculateGroupDebitCredit(
                subGroup._id, 
                group.type, 
                asOnDate
            );

            entries.push({
                type: 'subgroup',
                id: subGroup._id.toString(),
                name: subGroup.name,
                debit,
                credit
            });
        }

        // Add direct ledgers (not in sub-groups)
        for (const ledger of directLedgers) {
            const openingBalance = ledger.openingBalance || 0;
            const openingBalanceType = ledger.openingBalanceType || 'debit';
            
            const ledgerBalance = await calculateLedgerBalance(
                ledger._id, 
                openingBalance, 
                openingBalanceType, 
                asOnDate
            );
            
            const finalSigned = ledgerBalance.finalBalance;
            
            let debit = 0;
            let credit = 0;
            
            // For Assets: Debit increases, Credit decreases
            // For Liability: Credit increases, Debit decreases
            // For Income: Credit increases, Debit decreases (similar to Liability)
            // For Expenses: Debit increases, Credit decreases (similar to Assets)
            if (group.type === 'Assets' || group.type === 'Expenses') {
                if (finalSigned >= 0) {
                    debit = Math.abs(finalSigned);
                } else {
                    credit = Math.abs(finalSigned);
                }
            } else if (group.type === 'Liability' || group.type === 'Income') {
                if (finalSigned >= 0) {
                    credit = Math.abs(finalSigned);
                } else {
                    debit = Math.abs(finalSigned);
                }
            } else {
                // For Others type, use Assets logic
                if (finalSigned >= 0) {
                    debit = Math.abs(finalSigned);
                } else {
                    credit = Math.abs(finalSigned);
                }
            }

            entries.push({
                type: 'ledger',
                id: ledger._id.toString(),
                name: ledger.name,
                debit,
                credit
            });
        }

        // Add customers
        for (const customer of directCustomers) {
            const openingBalance = customer.openingBalance || 0;
            const openingBalanceType = customer.openingBalanceType || 'debit';
            const customerName = customer.shopName || customer.ownerName || 'Customer';
            
            const customerBalance = await calculateCustomerBalance(
                customer._id,
                customerName,
                openingBalance,
                openingBalanceType,
                asOnDate
            );
            
            const finalSigned = customerBalance.finalBalance;
            
            let debit = 0;
            let credit = 0;
            
            // For Assets: Debit increases, Credit decreases
            // For Liability: Credit increases, Debit decreases
            // For Income: Credit increases, Debit decreases (similar to Liability)
            // For Expenses: Debit increases, Credit decreases (similar to Assets)
            if (group.type === 'Assets' || group.type === 'Expenses') {
                if (finalSigned >= 0) {
                    debit = Math.abs(finalSigned);
                } else {
                    credit = Math.abs(finalSigned);
                }
            } else if (group.type === 'Liability' || group.type === 'Income') {
                if (finalSigned >= 0) {
                    credit = Math.abs(finalSigned);
                } else {
                    debit = Math.abs(finalSigned);
                }
            } else {
                // For Others type, use Assets logic
                if (finalSigned >= 0) {
                    debit = Math.abs(finalSigned);
                } else {
                    credit = Math.abs(finalSigned);
                }
            }

            entries.push({
                type: 'customer',
                id: customer._id.toString(),
                name: customerName,
                debit,
                credit
            });
        }

        // Add vendors
        for (const vendor of directVendors) {
            const vendorName = vendor.vendorName || 'Vendor';
            
            const vendorBalance = await calculateVendorBalance(
                vendor._id,
                vendorName,
                asOnDate
            );
            
            const finalSigned = vendorBalance.finalBalance;
            
            let debit = 0;
            let credit = 0;
            
            // For Assets: Debit increases, Credit decreases
            // For Liability: Credit increases, Debit decreases
            // For Income: Credit increases, Debit decreases (similar to Liability)
            // For Expenses: Debit increases, Credit decreases (similar to Assets)
            if (group.type === 'Assets' || group.type === 'Expenses') {
                if (finalSigned >= 0) {
                    debit = Math.abs(finalSigned);
                } else {
                    credit = Math.abs(finalSigned);
                }
            } else if (group.type === 'Liability' || group.type === 'Income') {
                if (finalSigned >= 0) {
                    credit = Math.abs(finalSigned);
                } else {
                    debit = Math.abs(finalSigned);
                }
            } else {
                // For Others type, use Assets logic
                if (finalSigned >= 0) {
                    debit = Math.abs(finalSigned);
                } else {
                    credit = Math.abs(finalSigned);
                }
            }

            entries.push({
                type: 'vendor',
                id: vendor._id.toString(),
                name: vendorName,
                debit,
                credit
            });
        }

        // Calculate grand totals
        const grandTotalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
        const grandTotalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);

        // Get parent group information for breadcrumb
        let parentGroup = null;
        if (group.parentGroup) {
            const parent = await Group.findById(group.parentGroup).lean();
            if (parent) {
                parentGroup = {
                    id: parent._id.toString(),
                    name: parent.name
                };
            }
        }

        const summary = {
            group: {
                id: group._id.toString(),
                name: group.name,
                type: group.type
            },
            parentGroup,
            entries,
            totals: {
                debit: grandTotalDebit,
                credit: grandTotalCredit
            },
            asOnDate: asOnDate || new Date().toISOString().split('T')[0]
        };

        successResponse(res, "Group summary retrieved successfully", 200, summary);
    } catch (error) {
        next(error);
    }
};

