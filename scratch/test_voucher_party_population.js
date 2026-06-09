import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../src/.env') });

const uri = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME || 'poultryRecordDBQA';

async function run() {
    try {
        await mongoose.connect(uri, { dbName });
        console.log('Connected to DB!');

        const Voucher = mongoose.model('Voucher', new mongoose.Schema({}, { strict: false }));
        const Customer = mongoose.model('Customer', new mongoose.Schema({}, { strict: false }));
        const Vendor = mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }));
        const Ledger = mongoose.model('Ledger', new mongoose.Schema({}, { strict: false }));

        const vouchers = await Voucher.find({ voucherNumber: { $in: [7, 8] } }).lean();

        console.log(`Found ${vouchers.length} vouchers.`);

        for (const v of vouchers) {
            console.log(`\nOriginal Voucher ${v.voucherNumber} (${v.voucherType}):`);
            console.log('  Parties:', JSON.stringify(v.parties, null, 2));

            if (v.parties && v.parties.length > 0) {
                for (const p of v.parties) {
                    if (p.partyId && p.partyType) {
                        let name = 'Unknown Party';
                        if (p.partyType === 'customer') {
                            const c = await Customer.findById(p.partyId).lean();
                            name = c ? (c.shopName || c.ownerName) : 'Customer';
                        } else if (p.partyType === 'vendor') {
                            const ven = await Vendor.findById(p.partyId).lean();
                            name = ven ? (ven.vendorName || ven.companyName) : 'Vendor';
                        } else if (p.partyType === 'ledger') {
                            const l = await Ledger.findById(p.partyId).lean();
                            name = l ? l.name : 'Ledger';
                        }
                        console.log(`  Resolved name for party ${p.partyId} (${p.partyType}): ${name}`);
                    }
                }
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
