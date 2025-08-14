import mongoose from "mongoose";
import validator from "validator";

const clientSchema = new mongoose.Schema({
  shopName: { type: String, required: true },
  ownerName: String,
  contact: { type: String, required: true },
  address: String,
  shopType: String,
  creditLimit: { type: Number, default: 0 },
  creditDays: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const Client = mongoose.model("Client", clientSchema);

export default Client;