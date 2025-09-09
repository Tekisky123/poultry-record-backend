import Trip from "../models/Trip.js";
import Vehicle from "../models/Vehicle.js";
import AppError from "../utils/AppError.js";
import { successResponse } from "../utils/responseHandler.js";

// Create new trip (Supervisor only)
export const addTrip = async (req, res, next) => {
    try {
        // Only supervisors can create trips
        if (req.user.role !== 'supervisor') {
            throw new AppError('Only supervisors can create trips', 403);
        }

        console.log('Request body:', req.body);
        console.log('User role:', req.user.role);
        console.log('User ID:', req.user._id);
        console.log('Supervisor from body:', req.body.supervisor);
        
        const tripData = {
            ...req.body,
            supervisor: req.user._id, // Always use the logged-in supervisor's ID
            createdBy: req.user._id,
            updatedBy: req.user._id,
            date: req.body.date || new Date()
        };
        
        console.log('Final trip data:', tripData);

        // Check if vehicle is available
        const vehicle = await Vehicle.findById(tripData.vehicle);
        if (!vehicle) {
            throw new AppError('Vehicle not found', 404);
        }
        if (vehicle.currentStatus !== 'idle') {
            throw new AppError('Vehicle is not available for new trip', 400);
        }

        const trip = new Trip(tripData);
        await trip.save();

        // Update vehicle status
        await Vehicle.findByIdAndUpdate(tripData.vehicle, {
            currentStatus: 'in-transit',
            updatedBy: req.user._id
        });

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type capacityKg')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');

        successResponse(res, "New trip created!", 201, populatedTrip)
    } catch (error) {
        next(error);
    }
};

// Get all trips with role-based filtering
export const getTrips = async (req, res, next) => {
    try {
        const { status, startDate, endDate, page = 1, limit = 10, vehicle, supervisor } = req.query;

        let query = {};

        // Role-based filtering
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        } else if (req.user.role === 'admin' && supervisor) {
            query.supervisor = supervisor;
        }

        if (status) {
            query.status = status;
        }

        if (vehicle) {
            query.vehicle = vehicle;
        }

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        const trips = await Trip.find(query)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName')
            .populate('sales.client', 'shopName')
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

// Get trip by ID
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

// Update trip (Admin only)
export const updateTrip = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            throw new AppError('Only admin can update trip details', 403);
        }

        const { id } = req.params;
        const updateData = {
            ...req.body,
            updatedBy: req.user._id
        };

        const trip = await Trip.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('vehicle', 'vehicleNumber type')
         .populate('supervisor', 'name mobileNumber');

        if (!trip) throw new AppError('Trip not found', 404);

        successResponse(res, "Trip updated successfully", 200, trip);
    } catch (error) {
        next(error);
    }
};

// Delete trip (Admin only)
export const deleteTrip = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            throw new AppError('Only admin can delete trips', 403);
        }

        const { id } = req.params;
        const trip = await Trip.findById(id);

        if (!trip) throw new AppError('Trip not found', 404);

        // Update vehicle status back to idle
        if (trip.vehicle) {
            await Vehicle.findByIdAndUpdate(trip.vehicle, {
                currentStatus: 'idle',
                updatedBy: req.user._id
            });
        }

        await Trip.findByIdAndDelete(id);

        successResponse(res, "Trip deleted successfully", 200);
    } catch (error) {
        next(error);
    }
};

// Add purchase to trip (Supervisor)
export const addPurchase = async (req, res, next) => {
    try {
        const { id } = req.params;
        const purchaseData = req.body;

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found', 404);

        // Add purchase
        trip.purchases.push(purchaseData);

        // Update summary
        trip.summary.totalPurchaseAmount = trip.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
        trip.summary.totalBirdsPurchased = trip.purchases.reduce((sum, p) => sum + (p.birds || 0), 0);
        trip.summary.totalWeightPurchased = trip.purchases.reduce((sum, p) => sum + (p.weight || 0), 0);

        trip.updatedBy = req.user._id;
        await trip.save();

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');

        successResponse(res, "Purchase added to trip", 200, populatedTrip);
    } catch (error) {
        next(error);
    }
};

