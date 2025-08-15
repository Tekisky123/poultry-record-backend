import Trip from "../models/Trip.js";
import AppError from "../utils/AppError.js";
import { successResponse } from "../utils/responseHandler.js";

export const addTrip = async (req, res, next) => {
    try {
        const tripData = {
            ...req.body,
            supervisor: req.user.userId,
            date: req.body.date || new Date()
        };

        const trip = new Trip(tripData);
        await trip.save();

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type capacityKg')
            .populate('supervisor', 'name mobileNumber');


        successResponse(res, "New trip created!", 201, populatedTrip)
    } catch (error) {
        next(error);
    }
};

export const getTrips = async (req, res, next) => {
    try {
        const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

        let query = {};

        // Role-based filtering
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        if (status) {
            query.status = status;
        }

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        const trips = await Trip.find(query)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Trip.countDocuments(query);

        successResponse(res, "Trips fetch successfully", 200, undefined, {
            trips,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        })
    } catch (error) {
        next(error)
    }
};

export const getTripById = async (req, res, next) => {
    try {
        let query = { _id: req.params.id };

        // Role-based filtering
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query)
            .populate('vehicle', 'vehicleNumber type capacity')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');

        if (!trip) throw new AppError('Trip not found', 404);

        successResponse(res, "Trip fetch successfully", 200, trip)
    } catch (error) {
        next(error)
    }
}

export const updateTripDiesel = async (req, res, next) => {
    try {
        const { stations } = req.body;

        let query = { _id: req.params.id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user.userId;
        }

        const trip = await Trip.findOne(query);

        if (!trip) throw new AppError('Trip not found!', 404);

        trip.diesel.stations = stations;
        trip.diesel.totalVolume = stations.reduce((sum, station) => sum + (station.volume || 0), 0);
        trip.diesel.totalAmount = stations.reduce((sum, station) => sum + (station.amount || 0), 0);
        trip.updatedAt = new Date();

        await trip.save();

        successResponse(res, 'Trip diesel updated!', 200, trip)
    } catch (error) {
        next(error)
    }
};

export const updateTripExpenses = async (req, res, next) => {
    try {
        const { expenses } = req.body;

        let query = { _id: req.params.id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        
        if (!trip) throw new AppError('Trip not found!', 404);

        trip.expenses = expenses;
        trip.updatedAt = new Date();

        await trip.save();

        successResponse(res, "Trip expenses updated!", 200, trip);
    } catch (error) {
        next(error)
    }
}

export const updateTripSales = async (req, res, next) => {
    try {
        const { sales } = req.body;

        let query = { _id: req.params.id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user.userId;
        }

        const trip = await Trip.findOne(query);

        if (!trip) throw new AppError('Trip not found!', 404);

        // Calculate average weight for each sale
        sales.forEach(sale => {
            if (sale.birds && sale.weight) {
                sale.avgWeight = (sale.weight / sale.birds).toFixed(2);
            }
        });

        trip.sales = sales;
        trip.updatedAt = new Date();

        // Update summary
        trip.summary.totalSalesAmount = sales.reduce((sum, s) => sum + (s.amount || 0), 0);
        trip.summary.totalBirdsSold = sales.reduce((sum, s) => sum + (s.birds || 0), 0);
        trip.summary.totalWeightSold = sales.reduce((sum, s) => sum + (s.weight || 0), 0);

        // Calculate mortality
        trip.summary.mortality = trip.summary.totalBirdsPurchased - trip.summary.totalBirdsSold;

        await trip.save();

        successResponse(res, "Trip sales updated!", 200, trip);
    } catch (error) {
        next(error)
    }
}

export const updateCompleteTrip = async (req, res, next) => {
    try {
        let query = { _id: req.params.id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user.userId;
        }

        const trip = await Trip.findOne(query);

        if (!trip) throw new AppError('Trip not found!', 404);

        // Calculate final summary
        const totalExpenses = trip.expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

        trip.summary.totalExpenses = totalExpenses;
        trip.summary.totalDieselAmount = trip.diesel.totalAmount;

        trip.summary.netProfit = trip.summary.totalSalesAmount -
            trip.summary.totalPurchaseAmount -
            trip.summary.totalExpenses -
            trip.summary.totalDieselAmount;

        if (trip.summary.totalWeightSold > 0) {
            trip.summary.profitPerKg = (trip.summary.netProfit / trip.summary.totalWeightSold).toFixed(2);
        }

        // Calculate fuel efficiency if distance is available
        if (trip.route.distance && trip.diesel.totalVolume > 0) {
            trip.summary.fuelEfficiency = (trip.route.distance / trip.diesel.totalVolume).toFixed(2);
        }

        trip.status = 'completed';
        trip.updatedAt = new Date();

        await trip.save();

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');


        successResponse(res, "Complete trip updated!", 200, populatedTrip);
    } catch (error) {
        next(error)
    }
}