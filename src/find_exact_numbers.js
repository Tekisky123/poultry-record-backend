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

    console.log("=== SEARCHING DB FOR 361 OR 787.03 ===");

    // Search InventoryStock
    const matchedStocks = await InventoryStock.find({
        $or: [
            { birds: 361 },
            { weight: 787.03 },
            { weight: -787.03 },
            { amount: 77457.77 },
            { amount: -77457.77 }
        ]
    }).populate("supervisorId", "name").lean();

    console.log(`Found ${matchedStocks.length} matching documents in InventoryStock:`);
    matchedStocks.forEach(s => {
        console.log(`Stock: ID=${s._id}, Type=${s.type}, Date=${s.date}, Birds=${s.birds}, Weight=${s.weight}, Amt=${s.amount}, Sup=${s.supervisorId?.name || 'N/A'}`);
    });

    // Search Trips
    const matchedTrips = await Trip.find({
        $or: [
            { "stocks.birds": 361 },
            { "stocks.weight": 787.03 },
            { "stocks.value": 77457.77 }
        ]
    }).populate("supervisor", "name").lean();

    console.log(`Found ${matchedTrips.length} matching documents in Trips:`);
    matchedTrips.forEach(t => {
        console.log(`Trip: ID=${t._id}, displayId=${t.tripId}, Sup=${t.supervisor?.name || 'N/A'}`);
        t.stocks.forEach(s => {
            console.log(`  - Stock: Birds=${s.birds}, Weight=${s.weight}, Value=${s.value}`);
        });
    });

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
