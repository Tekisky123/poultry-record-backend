// models/User.js

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
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
        enum: ['admin', 'supervisor', 'driver', 'labour']
    },

    email: {
        type: String,
        required: [
            function () {
                return this.role === 'admin' || this.role === 'supervisor';
            },
            'Email is required for admin and supervisor'
        ],
        unique: true,
        lowercase: true,
        validate: {
            validator: function (value) {
                // Allow empty email if not required
                if (!value) return true;
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
            message: 'Invalid contact number'
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
                // at least one uppercase, one lowercase, one number
                return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(value);
            },
            message: 'Password must contain uppercase, lowercase, and a number'
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

    const token = await jwt.sign({ 
        _id: user._id, 
        role:user.role, 
        name:user.name 
    }, process.env.JWT_SECRET, { expiresIn: '1h' });

    return token;
}

const User = mongoose.model("User", userSchema);

export default User;
