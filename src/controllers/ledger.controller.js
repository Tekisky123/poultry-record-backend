import Ledger from "../models/Ledger.js";
import Group from "../models/Group.js";
import Vendor from "../models/Vendor.js";
import Customer from "../models/Customer.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";

export const addLedger = async (req, res, next) => {
    try {
        const { name, group, ledgerType, vendor, customer } = req.body;

        // Validate group exists
        const groupDoc = await Group.findById(group);
        if (!groupDoc || !groupDoc.isActive) {
            throw new AppError('Group not found or inactive', 404);
        }

        // Validate vendor if ledgerType is vendor
        if (ledgerType === 'vendor') {
            if (!vendor) {
                throw new AppError('Vendor is required when ledger type is vendor', 400);
            }
            const vendorDoc = await Vendor.findById(vendor);
            if (!vendorDoc || !vendorDoc.isActive) {
                throw new AppError('Vendor not found or inactive', 404);
            }
            // Use vendor name as ledger name if name not provided
            const ledgerName = name || vendorDoc.vendorName;
            const ledgerData = {
                name: ledgerName,
                group,
                ledgerType: 'vendor',
                vendor,
                customer: null,
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
            return;
        }

        // Validate customer if ledgerType is customer
        if (ledgerType === 'customer') {
            if (!customer) {
                throw new AppError('Customer is required when ledger type is customer', 400);
            }
            const customerDoc = await Customer.findById(customer);
            if (!customerDoc || !customerDoc.isActive) {
                throw new AppError('Customer not found or inactive', 404);
            }
            // Use customer shop name as ledger name if name not provided
            const ledgerName = name || customerDoc.shopName;
            const ledgerData = {
                name: ledgerName,
                group,
                ledgerType: 'customer',
                vendor: null,
                customer,
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
            return;
        }

        // For 'other' type
        if (!name) {
            throw new AppError('Ledger name is required for other type ledgers', 400);
        }

        const ledgerData = {
            name,
            group,
            ledgerType: 'other',
            vendor: null,
            customer: null,
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
        const { name, group, ledgerType, vendor, customer } = req.body;

        const ledger = await Ledger.findById(id);
        if (!ledger || !ledger.isActive) {
            throw new AppError('Ledger not found', 404);
        }

        // Validate group if changed
        if (group) {
            const groupDoc = await Group.findById(group);
            if (!groupDoc || !groupDoc.isActive) {
                throw new AppError('Group not found or inactive', 404);
            }
        }

        // Handle vendor type
        if (ledgerType === 'vendor') {
            if (!vendor) {
                throw new AppError('Vendor is required when ledger type is vendor', 400);
            }
            const vendorDoc = await Vendor.findById(vendor);
            if (!vendorDoc || !vendorDoc.isActive) {
                throw new AppError('Vendor not found or inactive', 404);
            }
            const updateData = {
                name: name || vendorDoc.vendorName,
                group: group || ledger.group,
                ledgerType: 'vendor',
                vendor,
                customer: null,
                updatedBy: req.user._id
            };
            const updatedLedger = await Ledger.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
                .populate('group', 'name type')
                .populate('vendor', 'vendorName email contactNumber')
                .populate('customer', 'shopName contact')
                .populate('createdBy', 'name')
                .populate('updatedBy', 'name');

            successResponse(res, "Ledger updated successfully", 200, updatedLedger);
            return;
        }

        // Handle customer type
        if (ledgerType === 'customer') {
            if (!customer) {
                throw new AppError('Customer is required when ledger type is customer', 400);
            }
            const customerDoc = await Customer.findById(customer);
            if (!customerDoc || !customerDoc.isActive) {
                throw new AppError('Customer not found or inactive', 404);
            }
            const updateData = {
                name: name || customerDoc.shopName,
                group: group || ledger.group,
                ledgerType: 'customer',
                vendor: null,
                customer,
                updatedBy: req.user._id
            };
            const updatedLedger = await Ledger.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
                .populate('group', 'name type')
                .populate('vendor', 'vendorName email contactNumber')
                .populate('customer', 'shopName contact')
                .populate('createdBy', 'name')
                .populate('updatedBy', 'name');

            successResponse(res, "Ledger updated successfully", 200, updatedLedger);
            return;
        }

        // Handle other type
        if (!name) {
            throw new AppError('Ledger name is required for other type ledgers', 400);
        }

        const updateData = {
            name,
            group: group || ledger.group,
            ledgerType: 'other',
            vendor: null,
            customer: null,
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

