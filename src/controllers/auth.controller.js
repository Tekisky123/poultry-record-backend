import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { loginValidator, signupValidator } from '../utils/validators.js';
import { successResponse } from "../utils/responseHandler.js";
import bcrypt from 'bcrypt';
import { config } from 'dotenv';
config({ path: `${process.cwd()}/src/.env` });

export const signup = async (req, res, next) => {
  try {
    signupValidator(req.body);

    const { mobileNumber, email, password: inputPassword } = req.body;

    const hashPassword = await bcrypt.hash(inputPassword, 10);

    // Check if user already exists (email or mobile)
    const existingUser = await User.findOne({
      $or: [
        { email: email || null }, // only check email if provided
        { mobileNumber }
      ]
    });

    if (existingUser) {
      throw new AppError('User with this email or mobile number already exists', 400);
    }

    const user = new User({
      ...req.body,
      password: hashPassword,
    });

    const savedUser = await user.save();

    const token = await user.getJWT();

    const { password, ...otherData } = savedUser.toObject();

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    });

    successResponse(res, "signup successfull!!", 201, otherData);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    // Validate request body
    loginValidator(req.body);

    const { mobileNumber, email, password: inputPassword } = req.body;

    const query = { isActive: true };
    if (email) {
      query.email = email.toLowerCase();
    } else if (mobileNumber) {
      query.mobileNumber = mobileNumber;
    }

    // Check if user exists and is active
    const user = await User.findOne(query);

    if (!user) throw new AppError('Invalid credentials', 401);

    // Check password
    const validPassword = await user.validatePassword(inputPassword);
    if (!validPassword) throw new AppError('Invalid credentials', 401);

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT
    const token = await user.getJWT();

    const { password, ...otherData } = user.toObject();

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    });

    // Send success response
    successResponse(res, 'Login successful!!', 200, otherData);

  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    res.cookie("token", null, { expires: new Date(Date.now()) });

    successResponse(res, "logout successfull!!");
  } catch (error) {
    next(error);
  }
};