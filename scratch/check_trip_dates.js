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

        const Trip = mongoose.model('Trip', new mongoose.Schema({}, { strict: false }));
        
        const trips = await Trip.find({ tripId: { $in: ['TRP-0005', 'TRP-0006'] } }).lean();
        
        trips.forEach(t => {
            console.log(`Trip ${t.tripId}:`);
            console.log('  Date field:', t.date);
            console.log('  CreatedAt field:', t.createdAt);
            console.log('  UpdatedAt field:', t.updatedAt);
            t.sales?.forEach(s => {
                console.log(`    Sale: birds=${s.birds}, weight=${s.weight}, onlinePaid=${s.onlinePaid}, cashPaid=${s.cashPaid}`);
            });
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
