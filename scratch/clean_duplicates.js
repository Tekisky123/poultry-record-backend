import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { toSignedValue, fromSignedValue, subtractFromBalance } from '../src/utils/balanceUtils.js';

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

    const duplicatesToRemove = [];

    // Map to accumulate changes we need to apply to customer outstanding balances
    // { customerId: changeToSignedValue }
    const customerAdjustments = {};
    // { ledgerId: { totalDebitToSubtract: X } }
    const ledgerAdjustments = {};

    for (const [key, group] of Object.entries(groups)) {
      if (group.length > 1) {
        // Sort by createdAt ascending to keep the oldest one
        group.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        
        console.log(`\nGroup: ${key}`);
        console.log(`Keeping: ${group[0]._id} (created at ${group[0].createdAt})`);
        
        for (let i = 1; i < group.length; i++) {
          const doc = group[i];
          console.log(`Removing duplicate: ${doc._id} (created at ${doc.createdAt})`);
          duplicatesToRemove.push(doc._id);

          // Calculate customer balance adjustment
          // Each sale added: amount to debit (+), cashPaid to credit (-), onlinePaid to credit (-), discount to credit (-)
          // Net change to customer balance: amount - cashPaid - onlinePaid - discount
          if (doc.customerId) {
            const custIdStr = doc.customerId.toString();
            const netChange = (Number(doc.amount) || 0) - (Number(doc.cashPaid) || 0) - (Number(doc.onlinePaid) || 0) - (Number(doc.discount) || 0);
            customerAdjustments[custIdStr] = (customerAdjustments[custIdStr] || 0) + netChange;
          }

          // Calculate cash ledger adjustment
          if (doc.cashLedgerId && doc.cashPaid > 0) {
            const ledgerIdStr = doc.cashLedgerId.toString();
            if (!ledgerAdjustments[ledgerIdStr]) ledgerAdjustments[ledgerIdStr] = 0;
            ledgerAdjustments[ledgerIdStr] += Number(doc.cashPaid);
          }

          // Calculate online ledger adjustment
          if (doc.onlineLedgerId && doc.onlinePaid > 0) {
            const ledgerIdStr = doc.onlineLedgerId.toString();
            if (!ledgerAdjustments[ledgerIdStr]) ledgerAdjustments[ledgerIdStr] = 0;
            ledgerAdjustments[ledgerIdStr] += Number(doc.onlinePaid);
          }
        }
      }
    }

    console.log('\n--- Adjustments to be made ---');
    console.log('Customer Adjustments (signed outstanding balance will be reduced by these values):', customerAdjustments);
    console.log('Ledger Adjustments (debit balances will be reduced by these values):', ledgerAdjustments);
    console.log(`Total duplicate documents to remove: ${duplicatesToRemove.length}`);

    if (duplicatesToRemove.length === 0) {
      console.log('No duplicates found. Exiting.');
      process.exit(0);
    }

    // Apply adjustments to customers
    for (const [custId, reduction] of Object.entries(customerAdjustments)) {
      const customer = await Customer.findById(custId);
      if (customer) {
        const currentSigned = toSignedValue(customer.outstandingBalance || 0, customer.outstandingBalanceType || 'debit');
        const newSigned = currentSigned - reduction;
        const newBalanceObj = fromSignedValue(newSigned);
        
        console.log(`Updating customer ${customer.shopName} (${custId}):`);
        console.log(`  Old: ${customer.outstandingBalance} ${customer.outstandingBalanceType} (Signed: ${currentSigned})`);
        console.log(`  New: ${newBalanceObj.amount} ${newBalanceObj.type} (Signed: ${newSigned})`);
        
        customer.outstandingBalance = newBalanceObj.amount;
        customer.outstandingBalanceType = newBalanceObj.type;
        await customer.save();
      }
    }

    // Apply adjustments to ledgers
    for (const [ledgerId, reduction] of Object.entries(ledgerAdjustments)) {
      const ledger = await Ledger.findById(ledgerId);
      if (ledger) {
        const newBalanceObj = subtractFromBalance(ledger.outstandingBalance, ledger.outstandingBalanceType, reduction, 'debit');
        
        console.log(`Updating ledger ${ledger.name} (${ledgerId}):`);
        console.log(`  Old: ${ledger.outstandingBalance} ${ledger.outstandingBalanceType}`);
        console.log(`  New: ${newBalanceObj.amount} ${newBalanceObj.type}`);
        
        ledger.outstandingBalance = newBalanceObj.amount;
        ledger.outstandingBalanceType = newBalanceObj.type;
        await ledger.save();
      }
    }

    // Remove duplicates
    const deleteResult = await InventoryStock.deleteMany({ _id: { $in: duplicatesToRemove } });
    console.log(`Successfully deleted ${deleteResult.deletedCount} duplicate InventoryStock documents.`);

    console.log('Cleanup completed successfully.');
    process.exit(0);
  })
  .catch(console.error);
