import mongoose from "mongoose";
import connectDB from "./src/configs/database.js";
import Group from "./src/models/Group.js";
import Ledger from "./src/models/Ledger.js";
import Vendor from "./src/models/Vendor.js";
import InventoryStock from "./src/models/InventoryStock.js";
import Voucher from "./src/models/Voucher.js";

async function inspect() {
  try {
    await connectDB();
    console.log("Connected to DB");

    // Search for Laxman in Ledger
    const ledgers = await Ledger.find({ name: { $regex: /laxman/i } }).populate('group', 'name slug').lean();
    console.log("FOUND LEDGERS:", JSON.stringify(ledgers, null, 2));

    // Search for Laxman in Vendor
    const vendors = await Vendor.find({ vendorName: { $regex: /laxman/i } }).populate('group', 'name slug').lean();
    console.log("FOUND VENDORS:", JSON.stringify(vendors, null, 2));

    const ledgerIds = ledgers.map(l => l._id);
    const vendorIds = vendors.map(v => v._id);

    // Search for InventoryStock by ledgerId or vendorId or notes/narration containing Laxman
    const stocks = await InventoryStock.find({
      $or: [
        { ledgerId: { $in: ledgerIds } },
        { vendorId: { $in: vendorIds } },
        { notes: { $regex: /laxman/i } },
        { narration: { $regex: /laxman/i } }
      ]
    }).lean();
    console.log("FOUND STOCKS BY LAXMAN:", JSON.stringify(stocks, null, 2));

    // Search all InventoryStock with inventoryType feed
    const allFeedStocks = await InventoryStock.find({ inventoryType: "feed" }).lean();
    console.log("ALL FEED STOCKS COUNT:", allFeedStocks.length);
    console.log("ALL FEED STOCKS:", JSON.stringify(allFeedStocks, null, 2));

    // Search all Vouchers mentioning Laxman or having Laxman's ledger ID
    const vouchers = await Voucher.find({
      $or: [
        { 'entries.account': { $regex: /laxman/i } },
        { account: { $in: ledgerIds } },
        { 'parties.partyId': { $in: ledgerIds } }
      ]
    }).lean();
    console.log("FOUND VOUCHERS:", JSON.stringify(vouchers, null, 2));

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

inspect();
