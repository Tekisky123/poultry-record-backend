import Vendor from "../models/Vendor.js";
import { successResponse } from "../utils/responseHandler.js";


export const addVendor = async (req, res, next) => {
    try {
        const vendor = new Vendor(req.body);
        await vendor.save();

        successResponse(res, "New vendor added", 201, vendor)
    } catch (error) {
        next(error);
    }
};

export const getVendors = async (req, res, next) => {
    try {
        const vendors = await Vendor.find({ isActive: true }).sort({ name: 1 });
        successResponse(res, "vehicles", 200, vendors)
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