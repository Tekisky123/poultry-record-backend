/**
 * Convert balance to signed value
 * Debit = positive, Credit = negative
 */
export const toSignedValue = (amount, type) => {
    if (!type || type === 'debit') {
        return Math.abs(amount);
    }
    return -Math.abs(amount);
};

/**
 * Convert signed value to balance format
 * Returns { amount, type }
 */
export const fromSignedValue = (signedValue) => {
    if (signedValue >= 0) {
        return {
            amount: Math.abs(signedValue),
            type: 'debit'
        };
    }
    return {
        amount: Math.abs(signedValue),
        type: 'credit'
    };
};

/**
 * Sync outstanding balance when opening balance changes
 * @param {Number} oldOpeningAmount - Old opening balance amount
 * @param {String} oldOpeningType - Old opening balance type ('debit' or 'credit')
 * @param {Number} newOpeningAmount - New opening balance amount
 * @param {String} newOpeningType - New opening balance type ('debit' or 'credit')
 * @param {Number} currentOutstandingAmount - Current outstanding balance amount
 * @param {String} currentOutstandingType - Current outstanding balance type ('debit' or 'credit')
 * @returns {Object} - { amount, type } for new outstanding balance
 */
export const syncOutstandingBalance = (
    oldOpeningAmount,
    oldOpeningType,
    newOpeningAmount,
    newOpeningType,
    currentOutstandingAmount,
    currentOutstandingType
) => {
    // Convert to signed values
    const oldOpeningSigned = toSignedValue(oldOpeningAmount || 0, oldOpeningType || 'debit');
    const newOpeningSigned = toSignedValue(newOpeningAmount || 0, newOpeningType || 'debit');
    const currentOutstandingSigned = toSignedValue(currentOutstandingAmount || 0, currentOutstandingType || 'debit');

    // Compute the difference
    const difference = newOpeningSigned - oldOpeningSigned;

    // Apply the difference
    const newOutstandingSigned = currentOutstandingSigned + difference;

    // Convert back to balance format
    return fromSignedValue(newOutstandingSigned);
};

/**
 * Add amount to balance (for payments/credits)
 * @param {Number} currentAmount - Current balance amount
 * @param {String} currentType - Current balance type ('debit' or 'credit')
 * @param {Number} amountToAdd - Amount to add (always positive)
 * @param {String} transactionType - Type of transaction ('debit' or 'credit')
 * @returns {Object} - { amount, type } for new balance
 */
export const addToBalance = (currentAmount, currentType, amountToAdd, transactionType) => {
    const currentSigned = toSignedValue(currentAmount || 0, currentType || 'debit');
    const amountSigned = toSignedValue(amountToAdd || 0, transactionType || 'credit');
    const newSigned = currentSigned + amountSigned;
    return fromSignedValue(newSigned);
};

/**
 * Subtract amount from balance (for reversing transactions)
 * @param {Number} currentAmount - Current balance amount
 * @param {String} currentType - Current balance type ('debit' or 'credit')
 * @param {Number} amountToSubtract - Amount to subtract (always positive)
 * @param {String} transactionType - Type of transaction that was added ('debit' or 'credit')
 * @returns {Object} - { amount, type } for new balance
 */
export const subtractFromBalance = (currentAmount, currentType, amountToSubtract, transactionType) => {
    const currentSigned = toSignedValue(currentAmount || 0, currentType || 'debit');
    const amountSigned = toSignedValue(amountToSubtract || 0, transactionType || 'credit');
    const newSigned = currentSigned - amountSigned;
    return fromSignedValue(newSigned);
};
/**
 * Get the start date of the financial year for a given date
 * (Assumes FY starts on April 1st)
 */
export const getFinancialYearStartDate = (date = new Date()) => {
    const d = new Date(date);
    const month = d.getMonth(); // 0-11 (Jan-Dec)
    const year = d.getFullYear();
    // If month is Jan(0), Feb(1), or Mar(2), the FY started on April 1st of the PREVIOUS year.
    // If month is Apr(3) or later, the FY started on April 1st of the CURRENT year.
    const fyStartYear = month >= 3 ? year : year - 1;
    return new Date(fyStartYear, 3, 1, 0, 0, 0, 0); // April 1st, 00:00:00
};

/**
 * Dynamically populate parties.partyId in vouchers
 * Since Voucher schema does not have a static ref for partyId, Mongoose populate on parties.partyId does not work automatically.
 */
