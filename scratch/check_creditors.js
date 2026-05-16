import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Ledger from '../src/models/Ledger.js';
import Vendor from '../src/models/Vendor.js';

dotenv.config({ path: './src/.env' });

const checkSundryCreditors = async () => {
  try {
    await mongoose.connect(`${process.env.DATABASE_URI}/${process.env.DATABASE_NAME}`);
    console.log('Connected to MongoDB');

    const groupId = '6915f19de218355b0ec262a8';

    const ledgers = await Ledger.find({ group: groupId, isActive: true }).lean();
    console.log('Ledgers in Sundry Creditors:', ledgers.map(l => ({ name: l.name, balance: l.outstandingBalance })));

    const vendors = await Vendor.find({ group: groupId, isActive: true }).lean();
    console.log('Vendors in Sundry Creditors:', vendors.map(v => ({ name: v.vendorName, balance: v.outstandingBalance })));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
};

checkSundryCreditors();
