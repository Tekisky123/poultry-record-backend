import Voucher from "../models/Voucher.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";
import mongoose from "mongoose";

export const createVoucher = async (req, res, next) => {
    try {
        const { voucherType, date, party, partyName, entries, narration } = req.body;

        // Validate required fields
        if (!voucherType || !entries || entries.length === 0) {
            throw new AppError('Voucher type and entries are required', 400);
        }

        // Validate entries structure
        for (let entry of entries) {
            if (!entry.account) {
                throw new AppError('Account name is required for each entry', 400);
            }
            if (entry.debitAmount < 0 || entry.creditAmount < 0) {
                throw new AppError('Debit and credit amounts cannot be negative', 400);
            }
        }

        // If party is provided, validate it exists
        let partyData = null;
        if (party) {
            partyData = await Customer.findById(party) || await Vendor.findById(party);
            if (!partyData) {
                throw new AppError('Party not found', 404);
            }
        }

        const voucherData = {
            voucherType,
            date: date || new Date(),
            party: party || null,
            partyName: partyName || (partyData ? partyData.shopName || partyData.vendorName : null),
            entries,
            narration,
            createdBy: req.user._id,
            updatedBy: req.user._id
        };

        const voucher = new Voucher(voucherData);
        const savedVoucher = await voucher.save();

        // Populate party data for response
        const populatedVoucher = await Voucher.findById(savedVoucher._id)
            .populate('party', 'shopName vendorName')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "Voucher created successfully", 201, populatedVoucher);
    } catch (error) {
        next(error);
    }
};

export const getVouchers = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, voucherType, startDate, endDate, search } = req.query;
        
        // Build query
        const query = { isActive: true };
        
        if (voucherType) {
            query.voucherType = voucherType;
        }
        
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        
        if (search) {
            query.$or = [
                { voucherNumber: { $regex: search, $options: 'i' } },
                { partyName: { $regex: search, $options: 'i' } },
                { narration: { $regex: search, $options: 'i' } }
            ];
        }

        const vouchers = await Voucher.find(query)
            .populate('party', 'shopName vendorName')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .sort({ date: -1, createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Voucher.countDocuments(query);

        // Calculate totals
        const allVouchers = await Voucher.find(query);
        const totalDebit = allVouchers.reduce((sum, voucher) => sum + voucher.totalDebit, 0);
        const totalCredit = allVouchers.reduce((sum, voucher) => sum + voucher.totalCredit, 0);

        successResponse(res, "Vouchers retrieved successfully", 200, {
            vouchers,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            },
            totals: {
                totalDebit,
                totalCredit,
                balance: totalDebit - totalCredit
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getVoucherById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const voucher = await Voucher.findOne({ _id: id, isActive: true })
            .populate('party', 'shopName vendorName contact address')
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');

        if (!voucher) {
            throw new AppError('Voucher not found', 404);
        }

        successResponse(res, "Voucher retrieved successfully", 200, voucher);
    } catch (error) {
        next(error);
    }
};

export const updateVoucher = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { voucherType, date, party, partyName, entries, narration, status } = req.body;

        const voucher = await Voucher.findById(id);
        if (!voucher) {
            throw new AppError('Voucher not found', 404);
        }

        // Validate entries if provided
        if (entries && entries.length > 0) {
            for (let entry of entries) {
                if (!entry.account) {
                    throw new AppError('Account name is required for each entry', 400);
                }
                if (entry.debitAmount < 0 || entry.creditAmount < 0) {
                    throw new AppError('Debit and credit amounts cannot be negative', 400);
                }
            }
        }

        // If party is provided, validate it exists
        let partyData = null;
        if (party) {
            partyData = await Customer.findById(party) || await Vendor.findById(party);
            if (!partyData) {
                throw new AppError('Party not found', 404);
            }
        }

        const updateData = {
            ...(voucherType && { voucherType }),
            ...(date && { date }),
            ...(party !== undefined && { party: party || null }),
            ...(partyName && { partyName }),
            ...(entries && { entries }),
            ...(narration !== undefined && { narration }),
            ...(status && { status }),
            updatedBy: req.user._id
        };

        const updatedVoucher = await Voucher.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('party', 'shopName vendorName')
         .populate('createdBy', 'name')
         .populate('updatedBy', 'name');

        successResponse(res, "Voucher updated successfully", 200, updatedVoucher);
    } catch (error) {
        next(error);
    }
};

export const deleteVoucher = async (req, res, next) => {
    try {
        const { id } = req.params;

        const voucher = await Voucher.findByIdAndUpdate(
            id,
            { isActive: false, updatedBy: req.user._id },
            { new: true }
        );

        if (!voucher) {
            throw new AppError('Voucher not found', 404);
        }

        successResponse(res, "Voucher deleted successfully", 200, voucher);
    } catch (error) {
        next(error);
    }
};

export const getVoucherStats = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        
        const query = { isActive: true };
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        const vouchers = await Voucher.find(query);
        
        // Group by voucher type
        const statsByType = {};
        let totalDebit = 0;
        let totalCredit = 0;

        vouchers.forEach(voucher => {
            const type = voucher.voucherType;
            if (!statsByType[type]) {
                statsByType[type] = {
                    count: 0,
                    totalDebit: 0,
                    totalCredit: 0
                };
            }
            statsByType[type].count += 1;
            statsByType[type].totalDebit += voucher.totalDebit;
            statsByType[type].totalCredit += voucher.totalCredit;
            
            totalDebit += voucher.totalDebit;
            totalCredit += voucher.totalCredit;
        });

        successResponse(res, "Voucher statistics retrieved successfully", 200, {
            statsByType,
            totals: {
                totalVouchers: vouchers.length,
                totalDebit,
                totalCredit,
                balance: totalDebit - totalCredit
            }
        });
    } catch (error) {
        next(error);
    }
};

export const exportVouchers = async (req, res, next) => {
    try {
        const { format = 'excel', voucherType, startDate, endDate } = req.query;
        
        // Build query
        const query = { isActive: true };
        if (voucherType) query.voucherType = voucherType;
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        const vouchers = await Voucher.find(query)
            .populate('party', 'shopName vendorName')
            .sort({ date: -1 });

        if (format === 'excel') {
            // For Excel export, we'll return JSON data that can be converted to Excel on frontend
            const excelData = vouchers.map(voucher => ({
                'Voucher Number': voucher.voucherNumber,
                'Date': voucher.date.toLocaleDateString(),
                'Voucher Type': voucher.voucherType,
                'Party Name': voucher.partyName || '',
                'Total Debit': voucher.totalDebit,
                'Total Credit': voucher.totalCredit,
                'Narration': voucher.narration || '',
                'Status': voucher.status,
                'Created By': voucher.createdBy?.name || '',
                'Created At': voucher.createdAt.toLocaleDateString()
            }));

            successResponse(res, "Vouchers exported successfully", 200, {
                data: excelData,
                filename: `vouchers_${new Date().toISOString().split('T')[0]}.xlsx`
            });
        } else {
            // For PDF, return structured data
            successResponse(res, "Vouchers data for PDF export", 200, {
                vouchers,
                totals: {
                    totalDebit: vouchers.reduce((sum, v) => sum + v.totalDebit, 0),
                    totalCredit: vouchers.reduce((sum, v) => sum + v.totalCredit, 0)
                }
            });
        }
    } catch (error) {
        next(error);
    }
};
