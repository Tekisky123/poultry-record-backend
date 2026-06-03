import mongoose from 'mongoose';
import dotenv from 'dotenv';

import '../src/models/Vendor.js';
import '../src/models/Customer.js';
import '../src/models/Vehicle.js';
import '../src/models/User.js';
import '../src/models/Trip.js';
import InventoryStock from '../src/models/InventoryStock.js';
import Trip from '../src/models/Trip.js';

dotenv.config({ path: './src/.env' });

const mongoURI = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME || 'poultryRecordDB';

mongoose.connect(`${mongoURI}/${dbName}`)
  .then(async () => {
    console.log(`Connected to ${dbName}`);
    
    // Exact req.query from frontend when dateParam = 2026-05-27
    const req = {
      query: {
        startDate: '2026-05-27',
        endDate: '2026-05-27'
      }
    };

    const { startDate, endDate, supervisor, type, inventoryType } = req.query;

    let query = {};
    if (supervisor) query.supervisorId = supervisor;
    if (type) query.type = type;
    if (inventoryType) query.inventoryType = inventoryType;
    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.date.$lte = end;
        }
    }

    const inventoryStocks = await InventoryStock.find(query)
        .populate("vendorId", "vendorName companyName name")
        .populate("customerId", "shopName ownerName")
        .populate("vehicleId", "vehicleNumber")
        .populate("supervisorId", "name")
        .lean();

    let tripStocks = [];
    if (!type || type === 'purchase') {
        let tripQuery = {};

        const trips = await Trip.find({
            ...tripQuery,
            stocks: { $exists: true, $not: { $size: 0 } }
        })
            .select('tripId stocks supervisor vehicle purchases type')
            .populate('supervisor', 'name')
            .populate('vehicle', 'vehicleNumber')
            .populate('purchases.supplier', 'vendorName name companyName')
            .lean();

        tripStocks = trips.flatMap(trip => {
            let supplierName = '';
            if (trip.purchases && trip.purchases.length > 0) {
                const firstPurchase = trip.purchases[0];
                if (trip.type === 'transferred' && firstPurchase.vendorName) {
                    supplierName = firstPurchase.vendorName;
                } else if (firstPurchase.supplier) {
                    supplierName = firstPurchase.supplier.vendorName || firstPurchase.supplier.companyName || firstPurchase.supplier.name || '';
                }
            }
            if (!supplierName) {
                supplierName = "Trip-Stock (" + (trip.vehicle?.vehicleNumber || 'Unassigned') + ")";
            }

            return trip.stocks.map(s => ({
                _id: s._id,
                source: 'trip',
                tripId: trip._id,
                tripIdDisplay: trip.tripId,
                inventoryType: 'bird',
                type: 'purchase',
                birds: s.birds,
                weight: s.weight,
                avgWeight: s.avgWeight,
                rate: s.rate,
                amount: s.value,
                date: s.addedAt,
                supervisorId: trip.supervisor,
                vehicleId: trip.vehicle,
                vendorId: { vendorName: supplierName },
                notes: s.notes
            }));
        });

        if (supervisor) {
            tripStocks = tripStocks.filter(s => s.supervisorId?._id?.toString() === supervisor);
        }
        if (startDate) {
            tripStocks = tripStocks.filter(s => new Date(s.date) >= new Date(startDate));
        }
        if (endDate) {
            tripStocks = tripStocks.filter(s => new Date(s.date) <= new Date(endDate));
        }
        if (inventoryType) {
            tripStocks = tripStocks.filter(s => s.inventoryType === inventoryType);
        }
    }

    const allStocks = [...inventoryStocks, ...tripStocks].sort((a, b) => new Date(b.date) - new Date(a.date));

    console.log("RESPONSE DATA:");
    console.log(JSON.stringify(allStocks, null, 2));

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
