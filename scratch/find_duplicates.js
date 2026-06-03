import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './src/.env' });

const mongoURI = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME || 'poultryRecordDB';

mongoose.connect(`${mongoURI}/${dbName}`)
  .then(async () => {
    console.log(`Connected to ${dbName}`);
    const InventoryStock = mongoose.model('InventoryStock', new mongoose.Schema({}, { strict: false }));
    const Customer = mongoose.model('Customer', new mongoose.Schema({}, { strict: false }));
    const Ledger = mongoose.model('Ledger', new mongoose.Schema({}, { strict: false }));

    const sales = await InventoryStock.find({ type: 'sale' }).lean();

    const groups = {};
    for (const sale of sales) {
      const dateStr = sale.date ? new Date(sale.date).toISOString().split('T')[0] : 'no-date';
      const key = `${dateStr}_${sale.billNumber}_${sale.customerId}_${sale.birds}_${sale.weight}_${sale.amount}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(sale);
    }

    for (const [key, group] of Object.entries(groups)) {
      if (group.length > 1) {
        console.log(`\n==========================================`);
        console.log(`Group Key: ${key}`);
        console.log(`Found ${group.length} duplicates.`);
        
        for (let i = 0; i < group.length; i++) {
          const doc = group[i];
          console.log(`[Record ${i}] ID: ${doc._id}`);
          console.log(`  Date: ${doc.date}`);
          console.log(`  Birds: ${doc.birds}, Weight: ${doc.weight}, Rate: ${doc.rate}, Amount: ${doc.amount}`);
          console.log(`  CashPaid: ${doc.cashPaid}, OnlinePaid: ${doc.onlinePaid}, Discount: ${doc.discount}`);
          console.log(`  CustomerId: ${doc.customerId}`);
          console.log(`  CashLedgerId: ${doc.cashLedgerId}`);
          console.log(`  OnlineLedgerId: ${doc.onlineLedgerId}`);
          console.log(`  CreatedAt: ${doc.createdAt}`);
        }
      }
    }

    process.exit(0);
  })
  .catch(console.error);
