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

    // Get all supervisors
    const supervisors = await User.find({ role: "supervisor" }).lean();
    console.log(`Found ${supervisors.length} supervisors.`);

    for (const supervisor of supervisors) {
        console.log(`\n==========================================`);
        console.log(`Supervisor: ${supervisor.name} (ID: ${supervisor._id})`);

        let query = { inventoryType: 'bird', supervisorId: supervisor._id };
        query.date = {
            $gte: new Date(birdAnchorDate),
            $lte: (() => {
                const end = new Date(prevDateStr);
                end.setHours(23, 59, 59, 999);
                return end;
            })()
        };

        const inventoryStocks = await InventoryStock.find(query)
            .populate("vendorId", "vendorName companyName name")
            .populate("customerId", "shopName ownerName")
            .populate("vehicleId", "vehicleNumber")
            .populate("supervisorId", "name")
            .lean();

        const trips = await Trip.find({
            supervisor: supervisor._id,
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

        const rawHistBirdsAll = [...inventoryStocks, ...tripStocks];
        const rawHistBirds = rawHistBirdsAll.filter(s => toLocalDateStr(s.date) <= prevDateStr);

        console.log("Historical bird entries for this supervisor:", rawHistBirds.length);

        // Opening stocks (they are usually N/A supervisor, so let's see)
        const baseBirdOpsList = await InventoryStock.find({ inventoryType: 'bird', type: 'opening' }).lean();
        const sortedBirdOpsAll = [...baseBirdOpsList].sort((a, b) => new Date(a.date) - new Date(b.date));
        const firstBirdOp = sortedBirdOpsAll.find(s => toLocalDateStr(s.date) <= prevDateStr);
        
        // Wait, opening stock in DB might not belong to this supervisor. Let's see if we include it or not.
        // In the database, the opening stock has supervisorId = null / N/A.
        // Let's print with opening stock included
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

        const finalBirdsWithOp = bOpBirds + bPurchBirds - bSaleBirds - bMortBirds;
        const historicalSaleAvg = bSaleBirds > 0 ? bSaleWeight / bSaleBirds : 0;
        const bMortWeightComputed = bMortBirds * historicalSaleAvg;
        const finalWeightWithOp = bOpWeight + bPurchWeight - bSaleWeight - bMortWeightComputed - bLossWeight;

        // Also without opening stock
        const finalBirdsWithoutOp = bPurchBirds - bSaleBirds - bMortBirds;
        const finalWeightWithoutOp = bPurchWeight - bSaleWeight - bMortWeightComputed - bLossWeight;

        console.log(`With Opening Stock -> Birds: ${finalBirdsWithOp}, Weight: ${finalWeightWithOp.toFixed(2)}`);
        console.log(`Without Opening Stock -> Birds: ${finalBirdsWithoutOp}, Weight: ${finalWeightWithoutOp.toFixed(2)}`);
    }

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
