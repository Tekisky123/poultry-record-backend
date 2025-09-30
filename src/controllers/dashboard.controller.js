import Trip from "../models/Trip.js";
import { successResponse } from "../utils/responseHandler.js";

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
            userFilter.supervisor = req.user._id;
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

        successResponse(res, "dashboard stats", 200, undefined, {
            stats: dashboardStats,
            recentTrips
        })
    } catch (error) {
        next(error)
    }
}