import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, "../.env") });

import Voucher from "../models/Voucher.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import Ledger from "../models/Ledger.js";
import DieselStation from "../models/DieselStation.js";

async function run() {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.DATABASE_URI, {
        dbName: process.env.DATABASE_NAME
    });
    console.log("Connected to MongoDB.");

    // Query for Receipt Vouchers missing party name or party ID
    const vouchersToUpdate = await Voucher.find({
        isActive: true,
        voucherType: 'Receipt',
        $or: [
            { partyName: { $exists: false } },
            { partyName: null },
            { partyName: "" },
            { partyName: "undefined" },
            { party: { $exists: false } },
            { party: null }
        ]
    });

    console.log(`Found ${vouchersToUpdate.length} legacy Receipt Vouchers to update.`);

    for (const v of vouchersToUpdate) {
        console.log(`Processing Voucher #${v.voucherNumber} (ID: ${v._id}):`);
        
        // Find a party from the parties list
        const mainParty = v.parties && v.parties[0];
        if (!mainParty) {
            console.log(`  - No parties found in Voucher #${v.voucherNumber}. Skipping.`);
            continue;
        }

        const partyId = mainParty.partyId;
        const partyType = mainParty.partyType || 'customer';

        console.log(`  - Found party in parties list: partyId=${partyId}, partyType=${partyType}`);

        let resolvedPartyName = null;
        let resolvedPartyId = null;

        try {
            if (partyType === 'customer') {
                const customer = await Customer.findById(partyId);
                if (customer) {
                    resolvedPartyId = customer._id;
                    resolvedPartyName = customer.shopName || customer.ownerName || 'Customer';
                }
            } else if (partyType === 'vendor') {
                const vendor = await Vendor.findById(partyId);
                if (vendor) {
                    resolvedPartyId = vendor._id;
                    resolvedPartyName = vendor.vendorName || 'Vendor';
                }
            } else if (partyType === 'ledger') {
                const ledger = await Ledger.findById(partyId);
                if (ledger) {
                    resolvedPartyId = ledger._id;
                    resolvedPartyName = ledger.name || 'Ledger';
                }
            } else if (partyType === 'dieselStation') {
                const station = await DieselStation.findById(partyId);
                if (station) {
                    resolvedPartyId = station._id;
                    resolvedPartyName = station.name || 'Diesel Station';
                }
            }
        } catch (error) {
            console.error(`  - Error resolving party ${partyId}:`, error);
        }

        if (resolvedPartyId && resolvedPartyName) {
            console.log(`  - Setting party to ${resolvedPartyId} and partyName to "${resolvedPartyName}"`);
            
            // Bypass pre-save validation or schema hooks if necessary by doing findOneAndUpdate or normal save
            // Normal save is preferred since Mongoose model has pre('save') to update entries & validate
            v.party = resolvedPartyId;
            v.partyName = resolvedPartyName;
            
            await v.save();
            console.log(`  - Voucher #${v.voucherNumber} updated successfully.`);
        } else {
            console.log(`  - Could not resolve party details for partyId=${partyId}. Skipping.`);
        }
    }

    console.log("Migration complete.");
    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
