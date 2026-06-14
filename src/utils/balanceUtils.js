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

    for (const v of voucherList) {
        if (v && v.parties && v.parties.length > 0) {
            for (const p of v.parties) {
                if (p.partyId && p.partyType) {
                    // Check if already populated (object with name/shopName/vendorName)
                    if (typeof p.partyId === 'object' && (p.partyId.shopName || p.partyId.vendorName || p.partyId.name)) {
                        continue;
                    }
                    const partyIdStr = p.partyId._id ? p.partyId._id.toString() : p.partyId.toString();
                    let partyDoc = null;
                    if (p.partyType === 'customer') {
                        partyDoc = await Customer.findById(partyIdStr).select('shopName ownerName').lean();
                    } else if (p.partyType === 'vendor') {
                        partyDoc = await Vendor.findById(partyIdStr).select('vendorName').lean();
                    } else if (p.partyType === 'ledger') {
                        partyDoc = await Ledger.findById(partyIdStr).select('name').lean();
                    } else if (p.partyType === 'dieselStation') {
                        const DieselStation = mongoose.model('DieselStation');
                        partyDoc = await DieselStation.findById(partyIdStr).select('name').lean();
                    }
                    if (partyDoc) {
                        p.partyId = {
                            _id: partyIdStr,
                            id: partyIdStr,
                            shopName: partyDoc.shopName,
                            ownerName: partyDoc.ownerName,
                            vendorName: partyDoc.vendorName,
                            name: partyDoc.name
                        };
                    } else {
                        p.partyId = {
                            _id: partyIdStr,
                            id: partyIdStr,
                            name: 'Unknown Party'
                        };
                    }
                }
            }
        }
    }
    return vouchers;
};
