import Customer from "../models/Customer.js";
import User from "../models/User.js";
import Trip from "../models/Trip.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";
import bcrypt from 'bcrypt';
import validator from 'validator';
import mongoose from "mongoose";

export const addCustomer = async (req, res, next) => {
    try {
        const { email, password, ...customerData } = req.body;

        // Validate required fields for user creation
        if (!password || !email) {
            throw new AppError('Email and password are required for customer login', 400);
        }

        // Validate email format
        if (!validator.isEmail(email)) {
            throw new AppError('Invalid email format', 400);
        }

        // Validate password strength
        if (!validator.isStrongPassword(password, {
            minLength: 6,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 0
        })) {
            throw new AppError('Password must contain at least one uppercase letter, one lowercase letter, and one number', 400);
        }

        // Check if user already exists (email or mobile)
        const existingUser = await User.findOne({
            $or: [
                { email: email },
                { mobileNumber: customerData.contact }
            ]
        });

        if (existingUser) {
            throw new AppError('User with this email or mobile number already exists', 400);
        }

        // Hash password
        const hashPassword = await bcrypt.hash(password, 10);

        // Create User account first with mobileNumber synced from customer contact
        const user = new User({
            name: customerData.ownerName || customerData.shopName,
            email: email,
            mobileNumber: customerData.contact, // Sync mobile number from customer contact
            password: hashPassword,
            role: 'customer',
            approvalStatus: 'approved', // Auto-approve customers created by admin
            isActive: true
        });

        const savedUser = await user.save();

        // Create Customer record with user reference
        const customer = new Customer({
            ...customerData,
            user: savedUser._id,
            createdBy: req.user._id,
            updatedBy: req.user._id
        });

        const savedCustomer = await customer.save();

        // Update User with customer reference
        savedUser.customer = savedCustomer._id;
        await savedUser.save();

        // Populate customer data for response
        const populatedCustomer = await Customer.findById(savedCustomer._id)
            .populate('user', 'name email mobileNumber role approvalStatus')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "New customer added with login credentials!", 201, populatedCustomer);
    } catch (error) {
        next(error);
    }
};

export const getCustomers = async (req, res, next) => {
    try {
        const customers = await Customer.find({ isActive: true })
            .populate('user', 'name email mobileNumber role approvalStatus')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .sort({ shopName: 1 });
        successResponse(res, "customers", 200, customers)
    } catch (error) {
        next(error);
    }
};

export const getCustomerById = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const customer = await Customer.findOne({ _id: id, isActive: true })
            .populate('user', 'name email mobileNumber role approvalStatus')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');
        successResponse(res, "customer", 200, customer)
    } catch (error) {
        next(error);
    }
};

export const updateCustomer = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const { password, email, ...customerData } = req.body;

        // Find the customer first
        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        // If user credentials are being updated
        if (customer.user && (password || email)) {
            const userUpdateData = {};

            if (email) {
                if (!validator.isEmail(email)) {
                    throw new AppError('Invalid email format', 400);
                }
                userUpdateData.email = email;
            }

            if (password) {
                if (!validator.isStrongPassword(password, {
                    minLength: 6,
                    minLowercase: 1,
                    minUppercase: 1,
                    minNumbers: 1,
                    minSymbols: 0
                })) {
                    throw new AppError('Password must contain at least one uppercase letter, one lowercase letter, and one number', 400);
                }
                userUpdateData.password = await bcrypt.hash(password, 10);
            }

            // Always sync mobile number from customer contact to user
            userUpdateData.mobileNumber = customerData.contact;

            // Update user if there are changes
            if (Object.keys(userUpdateData).length > 0) {
                await User.findByIdAndUpdate(customer.user, userUpdateData);
            }
        }

        // Update customer data
        const updateData = {
            ...customerData,
            updatedBy: req.user._id
        };

        const updatedCustomer = await Customer.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('user', 'name email mobileNumber role approvalStatus')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "Customer updated successfully", 200, updatedCustomer);
    } catch (error) {
        next(error);
    }
};

