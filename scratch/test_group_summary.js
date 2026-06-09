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

        // Dynamic import the controller/models first to let them compile schemas naturally
        const { getGroupSummary } = await import('../src/controllers/group.controller.js');
        const { default: Group } = await import('../src/models/Group.js');

        const bankAccountsGroup = await Group.findOne({ name: /bank accounts/i, isActive: true }).lean();
        
        if (!bankAccountsGroup) {
            console.error('Bank Accounts group not found');
            return;
        }

        console.log(`Found group: ${bankAccountsGroup.name} (id: ${bankAccountsGroup._id})`);

        // Mock req, res, next
        const req = {
            params: {
                id: bankAccountsGroup._id.toString()
            },
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

        await getGroupSummary(req, res, next);

        if (responseData && responseData.success) {
            console.log('\n--- Group Summary Results ---');
            console.log('Group Name:', responseData.data.group?.name);
            console.log('Date Range:', responseData.data.dateRange);
            console.log('Totals Debit:', responseData.data.totals?.debit);
            console.log('Totals Credit:', responseData.data.totals?.credit);
            
            console.log('\nEntries:');
            responseData.data.entries.forEach(e => {
                console.log(`- ${e.name} (${e.type}): debit=${e.debit}, credit=${e.credit}, closingBalance=${e.closingBalance}`);
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