export const populateVoucherParties = async (vouchers) => {
    if (!vouchers) return vouchers;
    const isArray = Array.isArray(vouchers);
    const voucherList = isArray ? vouchers : [vouchers];

    const mongoose = (await import('mongoose')).default;
    const Customer = mongoose.model('Customer');
    const Vendor = mongoose.model('Vendor');
    const Ledger = mongoose.model('Ledger');
    const DieselStation = mongoose.model('DieselStation');

    // Collect all unique party IDs by type
    const customerIds = new Set();
    const vendorIds = new Set();
    const ledgerIds = new Set();
    const stationIds = new Set();
    const allIds = new Set();

    for (const v of voucherList) {
        if (v && v.parties && v.parties.length > 0) {
            for (const p of v.parties) {
                if (p.partyId) {
                    const partyIdStr = (typeof p.partyId === 'object' && p.partyId?._id) 
                        ? p.partyId._id.toString() 
                        : (typeof p.partyId === 'object' && p.partyId?.id)
                            ? p.partyId.id.toString()
                            : p.partyId.toString();

                    allIds.add(partyIdStr);
                    if (p.partyType === 'customer') customerIds.add(partyIdStr);
                    else if (p.partyType === 'vendor') vendorIds.add(partyIdStr);
                    else if (p.partyType === 'ledger') ledgerIds.add(partyIdStr);
                    else if (p.partyType === 'dieselStation') stationIds.add(partyIdStr);
                    else {
                        customerIds.add(partyIdStr);
                        vendorIds.add(partyIdStr);
                        ledgerIds.add(partyIdStr);
                        stationIds.add(partyIdStr);
                    }
                }
            }
        }
    }

    if (allIds.size === 0) return vouchers;

    // Batch query all models concurrently
    const [customers, vendors, ledgers, stations] = await Promise.all([
        customerIds.size ? Customer.find({ _id: { $in: Array.from(customerIds) } }).select('shopName ownerName').lean() : [],
        vendorIds.size ? Vendor.find({ _id: { $in: Array.from(vendorIds) } }).select('vendorName').lean() : [],
        ledgerIds.size ? Ledger.find({ _id: { $in: Array.from(ledgerIds) } }).select('name').lean() : [],
        stationIds.size ? DieselStation.find({ _id: { $in: Array.from(stationIds) } }).select('name').lean() : []
    ]);

    const customerMap = new Map(customers.map(c => [c._id.toString(), c]));
    const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));
    const ledgerMap = new Map(ledgers.map(l => [l._id.toString(), l]));
    const stationMap = new Map(stations.map(s => [s._id.toString(), s]));

    // Check if any IDs were not resolved by their declared type, and fetch fallbacks in batch if needed
    const unresolvedIds = [];
    for (const idStr of allIds) {
        if (!customerMap.has(idStr) && !vendorMap.has(idStr) && !ledgerMap.has(idStr) && !stationMap.has(idStr)) {
            unresolvedIds.push(idStr);
        }
    }

    if (unresolvedIds.length > 0) {
        const [fbCust, fbVend, fbLedg, fbStat] = await Promise.all([
            Customer.find({ _id: { $in: unresolvedIds } }).select('shopName ownerName').lean(),
            Vendor.find({ _id: { $in: unresolvedIds } }).select('vendorName').lean(),
            Ledger.find({ _id: { $in: unresolvedIds } }).select('name').lean(),
            DieselStation.find({ _id: { $in: unresolvedIds } }).select('name').lean()
        ]);
        fbCust.forEach(c => customerMap.set(c._id.toString(), c));
        fbVend.forEach(v => vendorMap.set(v._id.toString(), v));
        fbLedg.forEach(l => ledgerMap.set(l._id.toString(), l));
        fbStat.forEach(s => stationMap.set(s._id.toString(), s));
    }

    // Populate each party using in-memory maps
    for (const v of voucherList) {
        if (v && v.parties && v.parties.length > 0) {
            for (const p of v.parties) {
                if (p.partyId) {
                    const partyIdStr = (typeof p.partyId === 'object' && p.partyId?._id) 
                        ? p.partyId._id.toString() 
                        : (typeof p.partyId === 'object' && p.partyId?.id)
                            ? p.partyId.id.toString()
                            : p.partyId.toString();

                    let partyDoc = null;
                    let foundType = p.partyType;

                    if (foundType === 'customer') partyDoc = customerMap.get(partyIdStr);
                    else if (foundType === 'vendor') partyDoc = vendorMap.get(partyIdStr);
                    else if (foundType === 'ledger') partyDoc = ledgerMap.get(partyIdStr);
                    else if (foundType === 'dieselStation') partyDoc = stationMap.get(partyIdStr);

                    if (!partyDoc) {
                        partyDoc = customerMap.get(partyIdStr);
                        if (partyDoc) foundType = 'customer';
                    }
                    if (!partyDoc) {
                        partyDoc = vendorMap.get(partyIdStr);
                        if (partyDoc) foundType = 'vendor';
                    }
                    if (!partyDoc) {
                        partyDoc = ledgerMap.get(partyIdStr);
                        if (partyDoc) foundType = 'ledger';
                    }
                    if (!partyDoc) {
                        partyDoc = stationMap.get(partyIdStr);
                        if (partyDoc) foundType = 'dieselStation';
                    }

                    if (partyDoc) {
                        const resolvedName = partyDoc.shopName || partyDoc.vendorName || partyDoc.name || partyDoc.ownerName || 'Party';
                        p.partyName = p.partyName || resolvedName;
                        p.partyType = foundType;
                        p.partyId = {
                            _id: partyIdStr,
                            id: partyIdStr,
                            shopName: partyDoc.shopName,
                            ownerName: partyDoc.ownerName,
                            vendorName: partyDoc.vendorName,
                            name: resolvedName
                        };
                    } else if (typeof p.partyId === 'object') {
                        const resolvedName = p.partyName || p.partyId.shopName || p.partyId.vendorName || p.partyId.name || p.partyId.ownerName;
                        if (resolvedName) {
                            p.partyName = resolvedName;
                        }
                    }
                }
            }
        }
    }
    return vouchers;
};
