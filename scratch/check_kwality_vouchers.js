import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Voucher from '../src/models/Voucher.js';

dotenv.config({ path: './src/.env' });

const checkKwalityVouchers = async () => {
  try {
    await mongoose.connect(`${process.env.DATABASE_URI}/${process.env.DATABASE_NAME}`);
    console.log('Connected to MongoDB');

    // Find all vouchers where any entry account contains "Kwality"
    const vouchers = await Voucher.find({
      'entries.account': /Kwality/i,
      isActive: true
    }).lean();

    const accountNames = new Set();
    vouchers.forEach(v => {
      v.entries.forEach(e => {
        if (/Kwality/i.test(e.account)) {
          accountNames.add(e.account);
        }
      });
    });

    console.log('Account names found in vouchers:', Array.from(accountNames));
    console.log('Total vouchers found:', vouchers.length);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
};

checkKwalityVouchers();
