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
        enum: ["pickup", "mini-truck", "truck", "tempo", "container", "trailer"],
        default: "truck",
    },

    capacityKg: {
        type: Number,
        min: [100, "Capacity should be at least 100kg"]
    },

    fuelType: {
        type: String,
        enum: ["diesel", "petrol", "cng", "electric"],
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

    currentStatus: {
        type: String,
        enum: ["idle", "in-transit", "maintenance"],
        default: "idle"
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