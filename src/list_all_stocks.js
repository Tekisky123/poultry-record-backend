import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

import User from "./models/User.js";
import InventoryStock from "./models/InventoryStock.js";
import Trip from "./models/Trip.js";
import Vendor from "./models/Vendor.js";
import Customer from "./models/Customer.js";

async function run() {
    await mongoose.connect(process.env.DATABASE_URI, {
        dbName: process.env.DATABASE_NAME
    });

    console.log("=== USERS IN DATABASE ===");
    const users = await User.find({}).lean();
    users.forEach(u => {
        console.log(`User: ${u.name} (ID: ${u._id}, Role: ${u.role})`);
    });

    console.log("\n=== ALL INVENTORY STOCK ENTRIES ===");
    const stocks = await InventoryStock.find({ inventoryType: 'bird' })
        .populate("supervisorId", "name")
        .populate("vendorId", "vendorName")
        .populate("customerId", "shopName")
        .sort({ date: 1 })
        .lean();
    
    stocks.forEach((s, idx) => {
        console.log(`[${idx}] Date: ${s.date.toISOString().split('T')[0]}, Type: ${s.type}, Birds: ${s.birds}, Weight: ${s.weight}, Amt: ${s.amount}, Sup: ${s.supervisorId?.name || 'N/A'} (${s.supervisorId?._id || 'null'}), Vendor/Cust: ${s.vendorId?.vendorName || s.customerId?.shopName || 'N/A'}`);
    });

    console.log("\n=== ALL TRIP STOCK SUBDOCUMENTS ===");
    const trips = await Trip.find({})
        .populate("supervisor", "name")
        .lean();
    
    trips.forEach((t, idx) => {
        if (t.stocks && t.stocks.length > 0) {
            console.log(`Trip displayId: ${t.tripId}, Sup: ${t.supervisor?.name || 'N/A'} (${t.supervisor?._id || 'null'})`);
            t.stocks.forEach((s, sidx) => {
                console.log(`  [${sidx}] Date: ${s.addedAt?.toISOString()?.split('T')?.[0]}, Birds: ${s.birds}, Weight: ${s.weight}, Rate: ${s.rate}, Value: ${s.value}`);
            });
        }
    });

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
