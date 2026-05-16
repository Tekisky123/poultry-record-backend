import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Group from '../src/models/Group.js';
import Ledger from '../src/models/Ledger.js';
import Vendor from '../src/models/Vendor.js';
import Voucher from '../src/models/Voucher.js';
import { toSignedValue } from '../src/utils/balanceUtils.js';

dotenv.config({ path: './src/.env' });

const buildVoucherBalanceMap = async (asOnDate = null) => {
  const query = { isActive: true };
  if (asOnDate) query.date = { $lte: new Date(asOnDate) };
  const balanceMap = await Voucher.aggregate([
    { $match: query },
    { $unwind: '$entries' },
    {
      $group: {
        _id: '$entries.account',
        debitTotal: { $sum: { $ifNull: ['$entries.debitAmount', 0] } },
        creditTotal: { $sum: { $ifNull: ['$entries.creditAmount', 0] } }
      }
    }
  ]);
  const map = new Map();
  balanceMap.forEach(item => {
    if (item._id) {
      const normalizedName = item._id.toString().trim().toLowerCase();
      map.set(normalizedName, {
        debitTotal: item.debitTotal || 0,
        creditTotal: item.creditTotal || 0
      });
    }
  });
  return map;
};

const calculateVendorBalance = (vendor, voucherBalanceMap) => {
  const openingSigned = toSignedValue(vendor.openingBalance || 0, vendor.openingBalanceType || 'credit');
  const normalizedName = (vendor.vendorName || '').toString().trim().toLowerCase();
  const voucherData = voucherBalanceMap.get(normalizedName);
  const debitTotal = voucherData ? voucherData.debitTotal : 0;
  const creditTotal = voucherData ? voucherData.creditTotal : 0;
  return openingSigned + debitTotal - creditTotal;
};

const testBalanceSheetLogic = async () => {
  try {
    await mongoose.connect(`${process.env.DATABASE_URI}/${process.env.DATABASE_NAME}`);
    console.log('Connected to MongoDB');

    const voucherBalanceMap = await buildVoucherBalanceMap();
    console.log('Voucher Balance for "kwality":', voucherBalanceMap.get('kwality'));

    const vendor = await Vendor.findOne({ vendorName: 'Kwality', isActive: true }).lean();
    if (vendor) {
      console.log('Vendor Found:', vendor.vendorName, 'Opening:', vendor.openingBalance, vendor.openingBalanceType);
      const balance = calculateVendorBalance(vendor, voucherBalanceMap);
      console.log('Calculated Balance (Signed):', balance);
      console.log('Outstanding Balance in DB:', vendor.outstandingBalance);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
};

testBalanceSheetLogic();