export const deleteCustomer = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const customer = await Customer.findByIdAndUpdate(
            id,
            { isActive: false, updatedBy: req.user._id },
            { new: true }
        );

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        successResponse(res, "Customer deleted successfully", 200, customer);
    } catch (error) {
        next(error);
    }
};

export const getCustomerSales = async (req, res, next) => {
    try {
        const { id } = req.params; // user ID

        const customer = await Customer.findOne({ user: id, isActive: true });
        if (!customer) {
            throw new AppError('Customer profile not found', 404);
        }

        // Ensure ID type is ObjectId
        const customerId = new mongoose.Types.ObjectId(customer._id);

        const trips = await Trip.find({ 'sales.client': customerId })
            .populate('sales.client', 'shopName ownerName')
            .populate('supervisor', 'name mobileNumber')
            .populate('vehicle', 'vehicleNumber')
            .sort({ createdAt: -1 });
        // Filter only sales of this customer
        const customerSales = [];
        trips.forEach(trip => {
            trip.sales.forEach(sale => {
                if (sale.client && sale.client._id.toString() === customer._id.toString()) {
                    customerSales.push({
                        _id: sale._id,
                        tripId: trip.tripId,
                        billNumber: sale.billNumber,
                        birds: sale.birds,
                        weight: sale.weight,
                        rate: sale.rate,
                        amount: sale.amount,
                        cashPaid: sale.cashPaid || 0,
                        onlinePaid: sale.onlinePaid || 0,
                        discount: sale.discount || 0,
                        openingBalance: sale.openingBalance || 0,
                        timestamp: sale.timestamp,
                        trip: {
                            _id: trip._id,
                            tripId: trip.tripId,
                            supervisor: trip.supervisor,
                            vehicle: trip.vehicle,
                            date: trip.date
                        }
                    });
                }
            });
        });

        successResponse(res, "Customer sales retrieved successfully", 200, customerSales);
    } catch (error) {
        next(error);
    }
};


export const getCustomerProfile = async (req, res, next) => {
    try {
        const { id } = req.params; // User ID for customer panel

        const customer = await Customer.findOne({
            user: id,
            isActive: true
        })
            .populate('user', 'name email mobileNumber role approvalStatus createdAt lastLogin')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        if (!customer) {
            throw new AppError('Customer profile not found', 404);
        }

        successResponse(res, "Customer profile retrieved successfully", 200, customer);
    } catch (error) {
        next(error);
    }
};

export const updateCustomerProfile = async (req, res, next) => {
    try {
        const { id } = req.params; // User ID for customer panel
        const updateData = req.body;

        // Find customer by user ID
        const customer = await Customer.findOne({ user: id, isActive: true });
        if (!customer) {
            throw new AppError('Customer not found', 404);
        }

        // Update customer data
        const updatedCustomer = await Customer.findByIdAndUpdate(
            customer._id,
            { ...updateData, updatedBy: req.user._id },
            { new: true, runValidators: true }
        ).populate('user', 'name email mobileNumber role approvalStatus');

        // Update user data if provided
        if (updateData.ownerName || updateData.email || updateData.mobileNumber) {
            const userUpdateData = {};
            if (updateData.ownerName) userUpdateData.name = updateData.ownerName;
            if (updateData.email) userUpdateData.email = updateData.email;
            if (updateData.mobileNumber) userUpdateData.mobileNumber = updateData.mobileNumber;

            await User.findByIdAndUpdate(id, userUpdateData);
        }

        successResponse(res, "Customer profile updated successfully", 200, updatedCustomer);
    } catch (error) {
        next(error);
    }
};

