import mongoose from 'mongoose';
import dotenv from 'dotenv';

import '../src/models/Vendor.js';
import '../src/models/Customer.js';
import '../src/models/Vehicle.js';
import '../src/models/User.js';
import '../src/models/Trip.js';
import Trip from '../src/models/Trip.js';

dotenv.config({ path: './src/.env' });

const mongoURI = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME || 'poultryRecordDB';

mongoose.connect(`${mongoURI}/${dbName}`)
  .then(async () => {
    console.log(`Connected to ${dbName}`);
    
    const start = new Date("2026-05-27T00:00:00.000Z");
    const end = new Date("2026-05-27T23:59:59.999Z");
    
    const trips = await Trip.find({
        date: { $gte: start, $lte: end }
    }).populate('supervisor').populate('vehicle').lean();

    console.log(`Total Trips on 2026-05-27: ${trips.length}`);
    trips.forEach((t, idx) => {
      console.log(`${idx+1}: ID: ${t._id}, tripId: ${t.tripId}, date: ${t.date}, supervisor: ${t.supervisor?.name}, vehicle: ${t.vehicle?.vehicleNumber}`);
      console.log(`  stocks count: ${t.stocks?.length || 0}`);
      console.log(`  sales count: ${t.sales?.length || 0}`);
      if (t.sales) {
        t.sales.forEach((s, sIdx) => {
          console.log(`    Sale ${sIdx+1}: Bill: ${s.billNumber}, birds: ${s.birds}, weight: ${s.weight}, amount: ${s.amount}`);
        });
      }
    });

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
