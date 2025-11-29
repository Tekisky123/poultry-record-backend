import Trip from "../models/Trip.js";
import Vehicle from "../models/Vehicle.js";
import User from "../models/User.js";
import Customer from "../models/Customer.js";
import Ledger from "../models/Ledger.js";
import AppError from "../utils/AppError.js";
import { successResponse } from "../utils/responseHandler.js";

const buildTransferPopulate = (depth = 3) => {
    if (depth <= 0) return null;

    const nestedPopulate = buildTransferPopulate(depth - 1);

    const populateConfig = {
        path: 'transferredFrom',
        select: 'tripId supervisor type purchases transferredFrom',
        populate: [
            { path: 'supervisor', select: 'name mobileNumber' },
            { path: 'purchases.supplier', select: 'vendorName' }
        ]
    };

    if (nestedPopulate) {
        populateConfig.populate.push(nestedPopulate);
    }

    return populateConfig;
};

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

        // Validate opening odometer reading
        if (!tripData.vehicleReadings?.opening || tripData.vehicleReadings.opening < 0) {
            throw new AppError('Valid opening odometer reading is required', 400);
        }

        // Validate route locations
        if (!tripData.route?.from || !tripData.route?.to) {
            throw new AppError('Start location and end location are required', 400);
        }

        // Check if vehicle is available
        const vehicle = await Vehicle.findById(tripData.vehicle);
        if (!vehicle) {
            throw new AppError('Vehicle not found', 404);
        }
        if (vehicle.currentStatus !== 'idle') {
            throw new AppError('Vehicle is not available for new trip', 400);
        }

        // Set rent per KM from vehicle
        tripData.rentPerKm = vehicle.rentPerKm || 0;

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

        const transferPopulate = buildTransferPopulate(5);

        let queryBuilder = Trip.find(query)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName')
            .populate('sales.client', 'shopName')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        if (transferPopulate) {
            queryBuilder = queryBuilder.populate(transferPopulate);
        }

        const trips = await queryBuilder;

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

        const transferPopulate = buildTransferPopulate(5);

        let queryBuilder = Trip.findOne(query)
            .populate('vehicle', 'vehicleNumber type capacity')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact')
            .populate('transferHistory.transferredToSupervisor', 'name mobileNumber')
            .populate({
                path: 'transferHistory.transferredTo',
                populate: {
                    path: 'vehicle',
                    select: 'vehicleNumber'
                }
            });

        if (transferPopulate) {
            queryBuilder = queryBuilder.populate(transferPopulate);
        }

        const trip = await queryBuilder;

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

