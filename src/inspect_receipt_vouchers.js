import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, ".env") });

import Voucher from "./models/Voucher.js";
import Customer from "./models/Customer.js";

async function run() {
    await mongoose.connect(process.env.DATABASE_URI, {
        dbName: process.env.DATABASE_NAME
    });

    console.log("Database connected successfully.");

    // Query all Vouchers
    const allVouchers = await Voucher.find({ isActive: true }).lean();
    console.log(`Found ${allVouchers.length} active Vouchers:`);

    let withMissingPartyName = 0;
    for (const v of allVouchers) {
        if (!v.partyName || v.partyName === "N/A" || v.partyName.trim() === "") {
            withMissingPartyName++;
            console.log(`- Voucher #${v.voucherNumber} (${v.voucherType}): date=${v.date.toISOString().split('T')[0]}, party=${v.party}, partyName="${v.partyName}", parties=${JSON.stringify(v.parties)}`);
        }
    }
    console.log(`Total active Vouchers with missing/empty partyName: ${withMissingPartyName}`);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
