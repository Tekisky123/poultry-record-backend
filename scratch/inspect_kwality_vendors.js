import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vendor from '../src/models/Vendor.js';

dotenv.config({ path: './src/.env' });

const inspectKwalityVendors = async () => {
  try {
    await mongoose.connect(`${process.env.DATABASE_URI}/${process.env.DATABASE_NAME}`);
    console.log('Connected to MongoDB');

    const vendors = await Vendor.find({ vendorName: /Kwality/i });
    console.log('Vendors Detailed:', JSON.stringify(vendors, null, 2));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
};

inspectKwalityVendors();
