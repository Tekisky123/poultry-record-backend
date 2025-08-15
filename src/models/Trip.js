import mongoose from "mongoose";

const tripSchema = new mongoose.Schema({
    tripId: { type: String, unique: true, required: true },
    date: { type: Date, required: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    labours: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        required: true,
        validate: [arr => arr.length > 0, 'At least one labour is required']
    },
    route: {
        from: String,
        to: String,
        distance: Number
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
        category: { type: String, enum: ['meals', 'toll', 'maintenance', 'other'] },
        amount: Number,
        receipt: String,
        description: String,
        timestamp: { type: Date, default: Date.now }
    }],

    // Bird Purchases
    purchases: [{
        supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
        dcNumber: String,
        birds: Number,
        weight: Number,
        avgWeight: Number,
        rate: Number,
        amount: Number,
        paymentMode: { type: String, enum: ['cash', 'credit', 'advance'] },
        paymentStatus: { type: String, enum: ['paid', 'pending', 'partial'], default: 'pending' },
        timestamp: { type: Date, default: Date.now }
    }],

    // Bird Sales
    sales: [{
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
        billNumber: String,
        birds: Number,
        weight: Number,
        avgWeight: Number,
        rate: Number,
        amount: Number,
        paymentMode: { type: String, enum: ['cash', 'online', 'credit'] },
        paymentStatus: { type: String, enum: ['paid', 'pending', 'partial'], default: 'pending' },
        receivedAmount: { type: Number, default: 0 },
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
        mortality: { type: Number, default: 0 },
        netProfit: { type: Number, default: 0 },
        profitPerKg: { type: Number, default: 0 },
        fuelEfficiency: { type: Number, default: 0 }
    },

    status: { type: String, enum: ['started', 'ongoing', 'completed'], default: 'started' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});


const Trip = mongoose.model('Trip', tripSchema);

export default Trip;