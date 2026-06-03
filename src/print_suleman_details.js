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
import Vehicle from "./models/Vehicle.js";

const toLocalDateStr = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

async function run() {
    await mongoose.connect(process.env.DATABASE_URI, {
        dbName: process.env.DATABASE_NAME
    });

    const prevDateStr = "2026-05-26";
    const birdAnchorDate = "2026-01-01";
    const sulemanId = "68a72bdab852a0d31123cc4b";

    // 1. Fetch InventoryStock
    const inventoryStocks = await InventoryStock.find({
        inventoryType: 'bird',
        supervisorId: sulemanId,
        date: {
            $gte: new Date(birdAnchorDate),
            $lte: (() => {
                const end = new Date(prevDateStr);
                end.setHours(23, 59, 59, 999);
                return end;
            })()
        }
    })
    .populate("vendorId", "vendorName")
    .populate("customerId", "shopName")
    .sort({ date: 1 })
    .lean();

    console.log("=== SULEMAN INVENTORY STOCKS IN RANGE ===");
    inventoryStocks.forEach((s, idx) => {
        console.log(`[${idx}] Date: ${toLocalDateStr(s.date)} (${s.date.toISOString()}), Type: ${s.type}, Birds: ${s.birds}, Weight: ${s.weight}, Amt: ${s.amount}, Vendor/Cust: ${s.vendorId?.vendorName || s.customerId?.shopName || 'N/A'}`);
    });

    // 2. Fetch Trips
    const trips = await Trip.find({
        supervisor: sulemanId,
        stocks: { $exists: true, $not: { $size: 0 } }
    })
    .populate('vehicle', 'vehicleNumber')
    .lean();

    let tripStocks = trips.flatMap(trip => {
        return trip.stocks.map(s => ({
            type: 'purchase',
            birds: s.birds,
            weight: s.weight,
            amount: s.value,
            date: s.addedAt,
            vehicle: trip.vehicle?.vehicleNumber || 'Unassigned'
        }));
    });

    tripStocks = tripStocks.filter(s => new Date(s.date) >= new Date(birdAnchorDate));
    tripStocks = tripStocks.filter(s => new Date(s.date) <= (() => {
        const end = new Date(prevDateStr);
        end.setHours(23, 59, 59, 999);
        return end;
    })());

    console.log("\n=== SULEMAN TRIP STOCKS IN RANGE ===");
    tripStocks.forEach((s, idx) => {
        console.log(`[${idx}] Date: ${toLocalDateStr(s.date)} (${new Date(s.date).toISOString()}), Type: ${s.type}, Birds: ${s.birds}, Weight: ${s.weight}, Amt: ${s.amount}, Vehicle: ${s.vehicle}`);
    });

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
