import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Group from './models/Group.js';

dotenv.config({ path: './src/.env' });

async function checkGroups() {
    try {
        await mongoose.connect(process.env.DATABASE_URI, {
            dbName: process.env.DATABASE_NAME
        });

        const groups = await Group.find({ isActive: true }).lean();
        console.log("=== GROUPS IN DB ===");
        groups.forEach(g => {
            console.log(`Group Name: "${g.name}", Slug: "${g.slug}", Type: "${g.type}", Parent: ${g.parentGroup}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkGroups();
