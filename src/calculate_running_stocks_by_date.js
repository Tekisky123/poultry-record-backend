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

    const sulemanId = "68a72bdab852a0d31123cc4b";
    const birdAnchorDate = "2026-01-01";

    // 1. Fetch opening stocks
    const baseBirdOpsList = await InventoryStock.find({ inventoryType: 'bird', type: 'opening' }).lean();
    const sortedBirdOpsAll = [...baseBirdOpsList].sort((a, b) => new Date(a.date) - new Date(b.date));

    // 2. Fetch inventory stocks
    const allInventoryStocks = await InventoryStock.find({ inventoryType: 'bird' }).lean();

    // 3. Fetch trips
    const trips = await Trip.find({
        stocks: { $exists: true, $not: { $size: 0 } }
    }).lean();

    const tripStocks = trips.flatMap(trip => {
        return trip.stocks.map(s => ({
            type: 'purchase',
            birds: s.birds,
            weight: s.weight,
            amount: s.value,
            date: s.addedAt,
            supervisorId: trip.supervisor
        }));
    });

    console.log("=== CALCULATING RUNNING STOCKS BY DATE ===");

    for (let day = 1; day <= 31; day++) {
        const targetDate = `2026-05-${String(day).padStart(2, '0')}`;
        const prevDateStr = (() => {
            const d = new Date(targetDate);
            d.setDate(d.getDate() - 1);
            return toLocalDateStr(d);
        })();

        // Calc for Suleman
        const runCalcForSupervisor = (supId) => {
            const firstBirdOp = sortedBirdOpsAll.find(s => toLocalDateStr(s.date) <= prevDateStr);
            const histBirdOp = firstBirdOp ? [firstBirdOp] : [];

            const rawHistInventory = allInventoryStocks.filter(s => 
                s.supervisorId?.toString() === supId && 
                toLocalDateStr(s.date) >= birdAnchorDate &&
                toLocalDateStr(s.date) <= prevDateStr
            );

            const rawHistTrips = tripStocks.filter(s => 
                s.supervisorId?.toString() === supId && 
                toLocalDateStr(s.date) >= birdAnchorDate &&
                toLocalDateStr(s.date) <= prevDateStr
            );

            const rawHistBirds = [...rawHistInventory, ...rawHistTrips];

            const histBirdPurch = rawHistBirds.filter(s => s.type === 'purchase');
            const histBirdSales = rawHistBirds.filter(s => s.type === 'sale' || s.type === 'receipt');
            const histBirdMort = rawHistBirds.filter(s => s.type === 'mortality');
            const histWeightLoss = rawHistBirds.filter(s => s.type === 'weight_loss' || s.type === 'natural_weight_loss');

            const bOpBirds = histBirdOp.reduce((sum, s) => sum + (Number(s.birds) || 0), 0);
            const bPurchBirds = histBirdPurch.reduce((sum, s) => sum + (Number(s.birds) || 0), 0);
            const bSaleBirds = histBirdSales.reduce((sum, s) => sum + (Number(s.birds) || 0), 0);
            const bMortBirds = histBirdMort.reduce((sum, s) => sum + (Number(s.birds) || 0), 0);

            const bOpWeight = histBirdOp.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
            const bPurchWeight = histBirdPurch.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
            const bSaleWeight = histBirdSales.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
            const bLossWeight = histWeightLoss.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);

            // Calculation
            const finalBirds = bOpBirds + bPurchBirds - bSaleBirds - bMortBirds;
            const saleAvg = bSaleBirds > 0 ? bSaleWeight / bSaleBirds : 0;
            const mortWeight = bMortBirds * saleAvg;
            const finalWeight = bOpWeight + bPurchWeight - bSaleWeight - mortWeight - bLossWeight;

            // Scenario B: Without Opening Stock
            const finalBirdsNoOp = bPurchBirds - bSaleBirds - bMortBirds;
            const finalWeightNoOp = bPurchWeight - bSaleWeight - mortWeight - bLossWeight;

            return { birds: finalBirds, weight: finalWeight, birdsNoOp: finalBirdsNoOp, weightNoOp: finalWeightNoOp };
        };

        const resSuleman = runCalcForSupervisor(sulemanId);
        if (resSuleman.birds === 361 || Math.abs(resSuleman.weight - (-787.03)) < 1 || resSuleman.birdsNoOp === 361 || Math.abs(resSuleman.weightNoOp - (-787.03)) < 1) {
            console.log(`[MATCH] Date: ${targetDate} -> Suleman With Op Stock: Birds=${resSuleman.birds}, Weight=${resSuleman.weight.toFixed(2)} | Without: Birds=${resSuleman.birdsNoOp}, Weight=${resSuleman.weightNoOp.toFixed(2)}`);
        }
    }

    console.log("Calculation done.");
    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
