import mongoose from "mongoose";
import validator from "validator";

const indirectExpenseSchema = new mongoose.Schema({
    expenseId: {
        type: String,
        required: true,
        unique: true,
        default: function() {
            return 'IND-' + Date.now();
        }
    },
    
    title: {
        type: String,
        required: [true, 'Expense title is required'],
        trim: true,
        minlength: [3, 'Title must be at least 3 characters'],
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: [
            'office-rent',
            'electricity',
            'water',
            'internet',
            'phone',
            'insurance',
            'legal-fees',
            'accounting',
            'marketing',
            'equipment-maintenance',
            'office-supplies',
            'staff-salary',
            'training',
            'travel',
            'bank-charges',
            'other'
        ]
    },
    
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        min: [0, 'Amount cannot be negative']
    },
    
    expenseDate: {
        type: Date,
        required: [true, 'Expense date is required'],
        default: Date.now
    },
    
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank-transfer', 'cheque', 'online'],
        default: 'cash'
    },
    
    receipt: {
        type: String, // File path or URL
        default: ''
    },
    
    vendor: {
        type: String,
        trim: true,
        maxlength: [100, 'Vendor name too long']
    },
    
    isRecurring: {
        type: Boolean,
        default: false
    },
    
    recurringFrequency: {
        type: String,
        enum: ['monthly', 'quarterly', 'yearly', ''],
        required: function() {
            return this.isRecurring;
        }
    },
    
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Audit fields
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
    
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

// Indexes for better performance
indirectExpenseSchema.index({ expenseDate: -1 });
indirectExpenseSchema.index({ category: 1 });
indirectExpenseSchema.index({ isActive: 1 });

const IndirectExpense = mongoose.model('IndirectExpense', indirectExpenseSchema);

export default IndirectExpense;
