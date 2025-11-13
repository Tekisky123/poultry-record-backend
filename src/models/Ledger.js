import mongoose from "mongoose";

const ledgerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Ledger name is required"],
        trim: true,
        minlength: [2, "Ledger name must be at least 2 characters"],
        maxlength: [100, "Ledger name cannot exceed 100 characters"]
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: [true, "Group is required"]
    },
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
        default: null
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        default: null
    },
    ledgerType: {
        type: String,
        enum: {
            values: ['vendor', 'customer', 'other'],
            message: 'Ledger type must be one of: vendor, customer, other'
        },
        default: 'other'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User',
        immutable: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
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

// Index for efficient queries
ledgerSchema.index({ group: 1 });
ledgerSchema.index({ vendor: 1 });
ledgerSchema.index({ customer: 1 });
ledgerSchema.index({ ledgerType: 1 });
ledgerSchema.index({ isActive: 1 });

// Validation: If ledgerType is vendor, vendor must be provided
ledgerSchema.pre('validate', function(next) {
    if (this.ledgerType === 'vendor' && !this.vendor) {
        this.invalidate('vendor', 'Vendor is required when ledger type is vendor');
    }
    if (this.ledgerType === 'customer' && !this.customer) {
        this.invalidate('customer', 'Customer is required when ledger type is customer');
    }
    if (this.ledgerType === 'other' && (this.vendor || this.customer)) {
        this.invalidate('ledgerType', 'Vendor or customer should not be set when ledger type is other');
    }
    next();
});

const Ledger = mongoose.model("Ledger", ledgerSchema);

export default Ledger;

