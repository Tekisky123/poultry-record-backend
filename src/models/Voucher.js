import mongoose from "mongoose";

const voucherSchema = new mongoose.Schema({
  voucherNumber: {
    type: Number,
    required: true,
    unique: true,
    min: [1, "Voucher number must be greater than zero"]
  },
  voucherType: {
    type: String,
    required: true,
    enum: ['Sales', 'Purchase', 'Payment', 'Receipt', 'Contra', 'Journal']
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  party: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer', // Can reference Customer or Vendor
    required: false // Optional for some voucher types
  },
  partyName: {
    type: String,
    required: false,
    trim: true
  },
  entries: [{
    account: {
      type: String,
      required: true,
      trim: true
    },
    debitAmount: {
      type: Number,
      default: 0,
      min: [0, "Debit amount cannot be negative"]
    },
    creditAmount: {
      type: Number,
      default: 0,
      min: [0, "Credit amount cannot be negative"]
    },
    narration: {
      type: String,
      trim: true,
      maxlength: [500, "Narration cannot exceed 500 characters"]
    }
  }],
  totalDebit: {
    type: Number,
    default: 0,
    min: [0, "Total debit cannot be negative"]
  },
  totalCredit: {
    type: Number,
    default: 0,
    min: [0, "Total credit cannot be negative"]
  },
  narration: {
    type: String,
    trim: true,
    maxlength: [500, "Narration cannot exceed 500 characters"]
  },
  status: {
    type: String,
    enum: ['draft', 'posted'],
    default: 'draft'
  },
  isActive: {
    type: Boolean,
    default: true
  },
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

// Pre-save middleware to calculate totals and validate debit = credit
voucherSchema.pre('save', function(next) {
  // Calculate total debit and credit
  this.totalDebit = this.entries.reduce((sum, entry) => sum + (entry.debitAmount || 0), 0);
  this.totalCredit = this.entries.reduce((sum, entry) => sum + (entry.creditAmount || 0), 0);
  
  // Validate that debit equals credit
  if (Math.abs(this.totalDebit - this.totalCredit) > 0.01) { // Allow for small rounding differences
    return next(new Error('Total debit amount must equal total credit amount'));
  }
  
  // Validate that each entry has either debit or credit, not both
  for (let entry of this.entries) {
    if (entry.debitAmount > 0 && entry.creditAmount > 0) {
      return next(new Error('Each entry must have either debit or credit amount, not both'));
    }
    if (entry.debitAmount === 0 && entry.creditAmount === 0) {
      return next(new Error('Each entry must have either debit or credit amount'));
    }
  }
  
  next();
});

// Index for better query performance
voucherSchema.index({ voucherNumber: 1 });
voucherSchema.index({ voucherType: 1 });
voucherSchema.index({ date: -1 });
voucherSchema.index({ party: 1 });

const Voucher = mongoose.model("Voucher", voucherSchema);

export default Voucher;
