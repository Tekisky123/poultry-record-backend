import mongoose from 'mongoose';
import dotenv from 'dotenv';
import InventoryStock from '../src/models/InventoryStock.js';
import Customer from '../src/models/Customer.js';

dotenv.config({ path: './src/.env' });

const mongoURI = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME || 'poultryRecordDB';

mongoose.connect(`${mongoURI}/${dbName}`)
  .then(async () => {
    console.log(`Connected to ${dbName}`);
    
    const sales = await InventoryStock.find({ type: 'sale' }).populate('customerId').lean();
    console.log(`Total Sales in DB: ${sales.length}`);
    sales.forEach((s, idx) => {
      console.log(`${idx+1}: ID: ${s._id}, Date: ${s.date}, Bill: ${s.billNumber}, Cust: ${s.customerId?.shopName || s.customerId?.ownerName || s.customerId}, birds: ${s.birds}, weight: ${s.weight}, amount: ${s.amount}`);
    });

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
