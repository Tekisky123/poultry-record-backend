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

    const targetDate = "2026-05-27";
    const prevDateStr = "2026-05-26";
    const birdAnchorDate = "2026-01-01";

    const allUsers = await User.find({}).lean();
    console.log(`Found ${allUsers.length} total users in DB.`);

    const baseBirdOpsList = await InventoryStock.find({ inventoryType: 'bird', type: 'opening' }).lean();
    const sortedBirdOpsAll = [...baseBirdOpsList].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstBirdOp = sortedBirdOpsAll.find(s => toLocalDateStr(s.date) <= prevDateStr);
    const histBirdOp = firstBirdOp ? [firstBirdOp] : [];

    for (const u of allUsers) {
        // Find InventoryStock records for this user (acting as supervisor)
        const inventoryStocks = await InventoryStock.find({
            inventoryType: 'bird',
            supervisorId: u._id,
            date: {
                $gte: new Date(birdAnchorDate),
                $lte: (() => {
                    const end = new Date(prevDateStr);
                    end.setHours(23, 59, 59, 999);
                    return end;
                })()
            }
        }).lean();

        // Find Trip records for this user (acting as supervisor)
        const trips = await Trip.find({
            supervisor: u._id,
            stocks: { $exists: true, $not: { $size: 0 } }
        }).lean();

        let tripStocks = trips.flatMap(trip => {
            return trip.stocks.map(s => ({
                type: 'purchase',
                birds: s.birds,
                weight: s.weight,
                amount: s.value,
                date: s.addedAt
            }));
        });

        tripStocks = tripStocks.filter(s => new Date(s.date) >= new Date(birdAnchorDate) && new Date(s.date) <= (() => {
            const end = new Date(prevDateStr);
            end.setHours(23, 59, 59, 999);
            return end;
        })());

        const rawHistBirds = [...inventoryStocks, ...tripStocks].filter(s => toLocalDateStr(s.date) <= prevDateStr);

        if (rawHistBirds.length === 0 && u.role !== 'supervisor') continue;

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

        const bOpAmount = histBirdOp.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
        const bPurchAmount = histBirdPurch.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

        // Calculate both with and without the base opening stock (since opening stock supervisorId is superadmin Tauhid)
        // Scenario A: Include base opening stock
        const birdsA = bOpBirds + bPurchBirds - bSaleBirds - bMortBirds;
        const saleAvgA = bSaleBirds > 0 ? bSaleWeight / bSaleBirds : 0;
        const mortWeightA = bMortBirds * saleAvgA;
        const weightA = bOpWeight + bPurchWeight - bSaleWeight - mortWeightA - bLossWeight;

        // Scenario B: Exclude base opening stock
        const birdsB = bPurchBirds - bSaleBirds - bMortBirds;
        const saleAvgB = bSaleBirds > 0 ? bSaleWeight / bSaleBirds : 0;
        const mortWeightB = bMortBirds * saleAvgB;
        const weightB = bPurchWeight - bSaleWeight - mortWeightB - bLossWeight;

        console.log(`\nUser: ${u.name} (ID: ${u._id}, Role: ${u.role})`);
        console.log(`  Tx count: ${rawHistBirds.length} (Purch: ${histBirdPurch.length}, Sale: ${histBirdSales.length}, Mort: ${histBirdMort.length}, Loss: ${histWeightLoss.length})`);
        console.log(`  Scenario A (With DB Op Stock) -> Birds: ${birdsA}, Weight: ${weightA.toFixed(2)}`);
        console.log(`  Scenario B (Without DB Op Stock) -> Birds: ${birdsB}, Weight: ${weightB.toFixed(2)}`);
    }

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
