// models/User.js

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import validator from 'validator';
config({ path: `${process.cwd()}/src/.env` });

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        minlength: [3, 'Name must be at least 3 characters'],
        maxlength: [50, 'Name must not exceed 50 characters'],
        trim: true
    },

    role: {
        type: String,
        required: true,
        enum: ['superadmin', 'admin', 'supervisor', 'customer']
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        validate: {
            validator: function (value) {
                return validator.isEmail(value);
            },
            message: 'Invalid email format'
        }
    },

    mobileNumber: {
        type: String,
        required: [true, 'Mobile number is required'],
        trim: true,
        validate: {
            validator: (value) => validator.isMobilePhone(value, 'any', { strictMode: true }),
            message: 'Invalid mobile number!'
        }
    },

    age: {
        type: Number,
        min: [18, 'Age must be at least 18'],
        max: [100, 'Age must not exceed 100']
    },

    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        validate: {
            validator: function (value) {
                // You can customize the strong password requirements here
                return validator.isStrongPassword(value, {
                    minLength: 6,
                    minLowercase: 1,
                    minUppercase: 1,
                    minNumbers: 1,
                    minSymbols: 0 // no special char required unless you want it
                });
            },
            message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        }
    },

    profileImage: {
        type: String, // URL or file path
        default: ""
    },

    address: {
        type: String,
        trim: true,
        maxlength: [200, 'Address cannot exceed 200 characters']
    },
    isActive: {
        type: Boolean,
        default: true
    },

    // Approval workflow
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },

    lastLogin: {
        type: Date
    }
}, {
    timestamps: true
});


userSchema.methods.validatePassword = async function (inputPassword) {
    const user = this;

    const hashPassword = user.password;

    const validatedPassword = await bcrypt.compare(inputPassword, hashPassword);

    return validatedPassword;
}

userSchema.methods.getJWT = async function () {
    const user = this;


    const token = await jwt.sign({...user}, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY });

    return token;
}

const User = mongoose.model("User", userSchema);

export default User;
