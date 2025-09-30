import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import validator from 'validator';
import { loginValidator, signupValidator } from '../utils/validators.js';
import { successResponse } from "../utils/responseHandler.js";
import bcrypt from 'bcrypt';
import { config } from 'dotenv';
config({ path: `${process.cwd()}/src/.env` });

const cookieConfig = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // NONE for cross-site
  maxAge: 365 * 24 * 60 * 60 * 1000, // one year
}

export const signup = async (req, res, next) => {
  try {
    signupValidator(req.body);

    const { mobileNumber, role, email, password: inputPassword } = req.body;

    // Check if user already exists (email or mobile)
    const existingUser = await User.findOne({
      $or: [
        { email: email }, // only check email if provided
        { mobileNumber: mobileNumber }
      ]
    });

    if (existingUser) {
      throw new AppError('User with this email or mobile number already exists', 400);
    }

    const hashPassword = await bcrypt.hash(inputPassword, 10);

    const user = new User({
      ...req.body,
      password: hashPassword,
      approvalStatus: role === 'customer' ? 'approved' : 'pending'
    });

    const savedUser = await user.save();

    const { password, ...otherData } = savedUser.toObject();

    successResponse(res, "signup successfull!!", 201, otherData);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    // Validate request body
    loginValidator(req.body);

    const { username, password: inputPassword } = req.body;

    const query = { isActive: true };

    if (validator.isEmail(username)) {
      query.email = username.toLowerCase();
    } else if (validator.isMobilePhone(username.toString(), "any", { strictMode: true })) {
      query.mobileNumber = username;
    } else {
      throw new AppError("Username must be a valid email or mobile number", 400);
    }

    // Check if user exists and is active
    const user = await User.findOne(query);

    if (!user) throw new AppError('Invalid credentials', 401);

    // Require approval for admin/supervisor before allowing login
    if ((user.role === 'admin' || user.role === 'supervisor') && user.approvalStatus !== 'approved') {
      throw new AppError(`Account approval is ${user.approvalStatus || "pending"}`, 403);
    }

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
    res.cookie('token', token, cookieConfig);

    // Send success response with token included
    successResponse(res, 'Login successful!!', 200, { ...otherData, token });

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

export const getVerifiedUser = async (req, res, next) => {
  const user = req.user;
  try {
    successResponse(res, 'Fetch verified user', 200, user);
  } catch (error) {
    next(error)
  }
};