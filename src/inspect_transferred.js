import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./src/.env" });

import Trip from "./models/Trip.js";
import User from "./models/User.js";

async function run() {
    await mongoose.connect(process.env.DATABASE_URI, {
        dbName: process.env.DATABASE_NAME
    });

    console.log("Connected to database.");

    // Query transferred trips
    const trips = await Trip.find({ type: 'transferred' }).populate('supervisor', 'name').lean();
    console.log(`Total transferred trips: ${trips.length}`);

    trips.forEach((t, idx) => {
        console.log(`\n--- Transferred Trip ${idx + 1} ---`);
        console.log(`Trip ID: ${t.tripId}`);
        console.log(`Database ID: ${t._id}`);
        console.log(`Supervisor: ${t.supervisor?.name} (ID: ${t.supervisor?._id})`);
        console.log(`Status: ${t.status}`);
        console.log(`Date: ${t.date}`);
        console.log(`CreatedBy: ${t.createdBy}`);
        console.log(`UpdatedBy: ${t.updatedBy}`);
        console.log(`Birds Purchased: ${t.summary?.totalBirdsPurchased}`);
        console.log(`Birds Sold: ${t.summary?.totalBirdsSold}`);
        console.log(`Sales: ${JSON.stringify(t.sales)}`);
        console.log(`Stocks: ${JSON.stringify(t.stocks)}`);
    });

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
