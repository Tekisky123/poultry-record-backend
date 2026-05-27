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
  const trip = await Trip.findOne({ tripId: 'TRP-0046' });
  if (!trip) {
    console.error("Trip TRP-0046 not found!");
    process.exit(1);
  }

  console.log(`\nTrip TRP-0046:`);
  console.log(`ID: ${trip._id}`);
  console.log(`Status: "${trip.status}"`);
  console.log(`Type: "${trip.type}"`);
  console.log(`TransferredFrom: ${trip.transferredFrom}`);
  console.log(`TransferredTo: ${trip.transferredTo}`);
  console.log(`Sales count: ${trip.sales.length}`);
  console.log(`Stocks count: ${trip.stocks.length}`);
  console.log(`Purchases count: ${trip.purchases.length}`);
  console.log(`Summary:`, JSON.stringify(trip.summary, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
