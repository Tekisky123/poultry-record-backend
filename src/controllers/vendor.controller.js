import Vendor from "../models/Vendor.js";
import { successResponse } from "../utils/responseHandler.js";


export const addVendor = async (req, res, next) => {
    try {
        const vendorData = {
            ...req.body,
            createdBy: req.user._id,
            updatedBy: req.user._id
        };
        const vendor = new Vendor(vendorData);
        await vendor.save();

        successResponse(res, "New vendor added", 201, vendor)
    } catch (error) {
        next(error);
    }
};

export const getVendors = async (req, res, next) => {
    try {
        const vendors = await Vendor.find({ isActive: true }).sort({ vendorName: 1 });
        successResponse(res, "vendors", 200, vendors)
    } catch (error) {
        next(error);
    }
};

export const getVendorById = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const vendor = await Vendor.findOne({ _id: id, isActive: true });
        successResponse(res, "vendor", 200, vendor)
    } catch (error) {
        next(error);
    }
};

export const updateVendor = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const updateData = {
            ...req.body,
            updatedBy: req.user._id
        };
        
        const vendor = await Vendor.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        
        successResponse(res, "Vendor updated successfully", 200, vendor);
    } catch (error) {
        next(error);
    }
};

export const deleteVendor = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const vendor = await Vendor.findByIdAndUpdate(
            id,
            { isActive: false },
            { new: true }
        );
        
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        
        successResponse(res, "Vendor deleted successfully", 200, vendor);
    } catch (error) {
        next(error);
    }
};