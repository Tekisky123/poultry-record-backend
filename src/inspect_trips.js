import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: "./src/.env" });

import Trip from "./models/Trip.js";
import User from "./models/User.js";

async function run() {
    await mongoose.connect(process.env.DATABASE_URI, {
        dbName: process.env.DATABASE_NAME
    });

    console.log("Connected to database.");

    // Query all trips
    const trips = await Trip.find({}).populate('supervisor', 'name').lean();
    console.log(`Total trip records: ${trips.length}`);

    trips.forEach((t, idx) => {
        console.log(`${idx + 1}: TripId: ${t.tripId}, Type: ${t.type}, Status: ${t.status}, Supervisor: ${t.supervisor?.name || 'N/A'} (ID: ${t.supervisor?._id || 'N/A'}), birdsPurchased: ${t.summary?.totalBirdsPurchased || 0}, birdsSold: ${t.summary?.totalBirdsSold || 0}, stocks: ${t.stocks?.length || 0}, sales: ${t.sales?.length || 0}`);
    });

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
