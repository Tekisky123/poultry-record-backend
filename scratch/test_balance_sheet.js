import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load our actual controller functions or simulate the environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../src/.env') });

const uri = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME || 'poultryRecordDBQA';

async function run() {
    try {
        await mongoose.connect(uri, { dbName });
        console.log('Connected to DB!');

        // Import the controller function dynamically
        const { getBalanceSheet } = await import('../src/controllers/balanceSheet.controller.js');

        // Mock req, res, next
        const req = {
            query: {
                asOnDate: '2026-06-06'
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

        await getBalanceSheet(req, res, next);

        if (responseData && responseData.success) {
            console.log('\n--- Balance Sheet Results ---');
            console.log('As On Date:', responseData.data.asOnDate);
            
            // Look for Axis and ICICI Bank balances in Assets
            const assetsGroups = responseData.data.assets.groups;
            
            // Helper to recursively find a group or ledger and log it
            function findBankAccounts(groups) {
                for (const g of groups) {
                    if (g.name.toUpperCase().includes('BANK ACCOUNTS') || g.name.toUpperCase().includes('BANK')) {
                        console.log(`Group: ${g.name}, Balance: ${g.balance}, Opening: ${g.openingBalance}`);
                    }
                    if (g.children && g.children.length > 0) {
                        findBankAccounts(g.children);
                    }
                }
            }

            findBankAccounts(assetsGroups);
            console.log('Total Assets:', responseData.data.totals.totalAssets);
            console.log('Total Liabilities:', responseData.data.totals.totalLiabilities);
            console.log('Capital amount:', responseData.data.capital.amount);
            console.log('Totals Balance (Assets - Liabilities & Capital):', responseData.data.totals.balance);
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