export const getCustomerDashboardStats = async (req, res, next) => {
    try {
        const { id } = req.params; // User ID

        const customer = await Customer.findOne({ user: id, isActive: true });
        if (!customer) {
            throw new AppError('Customer profile not found', 404);
        }

        // Ensure ID type is ObjectId
        const customerId = new mongoose.Types.ObjectId(customer._id);

        const trips = await Trip.find({ 'sales.client': customerId })
            .populate('sales.client', 'shopName ownerName')
            .populate('supervisor', 'name mobileNumber')
            .populate('vehicle', 'vehicleNumber')
            .sort({ createdAt: -1 });

        // Calculate stats from sales data
        let totalPurchases = 0;
        let totalAmount = 0;
        let totalPaid = 0;
        let totalBirds = 0;
        let totalWeight = 0;
        let pendingPayments = 0;

        trips.forEach(trip => {
            trip.sales.forEach(sale => {
                if (sale.client && sale.client._id.toString() === customer._id.toString()) {
                    totalPurchases += 1;
                    totalAmount += sale.amount || 0;
                    totalPaid += (sale.cashPaid || 0) + (sale.onlinePaid || 0);
                    totalBirds += sale.birds || 0;
                    totalWeight += sale.weight || 0;
                    pendingPayments += sale.openingBalance || 0;
                }
            });
        });

        const stats = {
            totalPurchases,
            totalAmount,
            totalPaid,
            totalBalance: totalAmount - totalPaid,
            totalBirds,
            totalWeight,
            pendingPayments,
            openingBalance: customer.openingBalance || 0
        };

        successResponse(res, "Customer dashboard stats retrieved successfully", 200, stats);
    } catch (error) {
        next(error);
    }
};

export const updateCustomerPassword = async (req, res, next) => {
    try {
        const { id } = req.params; // User ID
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            throw new AppError('Current password and new password are required', 400);
        }

        // Validate new password strength
        if (!validator.isStrongPassword(newPassword, {
            minLength: 6,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 0
        })) {
            throw new AppError('New password must contain at least one uppercase letter, one lowercase letter, and one number', 400);
        }

        // Find user
        const user = await User.findById(id);
        if (!user) {
            throw new AppError('User not found', 404);
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            throw new AppError('Current password is incorrect', 400);
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await User.findByIdAndUpdate(id, { password: hashedNewPassword });

        successResponse(res, "Password updated successfully", 200, null);
    } catch (error) {
        next(error);
    }
};

export const getCustomerOpeningBalance = async (req, res, next) => {
    try {
        const { id } = req.params; // User ID

        const customer = await Customer.findOne({ user: id, isActive: true });
        if (!customer) {
            throw new AppError('Customer profile not found', 404);
        }

        successResponse(res, "Customer opening balance retrieved successfully", 200, {
            customerId: customer._id,
            shopName: customer.shopName,
            openingBalance: customer.openingBalance || 0
        });
    } catch (error) {
        next(error);
    }
};

export const updateCustomerOpeningBalance = async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const { newOpeningBalance } = req.body;

        if (typeof newOpeningBalance !== 'number') {
            throw new AppError('New opening balance must be a number', 400);
        }

        const customer = await Customer.findById(customerId);
        if (!customer) {
            throw new AppError('Customer not found', 404);
        }

        const oldBalance = customer.openingBalance || 0;
        const newBalance = Math.max(0, newOpeningBalance); // Ensure balance doesn't go negative
        
        // Use findByIdAndUpdate to avoid triggering full document validation
        const updatedCustomer = await Customer.findByIdAndUpdate(
            customerId,
            { openingBalance: newBalance },
            { new: true, runValidators: false } // Skip validators to avoid gstOrPanNumber validation
        );

        console.log(`Updated customer ${updatedCustomer.shopName} opening balance from ${oldBalance} to ${newBalance}`);

        successResponse(res, "Customer opening balance updated successfully", 200, {
            customerId: updatedCustomer._id,
            shopName: updatedCustomer.shopName,
            oldBalance,
            newBalance: newBalance
        });
    } catch (error) {
        next(error);
    }
};