import Customer from "../models/Customer.js";
import User from "../models/User.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";
import bcrypt from 'bcrypt';
import validator from 'validator';

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