import mongoose from "mongoose";

const tripSchema = new mongoose.Schema({
    tripId: { 
        type: String, 
        required: true, 
        unique: true,
        default: function() {
            return 'TRP-' + Date.now();
        }
    },
    date: { type: Date, required: true },
    place: { type: String, required: true }, // SNK, etc.
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driver: { type: String, required: true },
    labours: {
        type: [{ type: String }],
        required: true,
        validate: [arr => arr.length > 0, 'At least one labour is required']
    },
    route: {
        from: String,
        to: String,
        distance: Number
    },

    // Vehicle Readings
    vehicleReadings: {
        opening: { type: Number, required: true }, // Opening odometer reading
        closing: { type: Number }, // Closing odometer reading
        totalDistance: { type: Number } // Calculated distance
    },

    // Diesel and Rent
    diesel: {
        stations: [{
            name: String,
            volume: Number,
            rate: Number,
            amount: Number,
            receipt: String,
            timestamp: { type: Date, default: Date.now }
        }],
        totalVolume: { type: Number, default: 0 },
        totalAmount: { type: Number, default: 0 }
    },

    // Trip Expenses
    expenses: [{
        category: { 
            type: String, 
            enum: ['fuel','parking','meals', 'toll', 'maintenance', 'tea', 'lunch', 'other'],
            required: true
        },
        amount: { type: Number, required: true },
        receipt: String,
        description: String,
        timestamp: { type: Date, default: Date.now }
    }],

    // Bird Purchases
    purchases: [{
        supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
        dcNumber: { type: String, required: true },
        birds: { type: Number, required: true },
        weight: { type: Number, required: true },
        avgWeight: { type: Number }, // Calculated field
        rate: { type: Number, required: true },
        amount: { type: Number, required: true },
        paymentMode: { type: String, enum: ['cash', 'credit', 'advance'], default: 'cash' },
        paymentStatus: { type: String, enum: ['paid', 'pending', 'partial'], default: 'pending' },
        timestamp: { type: Date, default: Date.now }
    }],

    // Bird Sales
    sales: [{
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
        billNumber: { type: String, required: true },
        birds: { type: Number, required: true },
        weight: { type: Number, required: true },
        avgWeight: { type: Number }, // Calculated field
        rate: { type: Number, required: true },
        amount: { type: Number, required: true },
        paymentMode: { type: String, enum: ['cash', 'online', 'credit'], default: 'cash' },
        paymentStatus: { type: String, enum: ['paid', 'pending', 'partial'], default: 'pending' },
        receivedAmount: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        balance: { type: Number, default: 0 }, // Calculated field
        timestamp: { type: Date, default: Date.now }
    }],

    // Trip Summary
    summary: {
        totalPurchaseAmount: { type: Number, default: 0 },
        totalSalesAmount: { type: Number, default: 0 },
        totalExpenses: { type: Number, default: 0 },
        totalDieselAmount: { type: Number, default: 0 },
        totalBirdsPurchased: { type: Number, default: 0 },
        totalBirdsSold: { type: Number, default: 0 },
        totalWeightPurchased: { type: Number, default: 0 },
        totalWeightSold: { type: Number, default: 0 },
        birdsRemaining: { type: Number, default: 0 }, // Birds left after sales
        mortality: { type: Number, default: 0 }, // Birds that died
        netProfit: { type: Number, default: 0 },
        profitPerKg: { type: Number, default: 0 },
        fuelEfficiency: { type: Number, default: 0 }
    },

    status: { 
        type: String, 
        enum: ['started', 'ongoing', 'completed'], 
        default: 'started' 
    },

    // Trip completion details
    completionDetails: {
        completedAt: Date,
        closingOdometer: Number,
        finalRemarks: String,
        supervisorSignature: String // Could be a signature image or text
    },

    // Audit fields
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }

}, {
    timestamps: true,
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

// Pre-save middleware to calculate derived fields
tripSchema.pre('save', function(next) {
    // Calculate average weights
    if (this.purchases && this.purchases.length > 0) {
        this.purchases.forEach(purchase => {
            if (purchase.birds && purchase.weight) {
                purchase.avgWeight = Number((purchase.weight / purchase.birds).toFixed(2));
            }
        });
    }

    if (this.sales && this.sales.length > 0) {
        this.sales.forEach(sale => {
            if (sale.birds && sale.weight) {
                sale.avgWeight = Number((sale.weight / sale.birds).toFixed(2));
            }
            // Calculate balance
            sale.balance = sale.amount - sale.receivedAmount - sale.discount;
        });
    }

    // Calculate total distance if both readings are available
    if (this.vehicleReadings.opening && this.vehicleReadings.closing) {
        this.vehicleReadings.totalDistance = this.vehicleReadings.closing - this.vehicleReadings.opening;
    }

    next();
});

const Trip = mongoose.model('Trip', tripSchema);

export default Trip;