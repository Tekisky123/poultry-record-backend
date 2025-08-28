import Customer from "../models/Customer.js";
import { successResponse } from "../utils/responseHandler.js";

export const addCustomer = async (req, res, next) => {
    try {
        const customerData = {
            ...req.body,
            createdBy: req.user._id,
            updatedBy: req.user._id
        };
        const customer = new Customer(customerData);
        await customer.save();

        successResponse(res, "New customer added!", 201, customer)
    } catch (error) {
        next(error);
    }
};

export const getCustomers = async (req, res, next) => {
    try {
        const customers = await Customer.find({ isActive: true }).sort({ shopName: 1 });
        successResponse(res, "customers", 200, customers)
    } catch (error) {
        next(error);
    }
};

export const getCustomerById = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const customer = await Customer.findOne({ _id: id, isActive: true });
        successResponse(res, "customer", 200, customer)
    } catch (error) {
        next(error);
    }
};

export const updateCustomer = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const updateData = {
            ...req.body,
            updatedBy: req.user._id
        };
        
        const customer = await Customer.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }
        
        successResponse(res, "Customer updated successfully", 200, customer);
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