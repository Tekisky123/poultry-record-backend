import User from "../models/User.js";
import { successResponse } from "../utils/responseHandler.js";


export const getUsers = async (req, res, next) => {
    try {
        const users = await User.find({ isActive: true })
            .select('-password')
            .sort({ createdAt: -1 });
        successResponse(res, "users", 200, users)
    } catch (error) {
        next(error);
    }
};

export const getUserById = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const user = await User.findOne({ _id: id, isActive: true })
            .select('-password')
            .sort({ createdAt: -1 });
        successResponse(res, "user", 200, user)
    } catch (error) {
        next(error);
    }
};