// Add sale to trip (Supervisor)
export const addSale = async (req, res, next) => {
    try {
        const { id } = req.params;
        const saleData = req.body;

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found', 404);

        // Add sale
        trip.sales.push(saleData);

        // Update summary
        trip.summary.totalSalesAmount = trip.sales.reduce((sum, s) => sum + (s.amount || 0), 0);
        trip.summary.totalBirdsSold = trip.sales.reduce((sum, s) => sum + (s.birds || 0), 0);
        trip.summary.totalWeightSold = trip.sales.reduce((sum, s) => sum + (s.weight || 0), 0);

        // Calculate remaining birds
        trip.summary.birdsRemaining = trip.summary.totalBirdsPurchased - trip.summary.totalBirdsSold;

        trip.updatedBy = req.user._id;
        await trip.save();

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');

        successResponse(res, "Sale added to trip", 200, populatedTrip);
    } catch (error) {
        next(error);
    }
};

// Add death birds to trip (Supervisor)
export const addDeathBirds = async (req, res, next) => {
    try {
        const { quantity, weight, rate, reason, date } = req.body;

        // Validate required fields
        if (!quantity || !weight || !rate || !date) {
            return errorResponse(res, "Quantity, weight, rate, and date are required", 400);
        }

        if (quantity <= 0 || weight <= 0 || rate <= 0) {
            return errorResponse(res, "Quantity, weight, and rate must be greater than 0", 400);
        }

        // Calculate derived fields
        const avgWeight = Number((weight / quantity).toFixed(2));
        const total = Number((weight * rate).toFixed(2));

        const deathBirdData = {
            quantity,
            weight,
            avgWeight,
            rate,
            total,
            reason: reason || '',
            date: new Date(date)
        };

        let query = { _id: req.params.id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) {
            return errorResponse(res, "Trip not found or access denied", 404);
        }

        // Add death bird to losses array
        trip.losses.push(deathBirdData);

        // Recalculate summary
        trip.summary.totalLosses = trip.losses.reduce((sum, loss) => sum + (loss.total || 0), 0);
        trip.summary.totalBirdsLost = trip.losses.reduce((sum, loss) => sum + (loss.quantity || 0), 0);
        trip.summary.totalWeightLost = trip.losses.reduce((sum, loss) => sum + (loss.weight || 0), 0);
        trip.summary.mortality = trip.summary.totalBirdsLost;

        // Calculate bird weight loss: purchased - sold - lost
        trip.summary.birdWeightLoss = (trip.summary.totalWeightPurchased || 0) - 
                                     (trip.summary.totalWeightSold || 0) - 
                                     (trip.summary.totalWeightLost || 0);

        // Calculate birds remaining: purchased - sold - lost
        trip.summary.birdsRemaining = (trip.summary.totalBirdsPurchased || 0) - 
                                     (trip.summary.totalBirdsSold || 0) - 
                                     (trip.summary.totalBirdsLost || 0);

        // Recalculate net profit (subtract losses)
        const totalRevenue = trip.summary.totalSalesAmount || 0;
        const totalCosts = (trip.summary.totalPurchaseAmount || 0) + (trip.summary.totalExpenses || 0) + (trip.summary.totalDieselAmount || 0);
        const totalLosses = trip.summary.totalLosses || 0;
        trip.summary.netProfit = totalRevenue - totalCosts - totalLosses;

        await trip.save();

        const populatedTrip = await Trip.findById(trip._id)
            .populate('supervisor', 'name email')
            .populate('vehicle', 'vehicleNumber driverName')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');

        successResponse(res, "Death birds added to trip", 200, populatedTrip);
    } catch (error) {
        next(error);
    }
};

