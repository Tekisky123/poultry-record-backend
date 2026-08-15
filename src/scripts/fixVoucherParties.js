import mongoose from 'mongoose';
import Voucher from '../models/Voucher.js';
import Customer from '../models/Customer.js';
import Vendor from '../models/Vendor.js';
import Ledger from '../models/Ledger.js';
import DieselStation from '../models/DieselStation.js';
import { config } from 'dotenv';

config();

const fixVoucherParties = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.DATABASE_URI || 'mongodb://localhost:27017/poultry-record-app';
        const dbName = process.env.DATABASE_NAME || '';
        await mongoose.connect(uri, dbName ? { dbName } : {});
        console.log('Connected to MongoDB:', dbName || 'default');

        const vouchers = await Voucher.find({});
        console.log(`Found ${vouchers.length} vouchers to check`);

        let updatedCount = 0;

        for (const v of vouchers) {
            let modified = false;

            if (v.parties && v.parties.length > 0) {
                const resolvedPartyNames = [];

                for (const p of v.parties) {
                    if (p.partyId) {
                        const partyIdStr = (typeof p.partyId === 'object' && p.partyId._id)
                            ? p.partyId._id.toString()
                            : p.partyId.toString();

                        let partyDoc = null;
                        let foundType = p.partyType;

                        if (foundType === 'customer') partyDoc = await Customer.findById(partyIdStr).lean();
                        else if (foundType === 'vendor') partyDoc = await Vendor.findById(partyIdStr).lean();
                        else if (foundType === 'ledger') partyDoc = await Ledger.findById(partyIdStr).lean();
                        else if (foundType === 'dieselStation') partyDoc = await DieselStation.findById(partyIdStr).lean();

                        if (!partyDoc) {
                            partyDoc = await Customer.findById(partyIdStr).lean();
                            if (partyDoc) foundType = 'customer';
                        }
                        if (!partyDoc) {
                            partyDoc = await Vendor.findById(partyIdStr).lean();
                            if (partyDoc) foundType = 'vendor';
                        }
                        if (!partyDoc) {
                            partyDoc = await Ledger.findById(partyIdStr).lean();
                            if (partyDoc) foundType = 'ledger';
                        }
                        if (!partyDoc) {
                            partyDoc = await DieselStation.findById(partyIdStr).lean();
                            if (partyDoc) foundType = 'dieselStation';
                        }

                        if (partyDoc) {
                            const name = partyDoc.shopName || partyDoc.vendorName || partyDoc.name || partyDoc.ownerName || 'Party';
                            if (p.partyName !== name || p.partyType !== foundType) {
                                p.partyName = name;
                                p.partyType = foundType;
                                modified = true;
                            }
                            resolvedPartyNames.push(name);
                        } else if (p.partyName && p.partyName !== 'Unknown Party') {
                            resolvedPartyNames.push(p.partyName);
                        }
                    }
                }

                if (resolvedPartyNames.length > 0) {
                    const newPartyName = resolvedPartyNames.join(', ');
                    if (v.partyName !== newPartyName) {
                        v.partyName = newPartyName;
                        modified = true;
                    }
                }
            }

            // Also check single party field if present
            if (v.party && (!v.partyName || v.partyName === 'Unknown Party')) {
                const customer = await Customer.findById(v.party).lean();
                const vendor = !customer ? await Vendor.findById(v.party).lean() : null;
                const name = customer ? (customer.shopName || customer.ownerName) : (vendor ? vendor.vendorName : null);
                if (name) {
                    v.partyName = name;
                    modified = true;
                }
            }

            if (modified) {
                await v.save();
                updatedCount++;
            }
        }

        console.log(`Successfully updated ${updatedCount} vouchers with actual party names!`);
        process.exit(0);
    } catch (error) {
        console.error('Error fixing voucher parties:', error);
        process.exit(1);
    }
};

fixVoucherParties();
