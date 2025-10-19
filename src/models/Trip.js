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
    // sequence: { 
    //     type: Number, 
    //     required: true,
    //     unique: true
    // },
    date: { type: Date, required: true },
    place: { type: String }, // Optional general reference (e.g., SNK area)
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driver: { type: String, required: true },
    labour: { type: String, default: '' }, // Optional labour worker name
    route: {
        from: { type: String, required: true }, // Start location
        to: { type: String, required: true }, // End location
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

    // Rent and Distance
    rentPerKm: { type: Number, default: 0 }, // Rent per kilometer from vehicle
    totalKm: { type: Number, default: 0 }, // Total kilometers traveled
    dieselAmount: { type: Number, default: 0 }, // Total diesel amount spent

    // Trip Expenses
    expenses: [{
        category: { 
            type: String, 
            enum: ['parking','meals', 'toll', 'maintenance', 'tea', 'lunch', 'loading/unloading', 'other'],
            required: true
        },
        amount: { type: Number, required: true },
        receipt: String,
        description: String,
        timestamp: { type: Date, default: Date.now }
    }],

    // Bird Purchases
    purchases: [{
        supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
        dcNumber: { type: String, required: true },
        birds: { type: Number, required: true },
        weight: { type: Number, required: true },
        avgWeight: { type: Number }, // Calculated field
        rate: { type: Number, required: true },
        amount: { type: Number, required: true },
        // paymentMode: { type: String, enum: ['cash', 'credit', 'advance'], default: 'cash' },
        // paymentStatus: { type: String, enum: ['paid', 'pending', 'partial'], default: 'pending' },
        timestamp: { type: Date, default: Date.now }
    }],

    // Bird Sales
    sales: [{
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
        billNumber: { type: String, required: true },
        birds: { type: Number, required: true },
        weight: { type: Number, required: true },
        avgWeight: { type: Number }, // Calculated field
        rate: { type: Number, required: true },
        amount: { type: Number, required: true },
        profitMargin: { type: Number, default: 0 }, // Calculated: (saleRate - avgPurchaseRate)
        profitAmount: { type: Number, default: 0 }, // Calculated: profitMargin * weight
        // paymentMode: { type: String, enum: ['cash', 'online', 'credit'], default: 'cash' },
        // paymentStatus: { type: String, enum: ['paid', 'pending', 'partial'], default: 'pending' },
        receivedAmount: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        cashPaid: { type: Number, default: 0 },
        onlinePaid: { type: Number, default: 0 },
        balance: { type: Number, default: 0 }, // Calculated balance after this sale
        timestamp: { type: Date, default: Date.now }
    }],

    // Losses - Death Birds
    losses: [{
        quantity: { type: Number, required: true },
        weight: { type: Number, required: true },
        avgWeight: { type: Number }, // Calculated field
        rate: { type: Number, required: true },
        total: { type: Number, required: true }, // Calculated field
        reason: { type: String }, // Reason for death
        date: { type: Date, required: true },
        timestamp: { type: Date, default: Date.now }
    }],

    // Stock Management - Multiple Stock Entries
    stocks: [{
        birds: { type: Number, required: true },
        weight: { type: Number, required: true },
        avgWeight: { type: Number, default: 0 },
        value: { type: Number, default: 0 }, // Not counted in profit
        rate: { type: Number, required: true }, // Purchase rate for this stock
        addedAt: { type: Date, default: Date.now },
        notes: { type: String, default: '' }
    }],

    // Trip Summary
    summary: {
        totalPurchaseAmount: { type: Number, default: 0 },
        totalSalesAmount: { type: Number, default: 0 },
        totalExpenses: { type: Number, default: 0 },
        totalDieselAmount: { type: Number, default: 0 },
        totalLosses: { type: Number, default: 0 }, // Total losses from death birds
        totalBirdsPurchased: { type: Number, default: 0 },
        totalBirdsSold: { type: Number, default: 0 },
        totalBirdsLost: { type: Number, default: 0 }, // Total birds lost
        totalWeightPurchased: { type: Number, default: 0 },
        totalWeightSold: { type: Number, default: 0 },
        totalWeightLost: { type: Number, default: 0 }, // Total weight lost
        birdWeightLoss: { type: Number, default: 0 }, // Calculated: purchased - sold - stock - death
        birdsRemaining: { type: Number, default: 0 }, // Birds left after sales
        mortality: { type: Number, default: 0 }, // Birds that died
        birdsTransferred: { type: Number, default: 0 }, // Birds transferred to other trips
        weightTransferred: { type: Number, default: 0 }, // Weight transferred to other trips
        netProfit: { type: Number, default: 0 },
        totalProfitMargin: { type: Number, default: 0 }, // Total profit from sales only
        totalCashPaid: { type: Number, default: 0 }, // Total cash payments received
        totalOnlinePaid: { type: Number, default: 0 }, // Total online payments received
        totalDiscount: { type: Number, default: 0 }, // Total discounts given
        totalReceivedAmount: { type: Number, default: 0 }, // Total amount received (cash + online)
        profitPerKg: { type: Number, default: 0 },
        fuelEfficiency: { type: Number, default: 0 },
        avgPurchaseRate: { type: Number, default: 0 } // Average purchase rate for calculations
    },

    status: { 
        type: String, 
        enum: ['started', 'ongoing', 'completed'], 
        default: 'started' 
    },

    // Trip type for transfer tracking
    type: {
        type: String,
        enum: ['original', 'transferred'],
        default: 'original'
    },

    // Transfer relationships
    transferredFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
    transferredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Trip' }],

    // Transfer history for audit trail
    transferHistory: [{
        transferredTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
        transferredToSupervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        transferredStock: {
            birds: { type: Number, required: true },
            weight: { type: Number, required: true },
            avgWeight: { type: Number, required: true },
            rate: { type: Number, required: true }
        },
        reason: { type: String, required: true },
        transferredAt: { type: Date, default: Date.now },
        transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
    }],

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
tripSchema.pre('save', async function(next) {
    // Generate sequence number if not provided
    // if (this.isNew && !this.sequence) {
    //     try {
    //         const lastTrip = await this.constructor.findOne({}, {}, { sort: { sequence: -1 } });
    //         this.sequence = lastTrip ? lastTrip.sequence + 1 : 1;
    //     } catch (error) {
    //         return next(error);
    //     }
    // }

    // Calculate average weights
    if (this.purchases && this.purchases.length > 0) {
        this.purchases.forEach(purchase => {
            if (purchase.birds && purchase.weight) {
                purchase.avgWeight = Number((purchase.weight / purchase.birds).toFixed(2));
            }
        });
    }

    if (this.sales && this.sales.length > 0) {
        // Calculate average purchase rate for profit calculations
        const avgPurchaseRate = this.summary.totalWeightPurchased > 0 ? 
            this.summary.totalPurchaseAmount / this.summary.totalWeightPurchased : 0;
        this.summary.avgPurchaseRate = Number(avgPurchaseRate.toFixed(2));

        // Process sales sequentially to ensure proper async handling
        for (let i = 0; i < this.sales.length; i++) {
            const sale = this.sales[i];
            
            if (sale.birds && sale.weight) {
                sale.avgWeight = Number((sale.weight / sale.birds).toFixed(2));
            }
            // Calculate profit margin and profit amount
            sale.profitMargin = Number((sale.rate - avgPurchaseRate).toFixed(2));
            sale.profitAmount = Number((sale.profitMargin * sale.weight).toFixed(2));
            // Calculate receivedAmount from cashPaid + onlinePaid
            sale.receivedAmount = (sale.cashPaid || 0) + (sale.onlinePaid || 0);
            
            // Calculate Opening Balance using the formula:
            // Opening Balance(current) = Opening Balance(global) + Total Amount - Online Paid - Cash Paid - Discount
            if (sale.client) {
                try {
                    const Customer = mongoose.model('Customer');
                    const customer = await Customer.findById(sale.client);
                    if (customer) {
                        const globalOpeningBalance = customer.openingBalance || 0;
                        const totalPaid = (sale.onlinePaid || 0) + (sale.cashPaid || 0);
                        const discount = sale.discount || 0;
                        
                        // Calculate the balance after this sale
                        let balance = globalOpeningBalance + sale.amount - totalPaid - discount;
                        
                        // If payment exceeds the sale amount + current opening balance, 
                        // the extra payment reduces the balance to 0 (minimum)
                        balance = Math.max(0, balance);
                        
                        sale.balance = balance;
                        
                        // Note: Customer's global opening balance will be updated via API call from trip controller
                    }
                } catch (error) {
                    console.error('Error calculating opening balance:', error);
                }
            }
        }
    }

    // Calculate losses fields
    if (this.losses && this.losses.length > 0) {
        const avgPurchaseRate = this.summary.avgPurchaseRate || 0;
        this.losses.forEach(loss => {
            if (loss.quantity && loss.weight) {
                loss.avgWeight = Number((loss.weight / loss.quantity).toFixed(2));
            }
            // Calculate total loss using average purchase rate
            if (loss.weight && avgPurchaseRate > 0) {
                loss.total = Number((loss.weight * avgPurchaseRate).toFixed(2));
            }
        });
    }

    // Calculate summary statistics
    if (this.purchases && this.purchases.length > 0) {
        this.summary.totalPurchaseAmount = this.purchases.reduce((sum, purchase) => sum + (purchase.amount || 0), 0);
        this.summary.totalBirdsPurchased = this.purchases.reduce((sum, purchase) => sum + (purchase.birds || 0), 0);
        this.summary.totalWeightPurchased = this.purchases.reduce((sum, purchase) => sum + (purchase.weight || 0), 0);
    }

    if (this.sales && this.sales.length > 0) {
        this.summary.totalSalesAmount = this.sales.reduce((sum, sale) => sum + (sale.amount || 0), 0);
        this.summary.totalBirdsSold = this.sales.reduce((sum, sale) => sum + (sale.birds || 0), 0);
        this.summary.totalWeightSold = this.sales.reduce((sum, sale) => sum + (sale.weight || 0), 0);
        this.summary.totalProfitMargin = this.sales.reduce((sum, sale) => sum + (sale.profitAmount || 0), 0);
        this.summary.totalCashPaid = this.sales.reduce((sum, sale) => sum + (sale.cashPaid || 0), 0);
        this.summary.totalOnlinePaid = this.sales.reduce((sum, sale) => sum + (sale.onlinePaid || 0), 0);
        this.summary.totalDiscount = this.sales.reduce((sum, sale) => sum + (sale.discount || 0), 0);
        this.summary.totalReceivedAmount = this.sales.reduce((sum, sale) => sum + (sale.receivedAmount || 0), 0);
    }

    if (this.expenses && this.expenses.length > 0) {
        this.summary.totalExpenses = this.expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
    }

    if (this.diesel && this.diesel.stations && this.diesel.stations.length > 0) {
        this.summary.totalDieselAmount = this.diesel.stations.reduce((sum, station) => sum + (station.amount || 0), 0);
    }

    if (this.losses && this.losses.length > 0) {
        this.summary.totalLosses = this.losses.reduce((sum, loss) => sum + (loss.total || 0), 0);
        this.summary.totalBirdsLost = this.losses.reduce((sum, loss) => sum + (loss.quantity || 0), 0);
        this.summary.totalWeightLost = this.losses.reduce((sum, loss) => sum + (loss.weight || 0), 0);
        this.summary.mortality = this.summary.totalBirdsLost;
    }

    // Calculate total stock birds and weight from stocks array
    const totalStockBirds = this.stocks.reduce((sum, stock) => sum + (stock.birds || 0), 0);
    const totalStockWeight = this.stocks.reduce((sum, stock) => sum + (stock.weight || 0), 0);
    const totalStockValue = this.stocks.reduce((sum, stock) => sum + (stock.value || 0), 0);

    // Calculate bird weight loss: purchased - sold - stock - death
    this.summary.birdWeightLoss = (this.summary.totalWeightPurchased || 0) - 
                                 (this.summary.totalWeightSold || 0) - 
                                 totalStockWeight - 
                                 (this.summary.totalWeightLost || 0);

    // Calculate total transferred birds from transfer history
    const totalTransferredBirds = this.transferHistory.reduce((sum, transfer) => sum + (transfer.transferredStock?.birds || 0), 0);
    const totalTransferredWeight = this.transferHistory.reduce((sum, transfer) => sum + (transfer.transferredStock?.weight || 0), 0);
    this.summary.birdsTransferred = totalTransferredBirds;
    this.summary.weightTransferred = totalTransferredWeight;

    // Calculate birds remaining: purchased - sold - stock - lost - transferred
    this.summary.birdsRemaining = (this.summary.totalBirdsPurchased || 0) - 
                                 (this.summary.totalBirdsSold || 0) - 
                                 totalStockBirds - 
                                 (this.summary.totalBirdsLost || 0) -
                                 totalTransferredBirds;

    // Calculate net profit from sales profit margin minus expenses and diesel
    const salesProfit = this.summary.totalProfitMargin || 0;
    const totalExpenses = (this.summary.totalExpenses || 0) + (this.summary.totalDieselAmount || 0);
    const totalLosses = this.summary.totalLosses || 0;
    this.summary.netProfit = salesProfit - totalExpenses - totalLosses;

    // Validate vehicle readings if closing reading is provided
    if (this.vehicleReadings.opening && this.vehicleReadings.closing) {
        if (this.vehicleReadings.closing < this.vehicleReadings.opening) {
            return next(new Error('Closing odometer reading must be greater than opening reading'));
        }
        this.vehicleReadings.totalDistance = this.vehicleReadings.closing - this.vehicleReadings.opening;
    }

    next();
});

const Trip = mongoose.model('Trip', tripSchema);

export default Trip;