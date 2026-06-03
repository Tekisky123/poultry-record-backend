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

    console.log("=== GLOBAL STOCK CALCULATION ===");

    // 1. Fetch opening stocks
    const baseBirdOpsList = await InventoryStock.find({ inventoryType: 'bird', type: 'opening' }).lean();
    console.log(`Found ${baseBirdOpsList.length} total opening stocks in DB.`);
    baseBirdOpsList.forEach(op => {
        console.log(`- Opening Stock: Birds=${op.birds}, Weight=${op.weight}, Date=${toLocalDateStr(op.date)}, supervisorId=${op.supervisorId}`);
    });

    // 2. Fetch inventory stocks in range
    let query = {
        inventoryType: 'bird',
        date: {
            $gte: new Date(birdAnchorDate),
            $lte: (() => {
                const end = new Date(prevDateStr);
                end.setHours(23, 59, 59, 999);
                return end;
            })()
        }
    };

    const inventoryStocks = await InventoryStock.find(query)
        .populate("vendorId", "vendorName companyName name")
        .populate("customerId", "shopName ownerName")
        .populate("vehicleId", "vehicleNumber")
        .populate("supervisorId", "name")
        .lean();

    console.log(`Fetched ${inventoryStocks.length} inventory stocks in date range.`);

    // 3. Fetch trips
    const trips = await Trip.find({
        stocks: { $exists: true, $not: { $size: 0 } }
    })
        .select('tripId stocks supervisor vehicle purchases type')
        .populate('supervisor', 'name')
        .populate('vehicle', 'vehicleNumber')
        .populate('purchases.supplier', 'vendorName name companyName')
        .lean();

    let tripStocks = trips.flatMap(trip => {
        let supplierName = '';
        if (trip.purchases && trip.purchases.length > 0) {
            const firstPurchase = trip.purchases[0];
            if (trip.type === 'transferred' && firstPurchase.vendorName) {
                supplierName = firstPurchase.vendorName;
            } else if (firstPurchase.supplier) {
                supplierName = firstPurchase.supplier.vendorName || firstPurchase.supplier.companyName || firstPurchase.supplier.name || '';
            }
        }
        if (!supplierName) {
            supplierName = "Trip-Stock (" + (trip.vehicle?.vehicleNumber || 'Unassigned') + ")";
        }

        return trip.stocks.map(s => ({
            _id: s._id,
            source: 'trip',
            tripId: trip._id,
            tripIdDisplay: trip.tripId,
            inventoryType: 'bird',
            type: 'purchase',
            birds: s.birds,
            weight: s.weight,
            avgWeight: s.avgWeight,
            rate: s.rate,
            amount: s.value,
            date: s.addedAt,
            supervisorId: trip.supervisor,
            vehicleId: trip.vehicle,
            vendorId: { vendorName: supplierName },
            notes: s.notes
        }));
    });

    tripStocks = tripStocks.filter(s => new Date(s.date) >= new Date(birdAnchorDate));
    tripStocks = tripStocks.filter(s => new Date(s.date) <= (() => {
        const end = new Date(prevDateStr);
        end.setHours(23, 59, 59, 999);
        return end;
    })());

    console.log(`Fetched ${tripStocks.length} trip stocks in date range.`);

    // Combined
    const rawHistBirds = [...inventoryStocks, ...tripStocks].filter(s => toLocalDateStr(s.date) <= prevDateStr);
    console.log(`Combined historical bird entries: ${rawHistBirds.length}`);

    // Calculation
    const sortedBirdOpsAll = [...baseBirdOpsList].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstBirdOp = sortedBirdOpsAll.find(s => toLocalDateStr(s.date) <= prevDateStr);
    const histBirdOp = firstBirdOp ? [firstBirdOp] : [];

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

    const finalBirds = bOpBirds + bPurchBirds - bSaleBirds - bMortBirds;
    const historicalSaleAvg = bSaleBirds > 0 ? bSaleWeight / bSaleBirds : 0;
    const bMortWeightComputed = bMortBirds * historicalSaleAvg;
    const finalWeight = bOpWeight + bPurchWeight - bSaleWeight - bMortWeightComputed - bLossWeight;

    const totalInputWeight = bOpWeight + bPurchWeight;
    const totalInputAmount = bOpAmount + bPurchAmount;
    const avgRate = totalInputWeight > 0 ? totalInputAmount / totalInputWeight : 0;
    const finalAmount = finalWeight * avgRate;

    console.log("\n--- GLOBAL CALCULATION RESULT ---");
    console.log(`Base Op Birds: ${bOpBirds}, Weight: ${bOpWeight}`);
    console.log(`Purchases Birds: ${bPurchBirds}, Weight: ${bPurchWeight}`);
    console.log(`Sales Birds: ${bSaleBirds}, Weight: ${bSaleWeight}`);
    console.log(`Mortality Birds: ${bMortBirds}, Computed Weight: ${bMortWeightComputed}`);
    console.log(`Weight Loss: ${bLossWeight}`);
    console.log(`\nRESULTING OP STOCK for ${targetDate}:`);
    console.log(`Birds: ${finalBirds}`);
    console.log(`Weight: ${finalWeight.toFixed(2)}`);
    console.log(`Amount: ${finalAmount.toFixed(2)}`);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