// Update trip diesel (Supervisor)
export const updateTripDiesel = async (req, res, next) => {
    try {
        const { stations } = req.body;

        let query = { _id: req.params.id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);

        if (!trip) throw new AppError('Trip not found!', 404);

        trip.diesel.stations = stations;
        trip.diesel.totalVolume = stations.reduce((sum, station) => sum + (station.volume || 0), 0);
        trip.diesel.totalAmount = stations.reduce((sum, station) => sum + (station.amount || 0), 0);
        trip.updatedBy = req.user._id;
        trip.updatedAt = new Date();

        await trip.save();

        successResponse(res, 'Trip diesel updated!', 200, trip)
    } catch (error) {
        next(error)
    }
};

// Update trip expenses (Supervisor)
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
        trip.summary.totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        trip.updatedBy = req.user._id;
        trip.updatedAt = new Date();

        await trip.save();

        successResponse(res, "Trip expenses updated!", 200, trip);
    } catch (error) {
        next(error)
    }
}

// Complete trip (Supervisor)
export const completeTrip = async (req, res, next) => {
    try {
        const { closingOdometer, finalRemarks, birdsRemaining, mortality } = req.body;
        
        let query = { _id: req.params.id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);

        if (!trip) throw new AppError('Trip not found!', 404);

        // Update vehicle readings
        trip.vehicleReadings.closing = closingOdometer;
        if (trip.vehicleReadings.opening) {
            trip.vehicleReadings.totalDistance = closingOdometer - trip.vehicleReadings.opening;
        }

        // Update completion details
        trip.completionDetails = {
            completedAt: new Date(),
            closingOdometer,
            finalRemarks,
            supervisorSignature: req.user.name
        };

        // Update summary
        trip.summary.birdsRemaining = birdsRemaining || 0;
        trip.summary.mortality = mortality || 0;
        trip.summary.totalExpenses = trip.expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        trip.summary.totalDieselAmount = trip.diesel.totalAmount;

        // Calculate final profit
        trip.summary.netProfit = trip.summary.totalSalesAmount -
            trip.summary.totalPurchaseAmount -
            trip.summary.totalExpenses -
            trip.summary.totalDieselAmount;

        if (trip.summary.totalWeightSold > 0) {
            trip.summary.profitPerKg = Number((trip.summary.netProfit / trip.summary.totalWeightSold).toFixed(2));
        }

        // Calculate fuel efficiency
        if (trip.vehicleReadings.totalDistance && trip.diesel.totalVolume > 0) {
            trip.summary.fuelEfficiency = Number((trip.vehicleReadings.totalDistance / trip.diesel.totalVolume).toFixed(2));
        }

        trip.status = 'completed';
        trip.updatedBy = req.user._id;
        trip.updatedAt = new Date();

        await trip.save();

        // Update vehicle status back to idle
        if (trip.vehicle) {
            await Vehicle.findByIdAndUpdate(trip.vehicle, {
                currentStatus: 'idle',
                updatedBy: req.user._id
            });
        }

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');

        successResponse(res, "Trip completed successfully!", 200, populatedTrip);
    } catch (error) {
        next(error);
    }
};

// Get trip statistics for dashboard
export const getTripStats = async (req, res, next) => {
    try {
        let query = {};

        // Role-based filtering
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const stats = await Trip.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalTrips: { $sum: 1 },
                    completedTrips: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    ongoingTrips: { $sum: { $cond: [{ $eq: ['$status', 'ongoing'] }, 1, 0] } },
                    totalRevenue: { $sum: '$summary.totalSalesAmount' },
                    totalProfit: { $sum: '$summary.netProfit' },
                    totalBirdsSold: { $sum: '$summary.totalBirdsSold' },
                    totalExpenses: { $sum: '$summary.totalExpenses' }
                }
            }
        ]);

        const result = stats[0] || {
            totalTrips: 0,
            completedTrips: 0,
            ongoingTrips: 0,
            totalRevenue: 0,
            totalProfit: 0,
            totalBirdsSold: 0,
            totalExpenses: 0
        };

        successResponse(res, "Trip statistics fetched successfully", 200, result);
    } catch (error) {
        next(error);
    }
};