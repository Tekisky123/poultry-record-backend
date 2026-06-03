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

async function run() {
    await mongoose.connect(process.env.DATABASE_URI, {
        dbName: process.env.DATABASE_NAME
    });

    // 1. Get distinct supervisorIds from InventoryStock
    const distinctStockSups = await InventoryStock.distinct("supervisorId");
    console.log("Distinct supervisorIds in InventoryStock:", distinctStockSups);

    // 2. Get distinct supervisors from Trip
    const distinctTripSups = await Trip.distinct("supervisor");
    console.log("Distinct supervisors in Trip:", distinctTripSups);

    // Combine distinct IDs
    const allIds = new Set([...distinctStockSups.map(id => id?.toString()), ...distinctTripSups.map(id => id?.toString())]);
    
    console.log("\n=== DETAILS FOR ALL REFERENCED USERS ===");
    for (const id of allIds) {
        if (!id) {
            console.log("null / undefined ID");
            continue;
        }
        const user = await User.findById(id).lean();
        const stockCount = await InventoryStock.countDocuments({ supervisorId: id });
        const tripCount = await Trip.countDocuments({ supervisor: id });
        if (user) {
            console.log(`User: ${user.name} (ID: ${id}, Role: ${user.role}, Active: ${user.isActive}) -> Stocks: ${stockCount}, Trips: ${tripCount}`);
        } else {
            console.log(`UNKNOWN User (ID: ${id}) -> Stocks: ${stockCount}, Trips: ${tripCount}`);
        }
    }

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
