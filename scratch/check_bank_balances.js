import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: path.join(__dirname, '../src/.env') });

const uri = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME || 'poultryRecordDBQA';

console.log('Connecting to database:', dbName);

// Define schemas to prevent compilation errors
const ledgerSchema = new mongoose.Schema({}, { strict: false });
const voucherSchema = new mongoose.Schema({}, { strict: false });
const tripSchema = new mongoose.Schema({}, { strict: false });

const Ledger = mongoose.model('Ledger', ledgerSchema);
const Voucher = mongoose.model('Voucher', voucherSchema);
const Trip = mongoose.model('Trip', tripSchema);

async function run() {
    try {
        await mongoose.connect(uri, { dbName });
        console.log('Connected successfully!');

        // Find Axis and ICICI Bank ledgers
        const ledgers = await Ledger.find({
            name: { $in: [/axis/i, /icici/i] }
        }).lean();

        console.log('\n--- BANK LEDGERS IN DB ---');
        for (const l of ledgers) {
            console.log({
                id: l._id,
                name: l.name,
                openingBalance: l.openingBalance,
                openingBalanceType: l.openingBalanceType,
                outstandingBalance: l.outstandingBalance,
                outstandingBalanceType: l.outstandingBalanceType
            });

            // Find vouchers where ledger is account or in parties
            const paymentVouchers = await Voucher.find({
                isActive: true,
                $or: [
                    { account: l._id },
                    { 'parties.partyId': l._id }
                ]
            }).lean();

            console.log(`\n  Vouchers for ${l.name}: ${paymentVouchers.length}`);
            paymentVouchers.forEach(v => {
                console.log(`    - Voucher ${v.voucherNumber} (${v.voucherType}) Date: ${v.date?.toISOString().split('T')[0]}`);
                if (v.account && v.account.toString() === l._id.toString()) {
                    console.log(`      Header Account Match. Parties amount sum:`, v.parties?.reduce((sum, p) => sum + (p.amount || 0), 0));
                }
                v.parties?.forEach(p => {
                    if (p.partyId && p.partyId.toString() === l._id.toString()) {
                        console.log(`      Party Match: amount ${p.amount}`);
                    }
                });
            });

            // Journal / Contra entries with exact name match
            const journalVouchers = await Voucher.find({
                isActive: true,
                voucherType: { $in: ['Journal', 'Contra'] },
                'entries.account': new RegExp(l.name.trim(), 'i')
            }).lean();

            console.log(`  Journal/Contra Vouchers for ${l.name}: ${journalVouchers.length}`);
            journalVouchers.forEach(v => {
                console.log(`    - Voucher ${v.voucherNumber} (${v.voucherType}) Date: ${v.date?.toISOString().split('T')[0]}`);
                v.entries?.forEach(e => {
                    if (e.account && e.account.toString().toLowerCase().includes(l.name.toLowerCase().trim())) {
                        console.log(`      Entry: Debit=${e.debitAmount}, Credit=${e.creditAmount}`);
                    }
                });
            });

            // Trip sales using this ledger
            const trips = await Trip.find({
                $or: [
                    { 'sales.cashLedger': l._id },
                    { 'sales.onlineLedger': l._id }
                ]
            }).lean();

            console.log(`  Trips with sales using ${l.name}: ${trips.length}`);
            trips.forEach(t => {
                console.log(`    - Trip ${t.tripId} (${t.status})`);
                t.sales?.forEach(s => {
                    if (s.cashLedger && s.cashLedger.toString() === l._id.toString()) {
                        console.log(`      Sale cashPaid: ${s.cashPaid}`);
                    }
                    if (s.onlineLedger && s.onlineLedger.toString() === l._id.toString()) {
                        console.log(`      Sale onlinePaid: ${s.onlinePaid}`);
                    }
                });
            });
            console.log('------------------------------------');
        }

    } catch (err) {
        console.error('Error running script:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
