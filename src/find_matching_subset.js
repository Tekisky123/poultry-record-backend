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

    // Fetch Suleman InventoryStocks
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
    }).lean();

    // Fetch Suleman Trips
    const trips = await Trip.find({
        supervisor: sulemanId,
        stocks: { $exists: true, $not: { $size: 0 } }
    }).lean();

    const tripStocks = trips.flatMap(trip => {
        return trip.stocks.map(s => ({
            _id: s._id,
            source: 'trip',
            type: 'purchase',
            birds: s.birds,
            weight: s.weight,
            amount: s.value,
            date: s.addedAt
        }));
    }).filter(s => new Date(s.date) >= new Date(birdAnchorDate) && new Date(s.date) <= (() => {
        const end = new Date(prevDateStr);
        end.setHours(23, 59, 59, 999);
        return end;
    })());

    // Fetch opening stock
    const baseBirdOpsList = await InventoryStock.find({ inventoryType: 'bird', type: 'opening' }).lean();
    const sortedBirdOpsAll = [...baseBirdOpsList].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstBirdOp = sortedBirdOpsAll.find(s => toLocalDateStr(s.date) <= prevDateStr);

    console.log("Suleman InventoryStocks:", inventoryStocks.length);
    console.log("Suleman TripStocks:", tripStocks.length);

    // Let's test combinations of:
    // 1. With or Without base opening stock
    // 2. With or Without trip stocks
    // 3. With or Without specific trip stocks
    // 4. Including or excluding certain types of inventory stocks

    const runCalc = (includeOp, includeTrips, excludeTripIdList = []) => {
        const ops = includeOp && firstBirdOp ? [firstBirdOp] : [];
        let tripsFiltered = includeTrips ? tripStocks : [];
        if (excludeTripIdList.length > 0) {
            tripsFiltered = tripsFiltered.filter(s => !excludeTripIdList.includes(s._id.toString()));
        }

        const rawHistBirds = [...inventoryStocks, ...tripsFiltered];

        const histBirdPurch = rawHistBirds.filter(s => s.type === 'purchase');
        const histBirdSales = rawHistBirds.filter(s => s.type === 'sale' || s.type === 'receipt');
        const histBirdMort = rawHistBirds.filter(s => s.type === 'mortality');
        const histWeightLoss = rawHistBirds.filter(s => s.type === 'weight_loss' || s.type === 'natural_weight_loss');

        const bOpBirds = ops.reduce((sum, s) => sum + (Number(s.birds) || 0), 0);
        const bPurchBirds = histBirdPurch.reduce((sum, s) => sum + (Number(s.birds) || 0), 0);
        const bSaleBirds = histBirdSales.reduce((sum, s) => sum + (Number(s.birds) || 0), 0);
        const bMortBirds = histBirdMort.reduce((sum, s) => sum + (Number(s.birds) || 0), 0);

        const bOpWeight = ops.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
        const bPurchWeight = histBirdPurch.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
        const bSaleWeight = histBirdSales.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
        const bLossWeight = histWeightLoss.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);

        const finalBirds = bOpBirds + bPurchBirds - bSaleBirds - bMortBirds;
        const saleAvg = bSaleBirds > 0 ? bSaleWeight / bSaleBirds : 0;
        const mortWeight = bMortBirds * saleAvg;
        const finalWeight = bOpWeight + bPurchWeight - bSaleWeight - mortWeight - bLossWeight;

        return { birds: finalBirds, weight: finalWeight };
    };

    // Try basic scenarios
    const scenarios = [
        { name: "A: Op=Yes, Trips=Yes", includeOp: true, includeTrips: true },
        { name: "B: Op=No, Trips=Yes", includeOp: false, includeTrips: true },
        { name: "C: Op=Yes, Trips=No", includeOp: true, includeTrips: false },
        { name: "D: Op=No, Trips=No", includeOp: false, includeTrips: false }
    ];

    for (const sc of scenarios) {
        const res = runCalc(sc.includeOp, sc.includeTrips);
        console.log(`Scenario ${sc.name} -> Birds: ${res.birds}, Weight: ${res.weight.toFixed(2)}`);
    }

    // Try excluding one trip stock at a time
    console.log("\n--- EXCLUDING INDIVIDUAL TRIPS ---");
    for (let i = 0; i < tripStocks.length; i++) {
        const res = runCalc(false, true, [tripStocks[i]._id.toString()]);
        console.log(`Excluding Trip [${i}] (Birds: ${tripStocks[i].birds}, Wt: ${tripStocks[i].weight}, Date: ${toLocalDateStr(tripStocks[i].date)}) -> Birds: ${res.birds}, Weight: ${res.weight.toFixed(2)}`);
    }

    // Try combinations of excluding trips
    console.log("\n--- EXCLUDING SUBSETS OF TRIPS ---");
    // Since there are 8 trips, we can try all subsets of trips (2^8 = 256 combinations)
    const n = tripStocks.length;
    for (let mask = 0; mask < (1 << n); mask++) {
        const excludeIds = [];
        for (let i = 0; i < n; i++) {
            if ((mask & (1 << i)) !== 0) {
                excludeIds.push(tripStocks[i]._id.toString());
            }
        }
        // Scenario A
        const resA = runCalc(true, true, excludeIds);
        if (resA.birds === 361 || Math.abs(resA.weight - (-787.03)) < 0.1) {
            console.log(`MATCH Scenario A with mask ${mask} (excl ${excludeIds.length} trips) -> Birds: ${resA.birds}, Weight: ${resA.weight.toFixed(2)}`);
        }
        // Scenario B
        const resB = runCalc(false, true, excludeIds);
        if (resB.birds === 361 || Math.abs(resB.weight - (-787.03)) < 0.1) {
            console.log(`MATCH Scenario B with mask ${mask} (excl ${excludeIds.length} trips) -> Birds: ${resB.birds}, Weight: ${resB.weight.toFixed(2)}`);
        }
    }

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
