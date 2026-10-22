
import mongoose from "mongoose";

const inventoryStockSchema = new mongoose.Schema({
  inventoryType: {
    type: String,
    enum: ["bird", "feed"],
    required: true
  },

  type: {
    type: String,
    enum: [
      "opening",
      "purchase",
      "sale",
      "mortality",
      "weight_loss",
      "consume",   // feed consume
      "receipt",
      "natural_weight_loss"
    ],
    required: true
  },

  // 🐔 Bird inventory fields
  birds: { type: Number, default: 0 },
  weight: { type: Number, default: 0 },

  // 🌾 Feed inventory fields
  feedQty: { type: Number, default: 0 }, // kg / bags
  bags: { type: Number, default: 0 },

  rate: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },

  tripId: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" },

  refNo: String, // bill / dc / challan
  notes: String,
  narration: String,

  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
  vehicleNumber: String,

  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
  ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger" },

  // Ledger tracking for Sales/Receipts
  cashLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger" },
  onlineLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger" },
  expenseLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger" },

  // Payment Details
  cashPaid: { type: Number, default: 0 },
  onlinePaid: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  balance: { type: Number, default: 0 }, // For Sale: Remaining balance of this transaction

  billNumber: String, // Similar to refNo but specific for sales

  date: { type: Date, required: true }
}, { timestamps: true });

inventoryStockSchema.index({ date: -1 });
inventoryStockSchema.index({ inventoryType: 1, date: -1 });
inventoryStockSchema.index({ vendorId: 1, date: -1 });
inventoryStockSchema.index({ customerId: 1, date: -1 });
inventoryStockSchema.index({ ledgerId: 1, date: -1 });
inventoryStockSchema.index({ cashLedgerId: 1 });
inventoryStockSchema.index({ onlineLedgerId: 1 });
inventoryStockSchema.index({ expenseLedgerId: 1 });

const InventoryStock = mongoose.model("InventoryStock", inventoryStockSchema);

export default InventoryStock;
