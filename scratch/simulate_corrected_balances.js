import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../src/.env') });

const uri = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME || 'poultryRecordDBQA';

const toSignedValue = (amount, type) => {
    return type === 'credit' ? -amount : amount;
};

async function run() {
    try {
        await mongoose.connect(uri, { dbName });
        console.log('Connected to DB!');

        const Ledger = mongoose.model('Ledger', new mongoose.Schema({}, { strict: false }));
        const Voucher = mongoose.model('Voucher', new mongoose.Schema({}, { strict: false }));
        const Trip = mongoose.model('Trip', new mongoose.Schema({}, { strict: false }));

        const asOnDate = '2026-06-06';
        const dateLimit = new Date(asOnDate);
        dateLimit.setHours(23, 59, 59, 999);

        console.log(`\nSimulating balances as on ${asOnDate} (limit: ${dateLimit.toISOString()})`);

        const allVouchers = await Voucher.find({ isActive: true, date: { $lte: dateLimit } }).lean();
        const allTrips = await Trip.find({ createdAt: { $lte: dateLimit } }).lean();

        const ledgers = await Ledger.find({ name: { $in: ['AXIS BANK', 'ICICI BANK'] } }).lean();

        for (const l of ledgers) {
            console.log(`\nLedger: ${l.name}`);
            const openingSigned = toSignedValue(l.openingBalance || 0, l.openingBalanceType || 'debit');
            console.log(`  Opening balance: ${l.openingBalance} (${l.openingBalanceType}), signed: ${openingSigned}`);

            let debitTotal = 0;
            let creditTotal = 0;

            // 1. Process Vouchers with new logic
            allVouchers.forEach(v => {
                if (v.voucherType === 'Payment' || v.voucherType === 'Receipt') {
                    if (v.account && v.account.toString() === l._id.toString()) {
                        const amount = v.parties ? v.parties.reduce((sum, p) => sum + (p.amount || 0), 0) : 0;
                        if (v.voucherType === 'Payment') {
                            creditTotal += amount;
                        } else {
                            debitTotal += amount;
                        }
                    }
                    v.parties?.forEach(p => {
                        if (p.partyId && p.partyId.toString() === l._id.toString()) {
                            if (v.voucherType === 'Payment') {
                                debitTotal += p.amount || 0;
                            } else {
                                creditTotal += p.amount || 0;
                            }
                        }
                    });
                } else {
                    v.entries?.forEach(e => {
                        if (e.account && e.account.toString().toLowerCase().includes(l.name.toLowerCase().trim())) {
                            debitTotal += e.debitAmount || 0;
                            creditTotal += e.creditAmount || 0;
                        }
                    });
                }
            });

            // 2. Process Trips
            allTrips.forEach(t => {
                t.sales?.forEach(s => {
                    if (s.cashLedger && s.cashLedger.toString() === l._id.toString()) {
                        debitTotal += s.cashPaid || 0;
                    }
                    if (s.onlineLedger && s.onlineLedger.toString() === l._id.toString()) {
                        debitTotal += s.onlinePaid || 0;
                    }
                });
            });

            const finalBalance = openingSigned + debitTotal - creditTotal;
            const finalType = finalBalance >= 0 ? 'debit' : 'credit';
            console.log(`  Calculated Debit: ${debitTotal}, Credit: ${creditTotal}`);
            console.log(`  Calculated Balance: ${Math.abs(finalBalance)} (${finalType})`);
            console.log(`  DB Ledger OutstandingBalance: ${l.outstandingBalance} (${l.outstandingBalanceType})`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
