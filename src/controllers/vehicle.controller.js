import Vehicle from "../models/Vehicle.js";
import { successResponse } from "../utils/responseHandler.js";


export const addVehicle = async (req, res, next) => {
    try {
        const vehicle = new Vehicle(req.body);
        await vehicle.save();

        successResponse(res, "New vehicle added", 201, vehicle)
    } catch (error) {
        next(error);
    }
};

export const getVehicles = async (req, res, next) => {
    try {
        const vehicles = await Vehicle.find({ isActive: true }).sort({ createdAt: -1 });
        successResponse(res, "vehicles", 200, vehicles)
    } catch (error) {
        next(error);
    }
};

export const getVehicleById = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const vehicle = await Vehicle.findOne({ _id: id, isActive: true });
        successResponse(res, "vehicle", 200, vehicle)
    } catch (error) {
        next(error);
    }
};