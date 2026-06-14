import connectDB from './configs/database.js';
import Ledger from './models/Ledger.js';
import Vendor from './models/Vendor.js';
import Customer from './models/Customer.js';
import mongoose from 'mongoose';

async function run() {
    await connectDB();
    console.log("Connected!");
    
    const name = "diesel";
    
    const ledgers = await Ledger.find({ name: new RegExp(name, 'i') }).populate('group');
    console.log("Found ledgers count:", ledgers.length);
    ledgers.forEach(l => {
        console.log(`Ledger: name="${l.name}", id="${l._id}", group="${l.group?.name}", slug="${l.group?.slug}"`);
    });
    
    const vendors = await Vendor.find({ vendorName: new RegExp(name, 'i') });
    console.log("Found vendors count:", vendors.length);
    vendors.forEach(v => {
        console.log(`Vendor: name="${v.vendorName}", id="${v._id}"`);
    });
    
    const customers = await Customer.find({ shopName: new RegExp(name, 'i') });
    console.log("Found customers count:", customers.length);
    customers.forEach(c => {
        console.log(`Customer: shopName="${c.shopName}", ownerName="${c.ownerName}", id="${c._id}"`);
    });

    const Station = mongoose.model('DieselStation', new mongoose.Schema({}, { strict: false }), 'dieselstations');
    const stations = await Station.find({ name: new RegExp(name, 'i') });
    console.log("Found diesel stations count:", stations.length);
    stations.forEach(s => {
        console.log(`DieselStation: name="${s.get('name')}", id="${s._id}"`);
    });

    await mongoose.connection.close();
}
run().catch(console.error);
