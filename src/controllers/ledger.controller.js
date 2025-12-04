import Ledger from "../models/Ledger.js";
import Group from "../models/Group.js";
import Vendor from "../models/Vendor.js";
import Customer from "../models/Customer.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";
import { syncOutstandingBalance } from "../utils/balanceUtils.js";

export const addLedger = async (req, res, next) => {
    try {
        const { name, group, openingBalance, openingBalanceType, outstandingBalance, outstandingBalanceType } = req.body;

        // Validate required fields
        if (!name) {
            throw new AppError('Ledger name is required', 400);
        }

        // Validate group exists
        const groupDoc = await Group.findById(group);
        if (!groupDoc || !groupDoc.isActive) {
            throw new AppError('Group not found or inactive', 404);
        }

        const openingValue = openingBalance || 0;
        const openingType = openingBalanceType || 'debit';
        
        // If outstanding balance is provided, use it; otherwise default to opening balance
        const outstandingValue = outstandingBalance !== undefined ? outstandingBalance : openingValue;
        const outstandingType = outstandingBalanceType !== undefined ? outstandingBalanceType : openingType;

        const ledgerData = {
            name,
            group,
            openingBalance: openingValue,
            openingBalanceType: openingType,
            outstandingBalance: outstandingValue,
            outstandingBalanceType: outstandingType,
            createdBy: req.user._id,
            updatedBy: req.user._id
        };

        const ledger = new Ledger(ledgerData);
        await ledger.save();

        const populatedLedger = await Ledger.findById(ledger._id)
            .populate('group', 'name type')
            .populate('vendor', 'vendorName email contactNumber')
            .populate('customer', 'shopName contact')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "New ledger added", 201, populatedLedger);
    } catch (error) {
        next(error);
    }
};

export const getLedgers = async (req, res, next) => {
    try {
        const { group, ledgerType } = req.query;
        const query = { isActive: true };

        if (group) {
            query.group = group;
        }
        if (ledgerType) {
            query.ledgerType = ledgerType;
        }

        const ledgers = await Ledger.find(query)
            .populate('group', 'name type')
            .populate('vendor', 'vendorName email contactNumber')
            .populate('customer', 'shopName contact')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .sort({ name: 1 });

        successResponse(res, "Ledgers retrieved successfully", 200, ledgers);
    } catch (error) {
        next(error);
    }
};

export const getLedgerById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const ledger = await Ledger.findOne({ _id: id, isActive: true })
            .populate('group', 'name type')
            .populate('vendor', 'vendorName email contactNumber')
            .populate('customer', 'shopName contact')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        if (!ledger) {
            throw new AppError('Ledger not found', 404);
        }

        successResponse(res, "Ledger retrieved successfully", 200, ledger);
    } catch (error) {
        next(error);
    }
};

export const getLedgersByGroup = async (req, res, next) => {
    const { groupId } = req.params;
    try {
        // Validate group exists
        const group = await Group.findById(groupId);
        if (!group || !group.isActive) {
            throw new AppError('Group not found or inactive', 404);
        }

        const ledgers = await Ledger.find({ group: groupId, isActive: true })
            .populate('group', 'name type')
            .populate('vendor', 'vendorName email contactNumber')
            .populate('customer', 'shopName contact')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .sort({ name: 1 });

        successResponse(res, "Ledgers retrieved successfully", 200, ledgers);
    } catch (error) {
        next(error);
    }
};

export const updateLedger = async (req, res, next) => {
    const { id } = req.params;
    try {
        const { name, group, openingBalance, openingBalanceType, outstandingBalance, outstandingBalanceType } = req.body;

        const ledger = await Ledger.findById(id);
        if (!ledger || !ledger.isActive) {
            throw new AppError('Ledger not found', 404);
        }

        // Validate required fields
        if (!name) {
            throw new AppError('Ledger name is required', 400);
        }

        // Validate group if changed
        if (group) {
            const groupDoc = await Group.findById(group);
            if (!groupDoc || !groupDoc.isActive) {
                throw new AppError('Group not found or inactive', 404);
            }
        }

        // Check if opening balance is being changed
        const isOpeningBalanceChanged = openingBalance !== undefined || openingBalanceType !== undefined;
        
        let newOutstandingBalance = outstandingBalance !== undefined ? outstandingBalance : ledger.outstandingBalance;
        let newOutstandingBalanceType = outstandingBalanceType !== undefined ? outstandingBalanceType : ledger.outstandingBalanceType;

        // If opening balance changed, sync outstanding balance
        if (isOpeningBalanceChanged) {
            const newOpeningAmount = openingBalance !== undefined ? openingBalance : ledger.openingBalance;
            const newOpeningType = openingBalanceType !== undefined ? openingBalanceType : ledger.openingBalanceType;
            
            const syncedBalance = syncOutstandingBalance(
                ledger.openingBalance,
                ledger.openingBalanceType,
                newOpeningAmount,
                newOpeningType,
                ledger.outstandingBalance,
                ledger.outstandingBalanceType
            );
            
            newOutstandingBalance = syncedBalance.amount;
            newOutstandingBalanceType = syncedBalance.type;
        }

        const updateData = {
            name,
            group: group || ledger.group,
            openingBalance: openingBalance !== undefined ? openingBalance : ledger.openingBalance,
            openingBalanceType: openingBalanceType !== undefined ? openingBalanceType : ledger.openingBalanceType,
            outstandingBalance: newOutstandingBalance,
            outstandingBalanceType: newOutstandingBalanceType,
            updatedBy: req.user._id
        };

        const updatedLedger = await Ledger.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
            .populate('group', 'name type')
            .populate('vendor', 'vendorName email contactNumber')
            .populate('customer', 'shopName contact')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "Ledger updated successfully", 200, updatedLedger);
    } catch (error) {
        next(error);
    }
};

export const deleteLedger = async (req, res, next) => {
    const { id } = req.params;
    try {
        const ledger = await Ledger.findById(id);
        if (!ledger || !ledger.isActive) {
            throw new AppError('Ledger not found', 404);
        }

        // Soft delete
        const deletedLedger = await Ledger.findByIdAndUpdate(
            id,
            { isActive: false, updatedBy: req.user._id },
            { new: true }
        );

        successResponse(res, "Ledger deleted successfully", 200, deletedLedger);
    } catch (error) {
        next(error);
    }
};