// Delete trip (Superadmin only)
export const deleteTrip = async (req, res, next) => {
    try {
        if (req.user.role !== 'superadmin') {
            throw new AppError('Only superadmin can delete trips', 403);
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
        
        // Prevent adding purchases to transferred trips
        if (trip.type === 'transferred') {
            throw new AppError('Cannot add purchases to transferred trips. This trip contains transferred stock.', 403);
        }

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
        let saleData = req.body;

        saleData = {
            ...saleData,
            amount:Number(saleData.amount),
            avgWeight:Number(saleData.avgWeight),
        }

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found', 404);

        // Get vendor name from first purchase if purchases exist
        if (trip.purchases && trip.purchases.length > 0) {
            // Populate supplier if not already populated
            await trip.populate('purchases.supplier', 'vendorName name');
            const firstPurchase = trip.purchases[0];
            if (firstPurchase.supplier) {
                saleData.product = firstPurchase.supplier.vendorName || firstPurchase.supplier.name || '';
            }
        }

        // Calculate balance for the sale if customer is provided
        if (saleData.client) {
            try {
                const customer = await Customer.findById(saleData.client);
                if (customer) {
                    const globalOutstandingBalance = customer.outstandingBalance || 0;
                    const totalPaid = (saleData.onlinePaid || 0) + (saleData.cashPaid || 0);
                    const discount = saleData.discount || 0;
                    
                    // Check if this is a receipt entry (birds = 0, weight = 0, amount typically 0)
                    const isReceipt = (saleData.birds === 0 || !saleData.birds) && 
                                      (saleData.weight === 0 || !saleData.weight) && 
                                      (saleData.amount === 0 || !saleData.amount);
                    
                    // Calculate sequential balances for each particular
                    // Starting balance (before sale/receipt)
                    const startingBalance = globalOutstandingBalance;
                    
                    if (isReceipt) {
                        // For receipts: No amount is added, only payments are subtracted
                        // Step 1: RECEIPT particular balance (starting balance, no change since amount=0)
                        saleData.balanceForSale = Number(startingBalance.toFixed(2));
                        
                        // Step 2: Subtract cashPaid → Balance for BY CASH RECEIPT particular
                        const balanceForCashPaid = startingBalance - (saleData.cashPaid || 0);
                        saleData.balanceForCashPaid = Number(Math.max(0, balanceForCashPaid).toFixed(2));
                        
                        // Step 3: Subtract onlinePaid → Balance for BY BANK RECEIPT particular
                        const balanceForOnlinePaid = balanceForCashPaid - (saleData.onlinePaid || 0);
                        saleData.balanceForOnlinePaid = Number(Math.max(0, balanceForOnlinePaid).toFixed(2));
                        
                        // Step 4: Subtract discount → Balance for DISCOUNT particular (final balance)
                        const balanceForDiscount = balanceForOnlinePaid - discount;
                        saleData.balanceForDiscount = Number(Math.max(0, balanceForDiscount).toFixed(2));
                    } else {
                        // For regular sales: Add sale amount, then subtract payments
                        // Step 1: Add sale amount → Balance for SALE particular
                        const balanceForSale = startingBalance + saleData.amount;
                        saleData.balanceForSale = Number(balanceForSale.toFixed(2));
                        
                        // Step 2: Subtract cashPaid → Balance for BY CASH RECEIPT particular
                        const balanceForCashPaid = balanceForSale - (saleData.cashPaid || 0);
                        saleData.balanceForCashPaid = Number(balanceForCashPaid.toFixed(2));
                        
                        // Step 3: Subtract onlinePaid → Balance for BY BANK RECEIPT particular
                        const balanceForOnlinePaid = balanceForCashPaid - (saleData.onlinePaid || 0);
                        saleData.balanceForOnlinePaid = Number(balanceForOnlinePaid.toFixed(2));
                        
                        // Step 4: Subtract discount → Balance for DISCOUNT particular (final balance)
                        const balanceForDiscount = balanceForOnlinePaid - discount;
                        saleData.balanceForDiscount = Number(Math.max(0, balanceForDiscount).toFixed(2));
                    }
                    
                    // Calculate the final balance after this sale/receipt (same as balanceForDiscount)
                    let balance = saleData.balanceForDiscount;
                    
                    // If payment exceeds the sale amount + current outstanding balance, 
                    // the extra payment reduces the balance to 0 (minimum)
                    balance = Math.max(0, balance);
                    
                    // Add balance to sale data
                    saleData.balance = Number(balance.toFixed(2));
                    saleData.outstandingBalance = balance; // Store balance AFTER this transaction
                }
            } catch (error) {
                console.error('Error calculating sale balance:', error);
                saleData.balance = 0;
                saleData.outstandingBalance = 0;
                saleData.balanceForSale = 0;
                saleData.balanceForCashPaid = 0;
                saleData.balanceForOnlinePaid = 0;
                saleData.balanceForDiscount = 0;
            }
        } else {
            saleData.balance = 0;
            saleData.outstandingBalance = 0;
            saleData.balanceForSale = 0;
            saleData.balanceForCashPaid = 0;
            saleData.balanceForOnlinePaid = 0;
            saleData.balanceForDiscount = 0;
        }

        // Add sale
        trip.sales.push(saleData);

        // Summary will be recalculated by pre-save middleware including stock and transfers
        trip.updatedBy = req.user._id;
        await trip.save();

        // Update ledger outstanding balances if payment amounts are provided
        if (saleData.cashLedger && saleData.cashPaid && saleData.cashPaid > 0) {
            try {
                const cashLedger = await Ledger.findById(saleData.cashLedger);
                if (cashLedger) {
                    cashLedger.outstandingBalance = (cashLedger.outstandingBalance || 0) + Number(saleData.cashPaid);
                    cashLedger.updatedBy = req.user._id;
                    await cashLedger.save();
                }
            } catch (error) {
                console.error('Error updating cash ledger:', error);
                // Don't fail the sale if ledger update fails
            }
        }

        if (saleData.onlineLedger && saleData.onlinePaid && saleData.onlinePaid > 0) {
            try {
                const onlineLedger = await Ledger.findById(saleData.onlineLedger);
                if (onlineLedger) {
                    onlineLedger.outstandingBalance = (onlineLedger.outstandingBalance || 0) + Number(saleData.onlinePaid);
                    onlineLedger.updatedBy = req.user._id;
                    await onlineLedger.save();
                }
            } catch (error) {
                console.error('Error updating online ledger:', error);
                // Don't fail the sale if ledger update fails
            }
        }

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

// Edit purchase in trip (Supervisor)
export const editPurchase = async (req, res, next) => {
    try {
        const { id, index } = req.params;
        const purchaseData = req.body;

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found', 404);
        
        // Prevent editing purchases in transferred trips
        if (trip.type === 'transferred') {
            throw new AppError('Cannot edit purchases in transferred trips. This trip contains transferred stock.', 403);
        }

        // Validate index
        const purchaseIndex = parseInt(index);
        if (purchaseIndex < 0 || purchaseIndex >= trip.purchases.length) {
            throw new AppError('Invalid purchase index', 400);
        }

        // Update purchase
        trip.purchases[purchaseIndex] = { ...trip.purchases[purchaseIndex], ...purchaseData };

        // Update summary
        trip.summary.totalPurchaseAmount = trip.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
        trip.summary.totalBirdsPurchased = trip.purchases.reduce((sum, p) => sum + (p.birds || 0), 0);
        trip.summary.totalWeightPurchased = trip.purchases.reduce((sum, p) => sum + (p.weight || 0), 0);

        // Recalculate average purchase rate
        const avgPurchaseRate = trip.summary.totalWeightPurchased > 0 ? 
            trip.summary.totalPurchaseAmount / trip.summary.totalWeightPurchased : 0;
        trip.summary.avgPurchaseRate = Number(avgPurchaseRate.toFixed(2));

        // Recalculate losses that depend on purchase rate
        if (trip.losses && trip.losses.length > 0) {
            trip.losses.forEach(loss => {
                if (loss.quantity && loss.weight) {
                    loss.avgWeight = Number((loss.weight / loss.quantity).toFixed(2));
                }
                // Ensure rate uses average purchase rate (formula: total purchase cost / total purchase weight)
                if (avgPurchaseRate > 0) {
                    loss.rate = Number(avgPurchaseRate.toFixed(2));
                }
                // Recalculate total loss using updated average purchase rate
                loss.total = Number((loss.weight * avgPurchaseRate).toFixed(2));
            });
            // Update total losses summary
            trip.summary.totalLosses = trip.losses.reduce((sum, loss) => sum + (loss.total || 0), 0);
        }

        // Recalculate stocks that depend on purchase rate
        if (trip.stocks && trip.stocks.length > 0) {
            trip.stocks.forEach(stock => {
                if (stock.birds && stock.weight) {
                    stock.avgWeight = Number((stock.weight / stock.birds).toFixed(2));
                }
                // Update stock rate to match current average purchase rate
                stock.rate = Number(avgPurchaseRate.toFixed(2));
                // Recalculate stock value using updated average purchase rate
                stock.value = Number((stock.weight * avgPurchaseRate).toFixed(2));
            });
        }

        // Summary will be recalculated by pre-save middleware including stock and transfers
        // Sales profit margins will be recalculated in the middleware
        trip.updatedBy = req.user._id;
        await trip.save();

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');

        successResponse(res, "Purchase updated successfully", 200, populatedTrip);
    } catch (error) {
        next(error);
    }
};

// Edit sale in trip (Supervisor)
export const editSale = async (req, res, next) => {
    try {
        const { id, index } = req.params;
        const saleData = req.body;

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found', 404);

        // Validate index
        const saleIndex = parseInt(index);
        if (saleIndex < 0 || saleIndex >= trip.sales.length) {
            throw new AppError('Invalid sale index', 400);
        }

        // Calculate balance for the sale if customer is provided
        if (saleData.client) {
            try {
                const customer = await Customer.findById(saleData.client);
                if (customer) {
                    const globalOutstandingBalance = customer.outstandingBalance || 0;
                    const totalPaid = (saleData.onlinePaid || 0) + (saleData.cashPaid || 0);
                    const discount = saleData.discount || 0;
                    
                    // Check if this is a receipt entry (birds = 0, weight = 0, amount typically 0)
                    const isReceipt = (saleData.birds === 0 || !saleData.birds) && 
                                      (saleData.weight === 0 || !saleData.weight) && 
                                      (saleData.amount === 0 || !saleData.amount);
                    
                    // Calculate sequential balances for each particular
                    // Starting balance (before sale/receipt)
                    const startingBalance = globalOutstandingBalance;
                    
                    if (isReceipt) {
                        // For receipts: No amount is added, only payments are subtracted
                        // Step 1: RECEIPT particular balance (starting balance, no change since amount=0)
                        saleData.balanceForSale = Number(startingBalance.toFixed(2));
                        
                        // Step 2: Subtract cashPaid → Balance for BY CASH RECEIPT particular
                        const balanceForCashPaid = startingBalance - (saleData.cashPaid || 0);
                        saleData.balanceForCashPaid = Number(Math.max(0, balanceForCashPaid).toFixed(2));
                        
                        // Step 3: Subtract onlinePaid → Balance for BY BANK RECEIPT particular
                        const balanceForOnlinePaid = balanceForCashPaid - (saleData.onlinePaid || 0);
                        saleData.balanceForOnlinePaid = Number(Math.max(0, balanceForOnlinePaid).toFixed(2));
                        
                        // Step 4: Subtract discount → Balance for DISCOUNT particular (final balance)
                        const balanceForDiscount = balanceForOnlinePaid - discount;
                        saleData.balanceForDiscount = Number(Math.max(0, balanceForDiscount).toFixed(2));
                    } else {
                        // For regular sales: Add sale amount, then subtract payments
                        // Step 1: Add sale amount → Balance for SALE particular
                        const balanceForSale = startingBalance + saleData.amount;
                        saleData.balanceForSale = Number(balanceForSale.toFixed(2));
                        
                        // Step 2: Subtract cashPaid → Balance for BY CASH RECEIPT particular
                        const balanceForCashPaid = balanceForSale - (saleData.cashPaid || 0);
                        saleData.balanceForCashPaid = Number(balanceForCashPaid.toFixed(2));
                        
                        // Step 3: Subtract onlinePaid → Balance for BY BANK RECEIPT particular
                        const balanceForOnlinePaid = balanceForCashPaid - (saleData.onlinePaid || 0);
                        saleData.balanceForOnlinePaid = Number(balanceForOnlinePaid.toFixed(2));
                        
                        // Step 4: Subtract discount → Balance for DISCOUNT particular (final balance)
                        const balanceForDiscount = balanceForOnlinePaid - discount;
                        saleData.balanceForDiscount = Number(Math.max(0, balanceForDiscount).toFixed(2));
                    }
                    
                    // Calculate the final balance after this sale/receipt (same as balanceForDiscount)
                    let balance = saleData.balanceForDiscount;
                    
                    // If payment exceeds the sale amount + current outstanding balance, 
                    // the extra payment reduces the balance to 0 (minimum)
                    balance = Math.max(0, balance);
                    
                    // Add balance to sale data
                    saleData.balance = Number(balance.toFixed(2));
                    saleData.outstandingBalance = balance; // Store balance AFTER this transaction
                }
            } catch (error) {
                console.error('Error calculating sale balance:', error);
                saleData.balance = 0;
                saleData.outstandingBalance = 0;
                saleData.balanceForSale = 0;
                saleData.balanceForCashPaid = 0;
                saleData.balanceForOnlinePaid = 0;
                saleData.balanceForDiscount = 0;
            }
        } else {
            saleData.balance = 0;
            saleData.outstandingBalance = 0;
            saleData.balanceForSale = 0;
            saleData.balanceForCashPaid = 0;
            saleData.balanceForOnlinePaid = 0;
            saleData.balanceForDiscount = 0;
        }

        // Get old sale data for ledger reversal
        const oldSale = trip.sales[saleIndex];
        const oldCashPaid = oldSale?.cashPaid || 0;
        const oldOnlinePaid = oldSale?.onlinePaid || 0;
        const oldCashLedger = oldSale?.cashLedger;
        const oldOnlineLedger = oldSale?.onlineLedger;

        // Update sale
        trip.sales[saleIndex] = { ...trip.sales[saleIndex], ...saleData };

        // Summary will be recalculated by pre-save middleware including stock and transfers
        trip.updatedBy = req.user._id;
        await trip.save();

        // Update ledger outstanding balances
        // First, reverse old ledger amounts if they exist
        if (oldCashLedger && oldCashPaid > 0) {
            try {
                const cashLedger = await Ledger.findById(oldCashLedger);
                if (cashLedger) {
                    cashLedger.outstandingBalance = Math.max(0, (cashLedger.outstandingBalance || 0) - Number(oldCashPaid));
                    cashLedger.updatedBy = req.user._id;
                    await cashLedger.save();
                }
            } catch (error) {
                console.error('Error reversing old cash ledger:', error);
            }
        }

        if (oldOnlineLedger && oldOnlinePaid > 0) {
            try {
                const onlineLedger = await Ledger.findById(oldOnlineLedger);
                if (onlineLedger) {
                    onlineLedger.outstandingBalance = Math.max(0, (onlineLedger.outstandingBalance || 0) - Number(oldOnlinePaid));
                    onlineLedger.updatedBy = req.user._id;
                    await onlineLedger.save();
                }
            } catch (error) {
                console.error('Error reversing old online ledger:', error);
            }
        }

        // Then, add new ledger amounts if they exist
        if (saleData.cashLedger && saleData.cashPaid && saleData.cashPaid > 0) {
            try {
                const cashLedger = await Ledger.findById(saleData.cashLedger);
                if (cashLedger) {
                    cashLedger.outstandingBalance = (cashLedger.outstandingBalance || 0) + Number(saleData.cashPaid);
                    cashLedger.updatedBy = req.user._id;
                    await cashLedger.save();
                }
            } catch (error) {
                console.error('Error updating cash ledger:', error);
            }
        }

        if (saleData.onlineLedger && saleData.onlinePaid && saleData.onlinePaid > 0) {
            try {
                const onlineLedger = await Ledger.findById(saleData.onlineLedger);
                if (onlineLedger) {
                    onlineLedger.outstandingBalance = (onlineLedger.outstandingBalance || 0) + Number(saleData.onlinePaid);
                    onlineLedger.updatedBy = req.user._id;
                    await onlineLedger.save();
                }
            } catch (error) {
                console.error('Error updating online ledger:', error);
            }
        }

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');

        successResponse(res, "Sale updated successfully", 200, populatedTrip);
    } catch (error) {
        next(error);
    }
};

// Add death birds to trip (Supervisor)
export const addDeathBirds = async (req, res, next) => {
    try {
        const { quantity, weight, reason, date } = req.body;

        // Validate required fields (rate is no longer required, will be calculated)
        if (!quantity || !weight || !date) {
            return errorResponse(res, "Quantity, weight, and date are required", 400);
        }

        if (quantity <= 0 || weight <= 0) {
            return errorResponse(res, "Quantity and weight must be greater than 0", 400);
        }

        let query = { _id: req.params.id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) {
            return errorResponse(res, "Trip not found or access denied", 404);
        }

        // Calculate purchase totals to determine avgPurchaseRate
        const totalPurchaseAmount = trip.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalWeightPurchased = trip.purchases.reduce((sum, p) => sum + (p.weight || 0), 0);
        
        // Calculate average purchase rate using formula: total purchase cost / total purchase weight
        const avgPurchaseRate = totalWeightPurchased > 0 ? 
            totalPurchaseAmount / totalWeightPurchased : 0;

        if (avgPurchaseRate <= 0) {
            return errorResponse(res, "Cannot add death birds: No purchases found or invalid purchase data", 400);
        }

        // Calculate derived fields using avgPurchaseRate
        const avgWeight = Number((weight / quantity).toFixed(2));
        const total = Number((weight * avgPurchaseRate).toFixed(2));

        const deathBirdData = {
            quantity,
            weight,
            avgWeight,
            rate: Number(avgPurchaseRate.toFixed(2)), // Use calculated avgPurchaseRate
            total,
            reason: reason || '',
            date: new Date(date)
        };

        // Add death bird to losses array
        trip.losses.push(deathBirdData);

        // Recalculate summary
        trip.summary.totalLosses = trip.losses.reduce((sum, loss) => sum + (loss.total || 0), 0);
        trip.summary.totalBirdsLost = trip.losses.reduce((sum, loss) => sum + (loss.quantity || 0), 0);
        trip.summary.totalWeightLost = trip.losses.reduce((sum, loss) => sum + (loss.weight || 0), 0);
        trip.summary.mortality = trip.summary.totalBirdsLost;

        // Calculate bird weight loss: purchased - sold - stock - lost - transferred
        const totalStockWeight = trip.stocks.reduce((sum, stock) => sum + (stock.weight || 0), 0);
        const totalTransferredWeight = trip.transferHistory.reduce((sum, transfer) => sum + (transfer.transferredStock?.weight || 0), 0);
        trip.summary.birdWeightLoss = (trip.summary.totalWeightPurchased || 0) - 
                                     (trip.summary.totalWeightSold || 0) - 
                                     totalStockWeight - 
                                     (trip.summary.totalWeightLost || 0) - 
                                     totalTransferredWeight;

        // Summary will be recalculated by pre-save middleware including stock and transfers
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

// Edit expense in trip (Supervisor)
export const editExpense = async (req, res, next) => {
    try {
        const { id, index } = req.params;
        const expenseData = req.body;

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found', 404);

        // Validate index
        const expenseIndex = parseInt(index);
        if (expenseIndex < 0 || expenseIndex >= trip.expenses.length) {
            throw new AppError('Invalid expense index', 400);
        }

        // Update expense
        trip.expenses[expenseIndex] = { ...trip.expenses[expenseIndex], ...expenseData };

        // Update summary
        trip.summary.totalExpenses = trip.expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

        trip.updatedBy = req.user._id;
        await trip.save();

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');

        successResponse(res, "Expense updated successfully", 200, populatedTrip);
    } catch (error) {
        next(error);
    }
}

// Edit diesel station in trip (Supervisor)
export const editDieselStation = async (req, res, next) => {
    try {
        const { id, index } = req.params;
        const stationData = req.body;

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found', 404);

        // Validate index
        const stationIndex = parseInt(index);
        if (stationIndex < 0 || stationIndex >= trip.diesel.stations.length) {
            throw new AppError('Invalid diesel station index', 400);
        }

        // Update diesel station
        trip.diesel.stations[stationIndex] = { ...trip.diesel.stations[stationIndex], ...stationData };

        // Update diesel totals
        trip.diesel.totalVolume = trip.diesel.stations.reduce((sum, station) => sum + (station.volume || 0), 0);
        trip.diesel.totalAmount = trip.diesel.stations.reduce((sum, station) => sum + (station.amount || 0), 0);

        // Update summary
        trip.summary.totalDieselAmount = trip.diesel.totalAmount;

        trip.updatedBy = req.user._id;
        await trip.save();

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact');

        successResponse(res, "Diesel station updated successfully", 200, populatedTrip);
    } catch (error) {
        next(error);
    }
}

// Complete trip (Supervisor)
export const completeTrip = async (req, res, next) => {
    try {
        const { closingOdometer, finalRemarks, mortality } = req.body;
        
        let query = { _id: req.params.id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);

        if (!trip) throw new AppError('Trip not found!', 404);

        // Validate and update vehicle readings
        if (trip.vehicleReadings.opening && closingOdometer < trip.vehicleReadings.opening) {
            throw new AppError('Closing odometer reading must be greater than opening reading', 400);
        }
        
        trip.vehicleReadings.closing = closingOdometer;
        if (trip.vehicleReadings.opening) {
            trip.vehicleReadings.totalDistance = closingOdometer - trip.vehicleReadings.opening;
            // Set totalKm for financial calculations
            trip.totalKm = trip.vehicleReadings.totalDistance;
        }
        
        // Calculate total diesel amount
        trip.dieselAmount = trip.diesel.totalAmount || 0;

        // Update completion details
        trip.completionDetails = {
            completedAt: new Date(),
            closingOdometer,
            finalRemarks,
            supervisorSignature: req.user.name
        };

        // Add death birds record if mortality is provided
        if (mortality && mortality > 0) {
            // Calculate average weight for death birds
            const totalBirdsPurchased = trip.summary?.totalBirdsPurchased || 0;
            const totalWeightPurchased = trip.summary?.totalWeightPurchased || 0;
            const avgWeight = totalBirdsPurchased > 0 ? totalWeightPurchased / totalBirdsPurchased : 0;
            
            // Calculate death weight based on average weight
            const deathWeight = mortality * avgWeight;
            
            // Get average purchase rate for death bird value calculation
            const avgPurchaseRate = trip.summary?.avgPurchaseRate || 0;
            const deathValue = deathWeight * avgPurchaseRate;

            // Add death birds record
            trip.losses.push({
                quantity: mortality,
                weight: deathWeight,
                avgWeight: avgWeight,
                rate: avgPurchaseRate,
                total: deathValue,
                reason: 'Natural death - Trip completion',
                date: new Date(),
                timestamp: new Date()
            });
        }

        // Update summary - mortality represents remaining birds (death birds)
        trip.summary.birdsRemaining = 0; // No birds remaining after completion
        trip.summary.mortality = mortality || 0;
        trip.summary.totalExpenses = trip.expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        trip.summary.totalDieselAmount = trip.diesel.totalAmount;

        // Calculate gross rent: rentPerKm * totalDistance
        const totalDistance = trip.vehicleReadings?.totalDistance || 0;
        trip.summary.grossRent = (trip.rentPerKm || 0) * totalDistance;

        // Calculate birds profit: Total Sales - Total Purchases - Total Expenses - Gross Rent
        trip.summary.birdsProfit = (trip.summary.totalSalesAmount || 0) - 
                                  (trip.summary.totalPurchaseAmount || 0) - 
                                  (trip.summary.totalExpenses || 0) - 
                                  trip.summary.grossRent;

        // Calculate final profit including death losses
        trip.summary.netProfit = trip.summary.totalSalesAmount -
            trip.summary.totalPurchaseAmount -
            trip.summary.totalExpenses -
            trip.summary.totalDieselAmount -
            trip.summary.totalLosses;

        // Calculate trip profit: netProfit + birdsProfit
        trip.summary.tripProfit = Number(((trip.summary.netProfit || 0) + (trip.summary.birdsProfit || 0)).toFixed(2));

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

// Update stock (Supervisor)
// Add new stock entry (Supervisor)
export const addStock = async (req, res, next) => {
    try {
        const { id } = req.params;
        const stockData = req.body;

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found!', 404);

        // Calculate avgWeight and value
        const avgWeight = stockData.birds > 0 ? stockData.weight / stockData.birds : 0;
        const value = stockData.weight * stockData.rate;

        // Add new stock entry
        const newStock = {
            birds: stockData.birds,
            weight: stockData.weight,
            avgWeight: avgWeight,
            value: value,
            rate: stockData.rate,
            addedAt: new Date(),
            notes: stockData.notes || ''
        };

        trip.stocks.push(newStock);

        // Save the trip to trigger pre-save middleware for recalculations
        await trip.save();

        // Populate the trip with references
        await trip.populate('supervisor vehicle');

        successResponse(res, "Stock added successfully", 200, trip);
    } catch (error) {
        next(error);
    }
};

// Update existing stock entry (Supervisor)
export const updateStock = async (req, res, next) => {
    try {
        const { id, index } = req.params;
        const stockData = req.body;

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found!', 404);

        const stockIndex = parseInt(index);
        if (stockIndex < 0 || stockIndex >= trip.stocks.length) {
            throw new AppError('Invalid stock index!', 400);
        }

        // Calculate avgWeight and value
        const avgWeight = stockData.birds > 0 ? stockData.weight / stockData.birds : 0;
        const value = stockData.weight * stockData.rate;

        // Update stock entry
        trip.stocks[stockIndex] = {
            ...trip.stocks[stockIndex],
            birds: stockData.birds,
            weight: stockData.weight,
            avgWeight: avgWeight,
            value: value,
            rate: stockData.rate,
            notes: stockData.notes || ''
        };

        // Save the trip to trigger pre-save middleware for recalculations
        await trip.save();

        // Populate the trip with references
        await trip.populate('supervisor vehicle');

        successResponse(res, "Stock updated successfully", 200, trip);
    } catch (error) {
        next(error);
    }
};

// Delete stock entry (Supervisor)
export const deleteStock = async (req, res, next) => {
    try {
        const { id, index } = req.params;

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found!', 404);

        const stockIndex = parseInt(index);
        if (stockIndex < 0 || stockIndex >= trip.stocks.length) {
            throw new AppError('Invalid stock index!', 400);
        }

        // Remove stock entry
        trip.stocks.splice(stockIndex, 1);

        // Save the trip to trigger pre-save middleware for recalculations
        await trip.save();

        // Populate the trip with references
        await trip.populate('supervisor vehicle');

        successResponse(res, "Stock deleted successfully", 200, trip);
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

// Update trip status (Supervisor)
export const updateTripStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['started', 'ongoing', 'completed'];
        if (!validStatuses.includes(status)) {
            throw new AppError('Invalid status. Must be one of: started, ongoing, completed', 400);
        }

        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found!', 404);

        // Update trip status
        trip.status = status;
        trip.updatedBy = req.user._id;
        trip.updatedAt = new Date();

        await trip.save();

        successResponse(res, "Trip status updated successfully", 200, trip);
    } catch (error) {
        next(error);
    }
};

// Transfer trip to another supervisor
export const transferTrip = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { 
            supervisorId, 
            vehicleId, 
            reason,
            transferBirds // Custom bird count entered by supervisor
        } = req.body;

        // Only assigned supervisor can transfer
        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const originalTrip = await Trip.findOne(query)
            .populate('purchases.supplier', 'vendorName name');
        if (!originalTrip) throw new AppError('Trip not found', 404);

        // Get vendor name from first purchase of original trip
        let vendorNameFromOriginalTrip = '';
        if (originalTrip.purchases && originalTrip.purchases.length > 0) {
            const firstPurchase = originalTrip.purchases[0];
            if (firstPurchase.supplier) {
                vendorNameFromOriginalTrip = firstPurchase.supplier?.vendorName || firstPurchase.supplier?.name || '';
            }
        }

        // Calculate remaining birds available for transfer
        const totalPurchased = originalTrip.summary?.totalBirdsPurchased || 0;
        const totalSold = originalTrip.summary?.totalBirdsSold || 0;
        const totalInStock = originalTrip.stocks?.reduce((sum, stock) => sum + (stock.birds || 0), 0) || 0;
        const totalLost = originalTrip.summary?.totalBirdsLost || 0;
        const remainingBirds = totalPurchased - totalSold - totalInStock - totalLost;

        // Validate transfer request
        if (!transferBirds || !transferBirds.birds || !transferBirds.weight) {
            throw new AppError('Transfer birds data (birds count and weight) is required', 400);
        }

        if (remainingBirds <= 0) {
            throw new AppError('No remaining birds available to transfer', 400);
        }

        if (transferBirds.birds > remainingBirds) {
            throw new AppError(`Cannot transfer ${transferBirds.birds} birds. Only ${remainingBirds} birds are available for transfer`, 400);
        }

        // Validate receiving supervisor exists and is approved
        const receivingSupervisor = await User.findOne({ 
            _id: supervisorId, 
            role: 'supervisor', 
            approvalStatus: 'approved', 
            isActive: true 
        });
        if (!receivingSupervisor) {
            throw new AppError('Invalid supervisor or supervisor not approved', 400);
        }

        // Validate vehicle exists and is available
        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) {
            throw new AppError('Vehicle not found', 404);
        }
        if (vehicle.currentStatus !== 'idle') {
            throw new AppError('Vehicle is not available for new trip', 400);
        }

        // Calculate average weight and rate for transfer
        const avgWeight = transferBirds.weight / transferBirds.birds;
        const avgPurchaseRate = transferBirds.rate || originalTrip.summary?.avgPurchaseRate || 0;
        const transferAmount = transferBirds.weight * avgPurchaseRate;

        // Create new transferred trip - receiving supervisor will complete details
        const newTripData = {
            type: 'transferred',
            date: new Date(),
            // place: '', // To be filled by receiving supervisor
            route: { from: 'TBD', to: 'TBD' }, // To be filled by receiving supervisor
            vehicle: vehicleId,
            supervisor: supervisorId,
            driver: 'TBD - To be assigned by receiving supervisor', // To be filled by receiving supervisor
            labour: 'TBD', // To be filled by receiving supervisor
            vehicleReadings: {
                opening: 0 // To be filled by receiving supervisor
            },
            rentPerKm: vehicle.rentPerKm || 0,
            transferredFrom: originalTrip._id,
            // Add transferred birds as purchase record
            purchases: [{
                supplier: null, // No actual supplier - this is transferred stock
                vendorName: vendorNameFromOriginalTrip, // Store vendor name from original trip's first purchase
                dcNumber: `TRANSFER-${originalTrip.tripId}`,
                birds: transferBirds.birds,
                weight: transferBirds.weight,
                avgWeight: avgWeight,
                rate: avgPurchaseRate,
                amount: transferAmount,
                timestamp: new Date()
            }],
            createdBy: req.user._id,
            updatedBy: req.user._id,
            status: 'started' // Start as started - supervisor will manage from there
        };

        const newTrip = new Trip(newTripData);
        await newTrip.save();

        // Update vehicle status for new trip
        await Vehicle.findByIdAndUpdate(vehicleId, {
            currentStatus: 'in-transit',
            updatedBy: req.user._id
        });

        // Update original trip summary to reflect transferred birds
        // Note: We don't remove from actual purchases/sales/stock, just track the transfer
        // The remaining birds calculation will automatically adjust
        
        // Add transfer to original trip's history
        originalTrip.transferHistory.push({
            transferredTo: newTrip._id,
            transferredToSupervisor: supervisorId,
            transferredStock: {
                birds: transferBirds.birds,
                weight: transferBirds.weight,
                avgWeight: avgWeight,
                rate: avgPurchaseRate
            },
            reason: reason || 'Trip transfer',
            transferredAt: new Date(),
            transferredBy: req.user._id
        });

        // Add to transferredTo array
        originalTrip.transferredTo.push(newTrip._id);
        originalTrip.updatedBy = req.user._id;

        // Save original trip
        await originalTrip.save();

        // Populate both trips for response
        const populatedOriginalTrip = await Trip.findById(originalTrip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact')
            .populate('transferHistory.transferredToSupervisor', 'name mobileNumber')
            .populate({
                path: 'transferHistory.transferredTo',
                populate: {
                    path: 'vehicle',
                    select: 'vehicleNumber'
                }
            });

        const populatedNewTrip = await Trip.findById(newTrip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('transferredFrom', 'tripId');

        successResponse(res, "Trip transferred successfully", 200, {
            originalTrip: populatedOriginalTrip,
            newTrip: populatedNewTrip,
            transferDetails: {
                birdsTransferred: transferBirds.birds,
                weightTransferred: transferBirds.weight,
                remainingBirdsAfterTransfer: remainingBirds - transferBirds.birds
            }
        });
    } catch (error) {
        next(error);
    }
};

// Get trip transfer history
export const getTripTransferHistory = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query)
            .populate('transferHistory.transferredToSupervisor', 'name mobileNumber')
            .populate({
                path: 'transferHistory.transferredTo',
                populate: {
                    path: 'vehicle',
                    select: 'vehicleNumber'
                }
            })
            .populate('transferredFrom', 'tripId supervisor')
            .populate('transferredTo', 'tripId supervisor');

        if (!trip) throw new AppError('Trip not found', 404);

        const transferInfo = {
            tripId: trip.tripId,
            type: trip.type,
            transferredFrom: trip.transferredFrom,
            transferredTo: trip.transferredTo,
            transferHistory: trip.transferHistory
        };

        successResponse(res, "Trip transfer history fetched successfully", 200, transferInfo);
    } catch (error) {
        next(error);
    }
};

// Complete initial trip details for transferred trips (Supervisor)
export const completeTripDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { driver, labour, route, vehicleReadings } = req.body;

        // Only supervisor can complete their own trip details
        let query = { _id: id };
        if (req.user.role === 'supervisor') {
            query.supervisor = req.user._id;
        }

        const trip = await Trip.findOne(query);
        if (!trip) throw new AppError('Trip not found or access denied', 404);

        // Validate it's a transferred trip
        if (trip.type !== 'transferred') {
            throw new AppError('This endpoint is only for completing transferred trip details', 400);
        }

        // Validate required fields
        if (!driver || !route?.from || !route?.to || !vehicleReadings?.opening) {
            throw new AppError('Driver, route locations, and opening odometer are required', 400);
        }

        if (vehicleReadings.opening <= 0) {
            throw new AppError('Opening odometer reading must be greater than 0', 400);
        }

        // Update trip details
        trip.driver = driver;
        trip.labour = labour || '';
        trip.route = {
            from: route.from,
            to: route.to,
            distance: route.distance || 0
        };
        // trip.place = place || '';
        trip.vehicleReadings.opening = vehicleReadings.opening;
        trip.updatedBy = req.user._id;

        await trip.save();

        const populatedTrip = await Trip.findById(trip._id)
            .populate('vehicle', 'vehicleNumber type')
            .populate('supervisor', 'name mobileNumber')
            .populate('purchases.supplier', 'vendorName contactNumber')
            .populate('sales.client', 'shopName ownerName contact')
            .populate('transferredFrom', 'tripId');

        successResponse(res, "Trip details completed successfully", 200, populatedTrip);
    } catch (error) {
        next(error);
    }
};
