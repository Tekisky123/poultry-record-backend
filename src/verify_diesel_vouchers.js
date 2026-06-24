import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

import Voucher from "./models/Voucher.js";
import DieselStation from "./models/DieselStation.js";

async function run() {
    await mongoose.connect(process.env.DATABASE_URI, { dbName: process.env.DATABASE_NAME });
    console.log("Connected to MongoDB.\n");

    // Step 1: List all active diesel stations
    const stations = await DieselStation.find({ isActive: true }).lean();
    console.log(`=== DIESEL STATIONS (${stations.length}) ===`);
    for (const s of stations) {
        console.log(`  ID: ${s._id}  Name: "${s.name}"  outstandingBalance: ${s.outstandingBalance} ${s.outstandingBalanceType}`);
    }

    // Step 2: Find Payment Vouchers that reference any diesel station in parties
    const stationIds = stations.map(s => s._id.toString());
    const paymentVouchers = await Voucher.find({
        isActive: true,
        voucherType: 'Payment',
        'parties.partyType': 'dieselStation'
    }).lean();

    console.log(`\n=== PAYMENT VOUCHERS for DIESEL STATIONS (${paymentVouchers.length}) ===`);
    for (const v of paymentVouchers) {
        const dieselParties = v.parties.filter(p => p.partyType === 'dieselStation');
        console.log(`  Voucher #${v.voucherNumber}  date=${new Date(v.date).toLocaleDateString('en-GB')}  partyName="${v.partyName}"  party=${v.party}`);
        console.log(`    parties: ${JSON.stringify(dieselParties)}`);
        console.log(`    entries: ${JSON.stringify(v.entries?.map(e => ({ account: e.account, Dr: e.debitAmount, Cr: e.creditAmount })))}`);
        console.log(`    narration: ${v.narration}`);
        // Verify voucherNumber is a real number
        console.log(`    voucherNumber type: ${typeof v.voucherNumber}, value: ${v.voucherNumber}`);
        const particulars = `Payment Voucher #${v.voucherNumber}`;
        console.log(`    → Particulars would render as: "${particulars}"`);
    }

    // Step 3: Find all Payment vouchers that have any party and check if dieselStation ones are covered
    console.log("\n=== ALL PAYMENT VOUCHERS (parties breakdown) ===");
    const allPayments = await Voucher.find({ isActive: true, voucherType: 'Payment' }).lean();
    for (const v of allPayments) {
        const partyTypes = v.parties?.map(p => p.partyType).join(', ') || 'none';
        console.log(`  Voucher #${v.voucherNumber}  partyTypes=[${partyTypes}]  partyName="${v.partyName}"`);
    }

    await mongoose.disconnect();
    console.log("\nDone.");
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
