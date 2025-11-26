import Vendor from "../models/Vendor.js";
import Group from "../models/Group.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";


export const addVendor = async (req, res, next) => {
    try {
        const { group, ...vendorData } = req.body;

        // Automatically find and assign "Sundry Creditors" group for vendors
        let groupId = group;
        if (!groupId) {
            const sundryCreditorsGroup = await Group.findOne({ 
                name: 'Sundry Creditors', 
                isActive: true 
            });
            if (!sundryCreditorsGroup) {
                throw new AppError('Sundry Creditors group not found. Please contact administrator.', 404);
            }
            groupId = sundryCreditorsGroup._id;
        } else {
            // Validate provided group exists
            const groupDoc = await Group.findById(groupId);
            if (!groupDoc || !groupDoc.isActive) {
                throw new AppError('Group not found or inactive', 404);
            }
        }

        const vendor = new Vendor({
            ...vendorData,
            group: groupId, // Use automatically assigned or provided group
            createdBy: req.user._id,
            updatedBy: req.user._id
        });
        await vendor.save();

        const populatedVendor = await Vendor.findById(vendor._id)
            .populate('group', 'name type');

        successResponse(res, "New vendor added", 201, populatedVendor)
    } catch (error) {
        next(error);
    }
};

export const getVendors = async (req, res, next) => {
    try {
        const vendors = await Vendor.find({ isActive: true })
            .populate('group', 'name type')
            .sort({ vendorName: 1 });
        successResponse(res, "vendors", 200, vendors)
    } catch (error) {
        next(error);
    }
};

export const getVendorById = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const vendor = await Vendor.findOne({ _id: id, isActive: true })
            .populate('group', 'name type');
        successResponse(res, "vendor", 200, vendor)
    } catch (error) {
        next(error);
    }
};

export const updateVendor = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const { group, ...vendorData } = req.body;

        // Automatically set group to "Sundry Creditors" if not provided
        let groupId = group;
        if (!groupId) {
            const sundryCreditorsGroup = await Group.findOne({ 
                name: 'Sundry Creditors', 
                isActive: true 
            });
            if (!sundryCreditorsGroup) {
                throw new AppError('Sundry Creditors group not found. Please contact administrator.', 404);
            }
            groupId = sundryCreditorsGroup._id;
        } else {
            // Validate provided group exists
            const groupDoc = await Group.findById(groupId);
            if (!groupDoc || !groupDoc.isActive) {
                throw new AppError('Group not found or inactive', 404);
            }
        }

        const updateData = {
            ...vendorData,
            group: groupId, // Use automatically assigned or provided group
            updatedBy: req.user._id
        };
        
        const vendor = await Vendor.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('group', 'name type');
        
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