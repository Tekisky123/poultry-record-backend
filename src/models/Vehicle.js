// models/Vehicle.js
import mongoose from "mongoose";
import validator from "validator";

const vehicleSchema = new mongoose.Schema({
    vehicleNumber: {
        type: String,
        required: [true, 'Vehicle number is required'],
        unique: true,
        trim: true,
        uppercase: true,
        minlength: [2, 'Vehicle number too short'],
        maxlength: [20, 'Vehicle number too long'],
        validate: {
            validator: v => /^[A-Z0-9-\s]+$/.test(v),
            message: props => `${props.value} is not a valid vehicle number`
        }
    },

    type: {
        type: String,
        enum: ["Pickup", "Mini Truck", "Truck", "Tempo", "Container", "Trailer"],
        required: true,
        trim: true
    },

    capacityKg: {
        type: Number,
        required: true,
        min: [100, "Capacity should be at least 100kg"]
    },

    fuelType: {
        type: String,
        enum: ["Diesel", "Petrol", "CNG", "Electric"],
    },

    fuelEfficiency: { type: Number, default: 6 }, // km per liter

    dcSections: {
        type: Number,
        required: true,
        min: [1, 'dcSections must be at least 1'],
        validate: {
            validator: Number.isInteger,
            message: 'dcSections must be an integer'
        }
    },

    purchaseType: {
        type: String,
        required: true,
        enum: ["OWNED", "RENTED"]
    },

    purchaseDate: {
        type: Date,
        validate: [
            {
                validator: function (val) {
                    // Require date if purchaseType is OWNED
                    return this.purchaseType !== "OWNED" || validator.isDate(String(val));
                },
                message: "Purchase date is required for owned vehicles"
            },
            {
                validator: val => !val || val <= new Date(),
                message: "purchaseDate cannot be in the future"
            }
        ]
    },

    purchaseAmount: {
        type: mongoose.Schema.Types.Decimal128,
        min: [0, 'purchaseAmount cannot be negative'],
        validate: {
            validator: function (val) {
                if (this.purchaseType === "OWNED") {
                    return val != null && parseFloat(val.toString()) > 0;
                }
                return true;
            },
            message: "Purchase amount must be greater than 0 for owned vehicles"
        },
        get: v => (v != null ? parseFloat(v.toString()) : v),
        set: v => (v == null ? v : mongoose.Types.Decimal128.fromString(String(v)))
    },

    rentedFrom: {
        type: String,
        trim: true,
        select: false,
        validate: {
            validator: function (val) {
                return this.purchaseType === "RENTED" ? !!val : true;
            },
            message: "Rented from (vendor name) is required for rented vehicles"
        }
    },

    rentedPerKmCharge: {
        type: mongoose.Schema.Types.Decimal128,
        min: [0, 'rentedPerKmCharge cannot be negative'],
        validate: {
            validator: function (val) {
                if (this.purchaseType === "RENTED") {
                    return val != null && parseFloat(val.toString()) > 0;
                }
                return true;
            },
            message: "Per km rent must be greater than 0 for rented vehicles"
        },
        get: v => (v != null ? parseFloat(v.toString()) : v),
        set: v => (v == null ? v : mongoose.Types.Decimal128.fromString(String(v)))
    },

    isInsured: {
        type: Boolean,
        default: false
    },

    insuranceExpiryDate: {
        type: Date,
        validate: {
            validator: function (val) {
                return !this.isInsured || !!val;
            },
            message: "Insurance expiry date is required when vehicle is insured"
        }
    },

    permitValidTill: { type: Date },
    fitnessCertificateExpiry: { type: Date },
    pollutionCertificateExpiry: { type: Date },

    currentStatus: {
        type: String,
        enum: ["Idle", "In Transit", "Maintenance"],
        default: "Idle"
    },

    location: {
        type: {
            type: String,
            enum: ["Point"],
            default: "Point"
        },
        coordinates: {
            type: [Number],
            default: [0, 0],
            validate: {
                validator: arr => arr.length === 2 && arr.every(num => typeof num === "number"),
                message: "Coordinates must be [longitude, latitude]"
            }
        }
    }

}, {
    timestamps: true,
    strict: true,
    optimisticConcurrency: true,
    toJSON: {
        virtuals: true,
        transform(doc, ret) {
            ret.id = ret._id;
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

vehicleSchema.pre('save', function (next) {
    if (this.vehicleNumber) {
        this.vehicleNumber = String(this.vehicleNumber).toUpperCase().trim();
    }
    next();
});

vehicleSchema.index({ vehicleNumber: 1 }, { unique: true });
vehicleSchema.index({ location: "2dsphere" });

const Vehicle = mongoose.model("Vehicle", vehicleSchema);

export default Vehicle;