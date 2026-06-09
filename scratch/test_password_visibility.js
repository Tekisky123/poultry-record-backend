import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../src/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../src/.env') });

const uri = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME || 'poultryRecordDBQA';

async function run() {
    try {
        await mongoose.connect(uri, { dbName });
        console.log('Connected to DB!');

        // 1. Create a temporary user with a password
        const email = `temp_test_user_${Date.now()}@example.com`;
        const mobileNumber = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;

        console.log(`Creating temporary user with email: ${email}`);
        const user = new User({
            name: 'Temp Test User',
            email: email,
            mobileNumber: mobileNumber,
            password: 'Password123',
            plainTextPassword: 'Password123',
            role: 'supervisor',
            approvalStatus: 'approved'
        });

        const savedUser = await user.save();
        console.log('User saved successfully.');

        // 2. Fetch without explicitly selecting plainTextPassword
        console.log('\n--- Fetching user normally (select by default) ---');
        const normalFetch = await User.findById(savedUser._id);
        console.log('normalFetch.plainTextPassword:', normalFetch.plainTextPassword);
        if (normalFetch.plainTextPassword === undefined) {
            console.log('PASS: plainTextPassword was excluded by default.');
        } else {
            console.error('FAIL: plainTextPassword was returned by default!');
        }

        // 3. Fetch with explicitly selecting plainTextPassword
        console.log('\n--- Fetching user with select("+plainTextPassword") ---');
        const superadminFetch = await User.findById(savedUser._id).select('+plainTextPassword');
        console.log('superadminFetch.plainTextPassword:', superadminFetch.plainTextPassword);
        if (superadminFetch.plainTextPassword === 'Password123') {
            console.log('PASS: plainTextPassword was successfully retrieved.');
        } else {
            console.error('FAIL: plainTextPassword was not retrieved!');
        }

        // 4. Cleanup
        console.log('\nCleaning up temporary user...');
        await User.findByIdAndDelete(savedUser._id);
        console.log('Cleanup complete.');

    } catch (err) {
        console.error('An error occurred during verification:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
