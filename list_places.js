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
  const Trip = mongoose.model('Trip');
  const trips = await Trip.find({}).lean();
  console.log(`Total trips: ${trips.length}`);
  const places = trips.map(t => ({ id: t.tripId, place: t.place, type: t.type, status: t.status }));
  console.log(JSON.stringify(places.slice(0, 15), null, 2));
  
  const hasPlace = trips.filter(t => t.place !== undefined);
  console.log(`Number of trips with 'place' field defined in DB: ${hasPlace.length}`);
  
  await mongoose.disconnect();
}

run().catch(console.error);
