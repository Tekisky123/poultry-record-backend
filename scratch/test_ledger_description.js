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

        // Import all models to ensure schemas compile properly
        await import('../src/models/Vehicle.js');
        await import('../src/models/User.js');

        // Import the controller dynamically
        const { getLedgerTransactions } = await import('../src/controllers/ledger.controller.js');

        // Mock req, res, next
        const req = {
            params: {
                id: '69fcba52ec642cc06df5dfc8' // ICICI BANK ledger ID
            },
            query: {
                startDate: '2026-06-01',
                endDate: '2026-06-30'
            }
        };

        let responseStatus = null;
        let responseData = null;

        const res = {
            status: function(code) {
                responseStatus = code;
                return this;
            },
            json: function(data) {
                responseData = data;
                return this;
            }
        };

        const next = (err) => {
            if (err) {
                console.error('Next called with error:', err);
            }
        };

        await getLedgerTransactions(req, res, next);

        if (responseData && responseData.success) {
            console.log('\n--- Ledger Transactions for ICICI BANK ---');
            console.log('Ledger Name:', responseData.data.ledger?.name);
            console.log('Opening Balance:', responseData.data.openingBalance, responseData.data.openingBalanceType);
            console.log('Closing Balance:', responseData.data.closingBalance, responseData.data.closingBalanceType);
            
            console.log('\nTransactions List:');
            responseData.data.transactions.forEach(t => {
                console.log(`- Date: ${new Date(t.date).toLocaleDateString()} | Particular: ${t.description} | Type: ${t.type} | Ref: ${t.refNo} | Debit: ${t.debit} | Credit: ${t.credit} | Balance: ${t.runningBalance} ${t.runningBalanceType}`);
            });
        } else {
            console.error('Failed response:', responseData);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
