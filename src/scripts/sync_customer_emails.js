import dotenv from 'dotenv';
dotenv.config({ path: './src/.env' });
import connectDB from '../configs/database.js';
import User from '../models/User.js';
import Customer from '../models/Customer.js';

await connectDB();
console.log('Syncing customer emails and user references with updateOne...');

const customers = await Customer.find({ isActive: true });
let updatedCount = 0;

for (const customer of customers) {
  if (customer.user) {
    const user = await User.findById(customer.user);
    if (user && user.email) {
      const emailLower = user.email.toLowerCase();
      if (!customer.email || customer.email !== emailLower) {
        await Customer.updateOne({ _id: customer._id }, { $set: { email: emailLower } });
        updatedCount++;
        console.log(`Synced: ${customer.shopName} -> ${emailLower}`);
      }
      if (!user.customer || user.customer.toString() !== customer._id.toString()) {
        await User.updateOne({ _id: user._id }, { $set: { customer: customer._id } });
      }
    }
  } else {
    // Check if a User exists with the same mobileNumber
    const user = await User.findOne({ mobileNumber: customer.contact });
    if (user && user.email) {
      const emailLower = user.email.toLowerCase();
      await Customer.updateOne(
        { _id: customer._id },
        { $set: { user: user._id, email: emailLower } }
      );
      await User.updateOne(
        { _id: user._id },
        { $set: { customer: customer._id, role: 'customer', approvalStatus: 'approved' } }
      );
      updatedCount++;
      console.log(`Linked & Synced: ${customer.shopName} -> ${emailLower}`);
    }
  }
}

console.log(`Sync complete! Updated ${updatedCount} customers.`);
process.exit(0);
