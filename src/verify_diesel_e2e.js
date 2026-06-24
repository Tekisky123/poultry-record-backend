import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

import Voucher from "./models/Voucher.js";
import DieselStation from "./models/DieselStation.js";
import Trip from "./models/Trip.js";

async function run() {
    await mongoose.connect(process.env.DATABASE_URI, { dbName: process.env.DATABASE_NAME });
    console.log("Connected to MongoDB.\n");

    const stations = await DieselStation.find({ isActive: true }).lean();

    for (const station of stations) {
        const id = station._id.toString();
        console.log(`\n===== STATION: "${station.name}" (${id}) =====`);

        // Simulate EXACTLY what the controller does
        const trips = await Trip.find({
            "diesel.stations": {
                $elemMatch: {
                    $or: [
                        { dieselStation: id },
                        { stationName: station.name }
                    ]
                }
            }
        })
        .select("tripId date diesel.stations")
        .sort({ date: -1 });

        console.log(`  Matching Trips: ${trips.length}`);

        const vouchers = await Voucher.find({
            isActive: true,
            $or: [
                { "parties.partyId": id },
                { "entries.account": station.name }
            ]
        }).lean();

        console.log(`  Matching Vouchers: ${vouchers.length}`);
        for (const v of vouchers) {
            const partyData = v.parties?.find(p => p.partyId && p.partyId.toString() === id);
            let particulars = `Payment Voucher #${v.voucherNumber}`;

            if (partyData) {
                console.log(`    → Voucher #${v.voucherNumber} (${v.voucherType}): partyData.amount=${partyData.amount}`);
                console.log(`      Particulars: "${particulars}" ✅`);
            } else if (v.voucherType === 'Journal') {
                const entry = v.entries?.find(e => e.account === station.name);
                if (entry) {
                    console.log(`    → Voucher #${v.voucherNumber} (Journal): Dr=${entry.debitAmount}, Cr=${entry.creditAmount}`);
                    console.log(`      Particulars: "Journal Voucher #${v.voucherNumber}" ✅`);
                }
            } else {
                console.log(`    → Voucher #${v.voucherNumber} (${v.voucherType}): No matching party found ⚠️`);
            }
        }
    }

    await mongoose.disconnect();
    console.log("\nDone.");
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
