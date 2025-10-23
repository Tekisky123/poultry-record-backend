import mongoose from "mongoose";
import validator from "validator";

const customerSchema = new mongoose.Schema({
  shopName: { 
    type: String, 
    required: [true, "Shop name is required"],
    trim: true,
    minlength: [2, "Shop name must be at least 2 characters"],
    maxlength: [100, "Shop name cannot exceed 100 characters"]
  },
  ownerName: { 
    type: String, 
    trim: true,
    maxlength: [100, "Owner name cannot exceed 100 characters"]
  },
  contact: { 
    type: String,
    required: [true, "Contact number is required"],
    trim: true,
    validate: {
      validator: val => validator.isMobilePhone(val, "any", { strictMode: true }),
      message: "Invalid contact number"
    }
  },
  address: { 
    type: String, 
    trim: true,
    maxlength: [200, "Address cannot exceed 200 characters"]
  },
  gstOrPanNumber: { 
    type: String, 
    required: [true, "GST or PAN number is required"],
    trim: true,
    maxlength: [100, "GST or PAN number cannot exceed 100 characters"]
  },
  area: { 
    type: String, 
    trim: true,
    maxlength: [100, "Area name too long"]
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  updatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  // Reference to User account for login credentials
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: false // Optional for backward compatibility
  },
  // Global Opening Balance for customer (static initial balance - never changes)
  openingBalance: {
    type: Number,
    default: 0,
    min: [0, "Opening balance cannot be negative"]
  },
  // Global Outstanding Balance for customer (dynamic balance - changes with transactions)
  outstandingBalance: {
    type: Number,
    default: 0,
    min: [0, "Outstanding balance cannot be negative"]
  },
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

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;