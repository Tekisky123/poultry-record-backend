import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import {loginValidator} from '../utils/validators.js';
import bcrypt from 'bcrypt';

export const login = async (req, res, next) => {
  try {
    // Validate request body
    loginValidator(req.body);

    const { mobile, password } = req.body;

    // Check if user exists and is active
    const user = await User.findOne({ mobile, isActive: true });

    if (!user) throw new AppError('Invalid credentials', 401);

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) throw new AppError('Invalid credentials', 401);

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT
    const token = await user.getJWT();

    // Set cookie
    res.cookie('token', token);

    // Send success response
    successResponse(res, 'Login successful!!', 200, {
      id: user._id,
      name: user.name,
      mobile: user.mobile,
      role: user.role,
    });

  } catch (error) {
    next(error);
  }
};
