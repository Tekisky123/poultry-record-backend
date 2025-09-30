import IndirectExpense from "../models/IndirectExpense.js";
import AppError from "../utils/AppError.js";
import { successResponse } from "../utils/responseHandler.js";

// Create new indirect expense (Admin only)
export const addIndirectExpense = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            throw new AppError('Only admin can add indirect expenses', 403);
        }

        const expenseData = {
            ...req.body,
            createdBy: req.user._id,
            updatedBy: req.user._id
        };

        const expense = new IndirectExpense(expenseData);
        await expense.save();

        const populatedExpense = await IndirectExpense.findById(expense._id)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');

        successResponse(res, "Indirect expense added successfully", 201, populatedExpense);
    } catch (error) {
        next(error);
    }
};

// Get all indirect expenses with filtering
export const getIndirectExpenses = async (req, res, next) => {
    try {
        const { 
            category, 
            startDate, 
            endDate, 
            page = 1, 
            limit = 10,
            isActive = true 
        } = req.query;

        let query = { isActive };

        // Date filtering
        if (startDate || endDate) {
            query.expenseDate = {};
            if (startDate) query.expenseDate.$gte = new Date(startDate);
            if (endDate) query.expenseDate.$lte = new Date(endDate);
        }

        // Category filtering
        if (category) {
            query.category = category;
        }

        const expenses = await IndirectExpense.find(query)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .sort({ expenseDate: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await IndirectExpense.countDocuments(query);

        successResponse(res, "Indirect expenses fetched successfully", 200, undefined, {
            expenses,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};

// Get indirect expense by ID
export const getIndirectExpenseById = async (req, res, next) => {
    try {
        const expense = await IndirectExpense.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');

        if (!expense) throw new AppError('Indirect expense not found', 404);

        successResponse(res, "Indirect expense fetched successfully", 200, expense);
    } catch (error) {
        next(error);
    }
};

// Update indirect expense (Admin only)
export const updateIndirectExpense = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            throw new AppError('Only admin can update indirect expenses', 403);
        }

        const { id } = req.params;
        const updateData = {
            ...req.body,
            updatedBy: req.user._id
        };

        const expense = await IndirectExpense.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email')
         .populate('updatedBy', 'name email');

        if (!expense) throw new AppError('Indirect expense not found', 404);

        successResponse(res, "Indirect expense updated successfully", 200, expense);
    } catch (error) {
        next(error);
    }
};

// Delete indirect expense (Admin only)
export const deleteIndirectExpense = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            throw new AppError('Only admin can delete indirect expenses', 403);
        }

        const { id } = req.params;
        const expense = await IndirectExpense.findByIdAndUpdate(
            id,
            { isActive: false, updatedBy: req.user._id },
            { new: true }
        );

        if (!expense) throw new AppError('Indirect expense not found', 404);

        successResponse(res, "Indirect expense deleted successfully", 200);
    } catch (error) {
        next(error);
    }
};

// Get indirect expense statistics
export const getIndirectExpenseStats = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;

        let matchQuery = { isActive: true };
        
        if (startDate || endDate) {
            matchQuery.expenseDate = {};
            if (startDate) matchQuery.expenseDate.$gte = new Date(startDate);
            if (endDate) matchQuery.expenseDate.$lte = new Date(endDate);
        }

        const stats = await IndirectExpense.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalExpenses: { $sum: '$amount' },
                    totalCount: { $sum: 1 },
                    avgExpense: { $avg: '$amount' },
                    maxExpense: { $max: '$amount' },
                    minExpense: { $min: '$amount' }
                }
            }
        ]);

        // Get category-wise breakdown
        const categoryStats = await IndirectExpense.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$category',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);

        // Get monthly breakdown
        const monthlyStats = await IndirectExpense.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: {
                        year: { $year: '$expenseDate' },
                        month: { $month: '$expenseDate' }
                    },
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } }
        ]);

        const result = {
            summary: stats[0] || {
                totalExpenses: 0,
                totalCount: 0,
                avgExpense: 0,
                maxExpense: 0,
                minExpense: 0
            },
            categoryBreakdown: categoryStats,
            monthlyBreakdown: monthlyStats
        };

        successResponse(res, "Indirect expense statistics fetched successfully", 200, result);
    } catch (error) {
        next(error);
    }
};
