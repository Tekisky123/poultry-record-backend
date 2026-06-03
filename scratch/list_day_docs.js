import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Import models to register their schemas
import '../src/models/Vendor.js';
import '../src/models/Customer.js';
import '../src/models/Vehicle.js';
import '../src/models/User.js';
import '../src/models/Trip.js';
import InventoryStock from '../src/models/InventoryStock.js';

dotenv.config({ path: './src/.env' });

const mongoURI = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME || 'poultryRecordDB';

mongoose.connect(`${mongoURI}/${dbName}`)
  .then(async () => {
    console.log(`Connected to ${dbName}`);
    
    const start = new Date("2026-05-27T00:00:00.000Z");
    const end = new Date("2026-05-27T23:59:59.999Z");
    
    const stocks = await InventoryStock.find({
        date: { $gte: start, $lte: end }
    }).populate('customerId').populate('vendorId').lean();

    console.log(`Total InventoryStock documents on 2026-05-27: ${stocks.length}`);
    stocks.forEach((s, idx) => {
      console.log(`${idx+1}: ID: ${s._id}, type: ${s.type}, inventoryType: ${s.inventoryType}, Bill: ${s.billNumber}, Cust: ${s.customerId?.shopName || s.customerId?.ownerName || s.customerId}, birds: ${s.birds}, weight: ${s.weight}, amount: ${s.amount}`);
    });

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
