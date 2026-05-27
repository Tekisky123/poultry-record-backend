import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './src/.env' });

import './src/models/Vehicle.js';
import './src/models/User.js';
import './src/models/Group.js';
import './src/models/Ledger.js';
import './src/models/Customer.js';
import './src/models/Vendor.js';
import './src/models/Voucher.js';
import './src/models/Trip.js';
import './src/models/InventoryStock.js';
import './src/models/IndirectSale.js';
import './src/models/DieselStation.js';

async function run() {
  await mongoose.connect(process.env.DATABASE_URI, { dbName: process.env.DATABASE_NAME });
  console.log("Connected to MongoDB");

  const Trip = mongoose.model('Trip');
  const transferredTrips = await Trip.find({
    $or: [
      { type: 'transferred' },
      { transferredFrom: { $ne: null } }
    ]
  });

  console.log(`Found ${transferredTrips.length} transferred trips in database:`);
  transferredTrips.forEach(t => {
    console.log(`ID: ${t._id} | TripId: ${t.tripId} | Type: "${t.type}" | Status: "${t.status}" | Supervisor: ${t.supervisor}`);
    console.log(`TransferredFrom: ${t.transferredFrom}`);
    console.log(`Sales: ${t.sales.length} entries. Stocks: ${t.stocks.length} entries.`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
