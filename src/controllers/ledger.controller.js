import Ledger from "../models/Ledger.js";
import Group from "../models/Group.js";
import Vendor from "../models/Vendor.js";
import Customer from "../models/Customer.js";
import Trip from "../models/Trip.js";
import Voucher from "../models/Voucher.js";
import InventoryStock from "../models/InventoryStock.js";
import IndirectSale from "../models/IndirectSale.js";
import DieselStation from "../models/DieselStation.js";
import { toSignedValue, fromSignedValue, syncOutstandingBalance, getFinancialYearStartDate, populateVoucherParties } from "../utils/balanceUtils.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";

const getObjectIdStr = (val) => {
    if (!val) return '';
    if (val._id) return val._id.toString();
    return val.toString();
};

export const addLedger = async (req, res, next) => {
    try {
        const { name, group, openingBalance, openingBalanceType, outstandingBalance, outstandingBalanceType } = req.body;

        // Validate required fields
        if (!name) {
            throw new AppError('Ledger name is required', 400);
        }

        // Validate group exists
        const groupDoc = await Group.findById(group);
        if (!groupDoc || !groupDoc.isActive) {
            throw new AppError('Group not found or inactive', 404);
        }

        const openingValue = openingBalance || 0;
        const openingType = openingBalanceType || 'debit';

        // If outstanding balance is provided, use it; otherwise default to opening balance
        const outstandingValue = outstandingBalance !== undefined ? outstandingBalance : openingValue;
        const outstandingType = outstandingBalanceType !== undefined ? outstandingBalanceType : openingType;

        const ledgerData = {
            name,
            group,
            openingBalance: openingValue,
            openingBalanceType: openingType,
            outstandingBalance: outstandingValue,
            outstandingBalanceType: outstandingType,
            createdBy: req.user._id,
            updatedBy: req.user._id
        };

        const ledger = new Ledger(ledgerData);
        await ledger.save();

        const populatedLedger = await Ledger.findById(ledger._id)
            .populate('group', 'name type slug')
            .populate('vendor', 'vendorName email contactNumber')
            .populate('customer', 'shopName contact')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "New ledger added", 201, populatedLedger);
    } catch (error) {
        next(error);
    }
};

export const getLedgers = async (req, res, next) => {
    try {
        const { group, ledgerType } = req.query;
        const query = { isActive: true };

        if (group) {
            query.group = group;
        }
        if (ledgerType) {
            query.ledgerType = ledgerType;
        }

        const ledgers = await Ledger.find(query)
            .populate('group', 'name type slug')
            .populate('vendor', 'vendorName email contactNumber')
            .populate('customer', 'shopName contact')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .sort({ name: 1 })
            .lean();

        successResponse(res, "Ledgers retrieved successfully", 200, ledgers);
    } catch (error) {
        next(error);
    }
};

export const getLedgerById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [rawLedger, station, vendor, customer] = await Promise.all([
            Ledger.findOne({ _id: id, isActive: true })
                .populate('group', 'name type slug')
                .populate('vendor', 'vendorName email contactNumber')
                .populate('customer', 'shopName contact')
                .populate('createdBy', 'name')
                .populate('updatedBy', 'name')
                .lean(),
            DieselStation.findOne({ _id: id, isActive: true }).populate('group', 'name type slug').lean(),
            Vendor.findOne({ _id: id, isActive: true }).populate('group', 'name type slug').lean(),
            Customer.findOne({ _id: id, isActive: true }).populate('group', 'name type slug').lean()
        ]);

        let ledger = rawLedger;
        if (!ledger && station) {
            let grp = station.group;
            if (!grp) {
                grp = await Group.findOne({ slug: 'diesel-creditors' }).lean() || { name: 'Diesel Creditors' };
            }
            ledger = {
                _id: station._id,
                name: station.name,
                group: grp,
                openingBalance: station.openingBalance || 0,
                openingBalanceType: station.openingBalanceType || 'credit',
                outstandingBalance: station.outstandingBalance || 0,
                outstandingBalanceType: station.outstandingBalanceType || 'credit'
            };
        } else if (!ledger && vendor) {
            let grp = vendor.group;
            if (!grp) {
                grp = await Group.findOne({ slug: 'sundry-creditors' }).lean() || { name: 'Sundry Creditors' };
            }
            ledger = {
                _id: vendor._id,
                name: vendor.companyName || vendor.vendorName,
                group: grp,
                openingBalance: vendor.openingBalance || 0,
                openingBalanceType: vendor.openingBalanceType || 'credit',
                outstandingBalance: vendor.outstandingBalance || 0,
                outstandingBalanceType: vendor.outstandingBalanceType || 'credit'
            };
        } else if (!ledger && customer) {
            let grp = customer.group;
            if (!grp) {
                grp = await Group.findOne({ slug: 'sundry-debtors' }).lean() || { name: 'Sundry Debtors' };
            }
            ledger = {
                _id: customer._id,
                name: customer.shopName || customer.ownerName,
                group: grp,
                openingBalance: customer.openingBalance || 0,
                openingBalanceType: customer.openingBalanceType || 'debit',
                outstandingBalance: customer.outstandingBalance || 0,
                outstandingBalanceType: customer.outstandingBalanceType || 'debit'
            };
        }

        if (!ledger) {
            throw new AppError('Ledger not found', 404);
        }

        successResponse(res, "Ledger retrieved successfully", 200, ledger);
    } catch (error) {
        next(error);
    }
};

export const getLedgersByGroup = async (req, res, next) => {
    const { groupId } = req.params;
    try {
        // Validate group exists
        const group = await Group.findById(groupId);
        if (!group || !group.isActive) {
            throw new AppError('Group not found or inactive', 404);
        }

        const ledgers = await Ledger.find({ group: groupId, isActive: true })
            .populate('group', 'name type slug')
            .populate('vendor', 'vendorName email contactNumber')
            .populate('customer', 'shopName contact')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .sort({ name: 1 })
            .lean();

        successResponse(res, "Ledgers retrieved successfully", 200, ledgers);
    } catch (error) {
        next(error);
    }
};

export const updateLedger = async (req, res, next) => {
    const { id } = req.params;
    try {
        const { name, group, openingBalance, openingBalanceType, outstandingBalance, outstandingBalanceType } = req.body;

        const ledger = await Ledger.findById(id);
        if (!ledger || !ledger.isActive) {
            throw new AppError('Ledger not found', 404);
        }

        // Validate required fields
        if (!name) {
            throw new AppError('Ledger name is required', 400);
        }

        // Validate group if changed
        if (group) {
            const groupDoc = await Group.findById(group);
            if (!groupDoc || !groupDoc.isActive) {
                throw new AppError('Group not found or inactive', 404);
            }
        }

        // Check if opening balance is being changed
        const isOpeningBalanceChanged = openingBalance !== undefined || openingBalanceType !== undefined;

        let newOutstandingBalance = outstandingBalance !== undefined ? outstandingBalance : ledger.outstandingBalance;
        let newOutstandingBalanceType = outstandingBalanceType !== undefined ? outstandingBalanceType : ledger.outstandingBalanceType;

        // If opening balance changed, sync outstanding balance
        if (isOpeningBalanceChanged) {
            const newOpeningAmount = openingBalance !== undefined ? openingBalance : ledger.openingBalance;
            const newOpeningType = openingBalanceType !== undefined ? openingBalanceType : ledger.openingBalanceType;

            const syncedBalance = syncOutstandingBalance(
                ledger.openingBalance,
                ledger.openingBalanceType,
                newOpeningAmount,
                newOpeningType,
                ledger.outstandingBalance,
                ledger.outstandingBalanceType
            );

            newOutstandingBalance = syncedBalance.amount;
            newOutstandingBalanceType = syncedBalance.type;
        }

        const updateData = {
            name,
            group: group || ledger.group,
            openingBalance: openingBalance !== undefined ? openingBalance : ledger.openingBalance,
            openingBalanceType: openingBalanceType !== undefined ? openingBalanceType : ledger.openingBalanceType,
            outstandingBalance: newOutstandingBalance,
            outstandingBalanceType: newOutstandingBalanceType,
            updatedBy: req.user._id
        };

        const updatedLedger = await Ledger.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
            .populate('group', 'name type slug')
            .populate('vendor', 'vendorName email contactNumber')
            .populate('customer', 'shopName contact')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "Ledger updated successfully", 200, updatedLedger);
    } catch (error) {
        next(error);
    }
};

export const deleteLedger = async (req, res, next) => {
    const { id } = req.params;
    try {
        const ledger = await Ledger.findById(id);
        if (!ledger || !ledger.isActive) {
            throw new AppError('Ledger not found', 404);
        }

        if (Math.abs(ledger.openingBalance || 0) >= 1 || Math.abs(ledger.outstandingBalance || 0) >= 1) {
            throw new AppError("Cannot delete ledger: It has a balance of 1 RS or more.", 400);
        }

        // Soft delete
        const deletedLedger = await Ledger.findByIdAndUpdate(
            id,
            { isActive: false, updatedBy: req.user._id },
            { new: true }
        );

        successResponse(res, "Ledger deleted successfully", 200, deletedLedger);
    } catch (error) {
        next(error);
    }
};

export const getMonthlySummary = async (req, res, next) => {
    const { id } = req.params;
    const { type, year } = req.query;

    try {
        let subject = null;
        let subjectType = type;

        if (!subjectType) {
            subject = await Customer.findById(id).populate('group', 'name type slug');
            if (subject) subjectType = 'customer';
            else {
                subject = await Vendor.findById(id).populate('group', 'name type slug');
                if (subject) subjectType = 'vendor';
                else {
                    subject = await Ledger.findById(id).populate('group', 'name type slug');
                    if (subject) subjectType = 'ledger';
                    else {
                        subject = await DieselStation.findById(id).populate('group', 'name type slug');
                        if (subject) subjectType = 'dieselStation';
                    }
                }
            }
        } else {
            if (subjectType === 'customer') subject = await Customer.findById(id).populate('group', 'name type slug');
            else if (subjectType === 'vendor') subject = await Vendor.findById(id).populate('group', 'name type slug');
            else if (subjectType === 'ledger') subject = await Ledger.findById(id).populate('group', 'name type slug');
            else if (subjectType === 'dieselStation') subject = await DieselStation.findById(id).populate('group', 'name type slug');

            if (!subject) {
                subject = await Ledger.findById(id).populate('group', 'name type slug');
                if (subject) subjectType = 'ledger';
                else {
                    subject = await Vendor.findById(id).populate('group', 'name type slug');
                    if (subject) subjectType = 'vendor';
                    else {
                        subject = await Customer.findById(id).populate('group', 'name type slug');
                        if (subject) subjectType = 'customer';
                        else {
                            subject = await DieselStation.findById(id).populate('group', 'name type slug');
                            if (subject) subjectType = 'dieselStation';
                        }
                    }
                }
            }
        }

        if (!subject) {
            throw new AppError('Subject not found', 404);
        }

        let startYear;
        if (year) {
            startYear = parseInt(year);
        } else {
            const today = new Date();
            startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
        }

        const startDate = new Date(startYear, 3, 1); // Apr 1
        const endDate = new Date(startYear + 1, 3, 1); // Apr 1 next year (exclusive)

        const months = [];
        for (let i = 0; i < 12; i++) {
            const mStart = new Date(startYear, 3 + i, 1);
            const mEnd = new Date(startYear, 3 + i + 1, 1);
            months.push({
                name: mStart.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
                monthShort: mStart.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
                startDate: mStart,
                endDate: mEnd,
                debit: 0,
                credit: 0,
                birds: 0,
                weight: 0,
                volume: 0,
                discountAndOther: 0
            });
        }

        const subjectIdStr = id.toString();
        const subjectName = subjectType === 'customer' ? (subject.shopName || subject.ownerName) :
            subjectType === 'vendor' ? (subject.companyName || subject.vendorName) : subject.name;
        const subjectNameStr = subjectName ? subjectName.trim().toLowerCase() : '';
        const vendorNameStr = (subjectType === 'vendor' && subject.vendorName) ? subject.vendorName.trim().toLowerCase() : '';
        const companyNameStr = (subjectType === 'vendor' && subject.companyName) ? subject.companyName.trim().toLowerCase() : '';

        // Target voucher query to match subject by ID, account header, party or legacy name entries
        const voucherConditions = [
            { account: id },
            { 'parties.partyId': id },
            { 'entries.account': id }
        ];
        const nameMatches = [];
        if (subjectName) nameMatches.push(subjectName);
        if (vendorNameStr && vendorNameStr !== subjectNameStr) nameMatches.push(subject.vendorName);
        if (companyNameStr && companyNameStr !== subjectNameStr && companyNameStr !== vendorNameStr) nameMatches.push(subject.companyName);

        nameMatches.forEach(nm => {
            voucherConditions.push({ 'entries.account': nm });
            voucherConditions.push({ 'entries.account': new RegExp(`^${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
        });

        const voucherQuery = {
            isActive: true,
            $or: voucherConditions
        };

        const tripQuery = {
            $or: [
                { 'purchases.supplier': id },
                { 'sales.client': id },
                { 'sales.cashLedger': id },
                { 'sales.onlineLedger': id },
                { 'diesel.stations.dieselStation': id }
            ]
        };

        const stockQuery = subjectType !== 'dieselStation' ? {
            $or: [
                { vendorId: id },
                { ledgerId: id },
                { customerId: id },
                { cashLedgerId: id },
                { onlineLedgerId: id },
                { expenseLedgerId: id }
            ]
        } : null;

        const indirectQuery = subjectType !== 'dieselStation' ? {
            $or: [
                { customer: id },
                { vendor: id }
            ]
        } : null;

        // Fetch all required data in parallel in a single round-trip
        const [vouchers, trips, stocks, indirectSales] = await Promise.all([
            Voucher.find(voucherQuery).lean(),
            Trip.find(tripQuery).select('date createdAt sales purchases diesel expenses losses stocks summary').lean(),
            stockQuery ? InventoryStock.find(stockQuery).lean() : Promise.resolve([]),
            indirectQuery ? IndirectSale.find(indirectQuery).lean() : Promise.resolve([])
        ]);

        // Helper: mirrors vendor.controller.js isTdsApplicableForDate exactly
        const isTdsApplicableForDate = (date) => {
            if (!subject.tdsApplicable) return false;
            if (!subject.tdsUpdatedAt) return true; // no activation date → applies to all
            const txDate = new Date(date);
            txDate.setHours(0, 0, 0, 0);
            const activationDate = new Date(subject.tdsUpdatedAt);
            activationDate.setHours(0, 0, 0, 0);
            return txDate >= activationDate;
        };

        // Helper
        let gapDebit = 0;
        let gapCredit = 0;
        let gapBeforeDebit = 0;
        let gapBeforeCredit = 0;

        const addToStats = (date, debit, credit, birds = 0, weight = 0, volume = 0, discount = 0, isDiscountRelated = false) => {
            if (date >= endDate) {
                gapDebit += debit;
                gapCredit += credit;
                return;
            }
            if (date < startDate) {
                gapBeforeDebit += debit;
                gapBeforeCredit += credit;
                return;
            }

            const idx = months.findIndex(m => date >= m.startDate && date < m.endDate);
            if (idx !== -1) {
                months[idx].debit += debit;
                months[idx].credit += credit;
                months[idx].birds += birds;
                months[idx].weight += weight;
                months[idx].volume += volume;
                if (isDiscountRelated) months[idx].discountAndOther += discount;
            }
        };

        // Process Vouchers
        for (const v of vouchers) {
            const vDate = new Date(v.date);
            let debit = 0;
            let credit = 0;
            let voucherAmount = 0;
            let isMatch = false;

            const isPaymentReceipt = v.voucherType === 'Payment' || v.voucherType === 'Receipt';

            // For Journal/Contra/other vouchers: use entries section only.
            // For Payment/Receipt vouchers: use parties + account header only.
            // This prevents double-counting when a Payment/Receipt voucher stores
            // entries for the cash/bank account AND the account header also references it.
            if (!isPaymentReceipt && v.entries) {
                v.entries.forEach(e => {
                    const entryAcc = e.account ? e.account.toString().trim() : '';
                    // Match by ID first; fall back to ledger name for legacy data
                    // where e.account may store the name string instead of the ObjectId
                    let entryMatch = entryAcc === subjectIdStr;
                    if (!entryMatch && subjectType === 'vendor') {
                        const accLower = entryAcc.toLowerCase();
                        if ((vendorNameStr && accLower === vendorNameStr) || (companyNameStr && accLower === companyNameStr)) {
                            entryMatch = true;
                        }
                    } else if (!entryMatch && subjectNameStr && entryAcc.toLowerCase() === subjectNameStr) {
                        entryMatch = true;
                    }
                    if (entryMatch) {
                        debit += e.debitAmount || 0;
                        credit += e.creditAmount || 0;
                        voucherAmount += (e.debitAmount || 0) + (e.creditAmount || 0);
                        isMatch = true;
                    }
                });
            }

            if (isPaymentReceipt) {
                // Parties section
                if (v.parties) {
                    v.parties.forEach(p => {
                        if (p.partyId && p.partyId.toString() === subjectIdStr) {
                            let isTypeMatch = false;
                            if (subjectType === 'ledger' && p.partyType === 'ledger') isTypeMatch = true;
                            else if (subjectType === 'customer' && p.partyType === 'customer') isTypeMatch = true;
                            else if (subjectType === 'vendor' && p.partyType === 'vendor') isTypeMatch = true;
                            else if (subjectType === 'dieselStation' && (!p.partyType || p.partyType === 'dieselStation')) isTypeMatch = true;

                            if (isTypeMatch) {
                                if (subjectType === 'vendor' || subjectType === 'dieselStation') {
                                    debit += p.amount || 0;
                                } else {
                                    if (v.voucherType === 'Payment') debit += p.amount || 0;
                                    else credit += p.amount || 0;
                                }
                                voucherAmount += p.amount || 0;
                                isMatch = true;
                            }
                        }
                    });
                }

                // Account Header (cash/bank ledger that is the payer/receiver)
                if (subjectType === 'ledger' && v.account) {
                    if (v.account.toString() === subjectIdStr) {
                        const totalAmount = v.parties
                            ? v.parties.reduce((sum, p) => sum + (p.amount || 0), 0)
                            : 0;
                        if (v.voucherType === 'Payment') credit += totalAmount;
                        else debit += totalAmount;
                        voucherAmount += totalAmount;
                        isMatch = true;
                    }
                }
            }

            if (isMatch) {
                let isDiscount = false;
                if (subjectType === 'customer') {
                    if (!isPaymentReceipt) isDiscount = true;
                } else if (subjectType === 'vendor') {
                    if (v.voucherType === 'Receipt' || v.voucherType === 'Journal') isDiscount = true;
                }
                addToStats(vDate, debit, credit, 0, 0, 0, isDiscount ? voucherAmount : 0, isDiscount);
            }
        }

        // Process Trips
        for (const t of trips) {
            const tDate = new Date(t.createdAt);
            let debit = 0; let credit = 0; let birds = 0; let weight = 0; let volume = 0; let discount = 0; let isMatch = false;

            if (subjectType === 'customer') {
                if (t.sales) {
                    t.sales.forEach(s => {
                        if (s.client && s.client.toString() === id.toString()) {
                            debit += s.amount || 0;
                            credit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                            birds += (s.birds || s.birdsCount || 0);
                            weight += s.weight || 0;
                            discount += s.discount || 0;
                            isMatch = true;
                        }
                    });
                }
            } else if (subjectType === 'vendor') {
                if (t.purchases) {
                    t.purchases.forEach(p => {
                        if (p.supplier && p.supplier.toString() === id.toString()) {
                            credit += p.amount || 0;
                            let tdsAmount = 0;
                            if (isTdsApplicableForDate(t.date || t.createdAt)) {
                                tdsAmount = (p.amount || 0) * 0.001;
                            }
                            debit += tdsAmount;
                            birds += p.birds || 0;
                            weight += p.weight || 0;
                            isMatch = true;
                        }
                    });
                }
            } else if (subjectType === 'ledger') {
                if (t.sales) {
                    t.sales.forEach(s => {
                        if (s.cashLedger && s.cashLedger.toString() === id.toString()) {
                            debit += s.cashPaid || 0; isMatch = true;
                        }
                        if (s.onlineLedger && s.onlineLedger.toString() === id.toString()) {
                            debit += s.onlinePaid || 0; isMatch = true;
                        }
                    });
                }
            } else if (subjectType === 'dieselStation') {
                if (t.diesel && t.diesel.stations) {
                    t.diesel.stations.forEach(s => {
                        if (s.dieselStation && s.dieselStation.toString() === id.toString()) {
                            credit += s.amount || 0; // Purchase for Station is Credit (Liability Increase)
                            volume += s.volume || 0;
                            isMatch = true;
                        }
                    });
                }
            }
            if (isMatch) addToStats(tDate, debit, credit, birds, weight, volume, discount, true);
        }

        // Process Stocks
        for (const s of stocks) {
            const sDate = new Date(s.date);
            let debit = 0; let credit = 0; let birds = 0; let weight = 0; let discount = 0; let isMatch = false;

            if (subjectType === 'customer') {
                if (s.customerId && s.customerId.toString() === id.toString()) {
                    if (s.type === 'sale' || s.type === 'receipt') {
                        if (s.type === 'sale') {
                            debit += s.amount || 0;
                            birds += s.birds || 0;
                            weight += s.weight || 0;
                        }
                        credit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                        discount += s.discount || 0;
                        isMatch = true;
                    }
                }
            } else if (subjectType === 'vendor') {
                const sVendorId = s.vendorId?._id || s.vendorId;
                const sLedgerId = s.ledgerId?._id || s.ledgerId;
                if ((sVendorId && sVendorId.toString() === id.toString()) || (sLedgerId && sLedgerId.toString() === id.toString())) {
                    if (s.type === 'purchase' || s.type === 'opening' || s.inventoryType === 'feed') {
                        credit += s.amount || 0;
                        let tdsAmount = 0;
                        if (isTdsApplicableForDate(s.date)) {
                            tdsAmount = (s.amount || 0) * 0.001;
                        }
                        debit += tdsAmount;
                        birds += s.bags || s.birds || 0;
                        weight += s.feedQty || s.weight || 0;
                        isMatch = true;
                    }
                }
            } else if (subjectType === 'ledger') {
                const sLedgerId = s.ledgerId?._id || s.ledgerId;
                const sVendorId = s.vendorId?._id || s.vendorId;
                if ((sLedgerId && sLedgerId.toString() === id.toString()) || (sVendorId && sVendorId.toString() === id.toString())) {
                    if (s.type === 'purchase' || s.inventoryType === 'feed') {
                        credit += s.amount || 0;
                        debit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                        birds += s.bags || s.birds || 0;
                        weight += s.feedQty || s.weight || 0;
                        discount += s.discount || 0;
                        isMatch = true;
                    } else if (s.type === 'sale') {
                        debit += s.amount || 0;
                        credit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                        birds += s.birds || 0;
                        weight += s.weight || 0;
                        discount += s.discount || 0;
                        isMatch = true;
                    }
                }
                if (s.cashLedgerId && s.cashLedgerId.toString() === id.toString()) { debit += s.cashPaid || 0; isMatch = true; }
                if (s.onlineLedgerId && s.onlineLedgerId.toString() === id.toString()) { debit += s.onlinePaid || 0; isMatch = true; }
                if (s.expenseLedgerId && s.expenseLedgerId.toString() === id.toString()) { debit += s.amount || 0; isMatch = true; }
            }

            if (isMatch) addToStats(sDate, debit, credit, birds, weight, 0, discount, true);
        }

        // Process Indirect Sales
        for (const s of indirectSales) {
            const sDate = new Date(s.date);
            let debit = 0; let credit = 0; let birds = 0; let weight = 0; let isMatch = false;

            if (subjectType === 'customer') {
                debit += s.sales?.amount || 0;
                birds += s.sales?.birds || 0;
                weight += s.sales?.weight || 0;
                isMatch = true;
            } else if (subjectType === 'vendor') {
                const amt = s.summary?.totalPurchaseAmount || 0;
                credit += amt;
                let tdsAmount = 0;
                if (isTdsApplicableForDate(s.date)) {
                    tdsAmount = amt * 0.001;
                }
                debit += tdsAmount;
                birds += s.summary?.totalPurchaseBirds || 0;
                weight += s.summary?.totalPurchaseWeight || 0;
                isMatch = true;
            }
            if (isMatch) addToStats(sDate, debit, credit, birds, weight, 0, 0, false);
        }


        // Calculate Balances natively from Opening fields via Forward Calculation
        // Use standard balance utils which handles this via type

        const subjectFYStartDate = getFinancialYearStartDate(subject.createdAt);

        // Forward Calculation
        // Use original opening balance + transactions BEFORE start date
        let origOpenSigned = 0;
        if (startDate >= subjectFYStartDate) {
            origOpenSigned = toSignedValue(subject.openingBalance || 0, subject.openingBalanceType || 'debit');
        }

        const netBefore = gapBeforeDebit - gapBeforeCredit;
        let yearStartBalanceSigned = origOpenSigned + netBefore;

        let currentSigned = yearStartBalanceSigned;
        const finalMonths = months.map(m => {
            currentSigned += (m.debit - m.credit);
            const closing = fromSignedValue(currentSigned);
            return {
                ...m,
                closingBalance: closing.amount,
                closingBalanceType: closing.type,
                startDate: m.startDate.toISOString(),
                endDate: m.endDate.toISOString()
            };
        });

        const openingYearBalance = fromSignedValue(yearStartBalanceSigned);

        successResponse(res, "Monthly summary retrieved", 200, {
            subject: {
                id: subject._id,
                name: subjectType === 'vendor'
                    ? (subject.companyName || subject.vendorName)
                    : (subject.name || subject.shopName || subject.vendorName),
                companyName: subject.companyName,
                vendorName: subject.vendorName,
                type: subjectType
            },
            openingBalance: openingYearBalance.amount,
            openingBalanceType: openingYearBalance.type,
            months: finalMonths,
            totals: {
                debit: months.reduce((acc, m) => acc + m.debit, 0),
                credit: months.reduce((acc, m) => acc + m.credit, 0),
                birds: months.reduce((acc, m) => acc + m.birds, 0),
                weight: months.reduce((acc, m) => acc + m.weight, 0),
                volume: months.reduce((acc, m) => acc + m.volume, 0),
                discountAndOther: months.reduce((acc, m) => acc + m.discountAndOther, 0)
            }
        });

    } catch (error) {
        next(error);
    }
};


export const getDailySummary = async (req, res, next) => {
    const { id } = req.params;
    const { type, year, month } = req.query;

    try {
        let subject = null;
        let subjectType = type;

        if (!subjectType) {
            subject = await Customer.findById(id);
            if (subject) subjectType = 'customer';
            else {
                subject = await Vendor.findById(id);
                if (subject) subjectType = 'vendor';
                else {
                    subject = await Ledger.findById(id);
                    if (subject) subjectType = 'ledger';
                    else {
                        subject = await DieselStation.findById(id);
                        if (subject) subjectType = 'dieselStation';
                    }
                }
            }
        } else {
            if (subjectType === 'customer') subject = await Customer.findById(id);
            else if (subjectType === 'vendor') subject = await Vendor.findById(id);
            else if (subjectType === 'ledger') subject = await Ledger.findById(id);
            else if (subjectType === 'dieselStation') subject = await DieselStation.findById(id);

            if (!subject) {
                subject = await Ledger.findById(id);
                if (subject) subjectType = 'ledger';
                else {
                    subject = await Vendor.findById(id);
                    if (subject) subjectType = 'vendor';
                    else {
                        subject = await Customer.findById(id);
                        if (subject) subjectType = 'customer';
                        else {
                            subject = await DieselStation.findById(id);
                            if (subject) subjectType = 'dieselStation';
                        }
                    }
                }
            }
        }

        if (!subject) {
            throw new AppError('Subject not found', 404);
        }

        const today = new Date();
        const targetYear = year ? parseInt(year) : today.getFullYear();
        // Month 1-12 from query, convert to 0-11. Default to current month.
        const targetMonth = month ? parseInt(month) - 1 : today.getMonth();

        const startDate = new Date(targetYear, targetMonth, 1);
        const endDate = new Date(targetYear, targetMonth + 1, 1);

        const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const days = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const dCurrent = new Date(targetYear, targetMonth, i);
            days.push({
                day: i,
                date: dCurrent.toLocaleDateString('en-CA'), // YYYY-MM-DD
                displayDate: dCurrent.toLocaleDateString('en-GB'), // DD/MM/YYYY
                debit: 0,
                credit: 0,
                voucherCount: 0
            });
        }

        const subjectIdStr = id.toString();
        const subjectName = subjectType === 'customer' ? (subject.shopName || subject.ownerName) :
            subjectType === 'vendor' ? (subject.companyName || subject.vendorName) : subject.name;
        const subjectNameStr = subjectName ? subjectName.trim().toLowerCase() : '';
        const vendorNameStr = (subjectType === 'vendor' && subject.vendorName) ? subject.vendorName.trim().toLowerCase() : '';
        const companyNameStr = (subjectType === 'vendor' && subject.companyName) ? subject.companyName.trim().toLowerCase() : '';

        // Target voucher query to match subject by ID, account header, party or legacy name entries
        const voucherConditions = [
            { account: id },
            { 'parties.partyId': id },
            { 'entries.account': id }
        ];
        const nameMatches = [];
        if (subjectName) nameMatches.push(subjectName);
        if (vendorNameStr && vendorNameStr !== subjectNameStr) nameMatches.push(subject.vendorName);
        if (companyNameStr && companyNameStr !== subjectNameStr && companyNameStr !== vendorNameStr) nameMatches.push(subject.companyName);

        nameMatches.forEach(nm => {
            voucherConditions.push({ 'entries.account': nm });
            voucherConditions.push({ 'entries.account': new RegExp(`^${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
        });

        const voucherQuery = {
            isActive: true,
            date: { $gte: startDate, $lt: endDate },
            $or: voucherConditions
        };

        const tripQuery = {
            createdAt: { $gte: startDate, $lt: endDate },
            $or: [
                { 'purchases.supplier': id },
                { 'sales.client': id },
                { 'sales.cashLedger': id },
                { 'sales.onlineLedger': id },
                { 'diesel.stations.dieselStation': id }
            ]
        };

        const stockQuery = subjectType !== 'dieselStation' ? {
            date: { $gte: startDate, $lt: endDate },
            $or: [
                { vendorId: id },
                { ledgerId: id },
                { customerId: id },
                { cashLedgerId: id },
                { onlineLedgerId: id },
                { expenseLedgerId: id }
            ]
        } : null;

        const indirectQuery = subjectType !== 'dieselStation' ? {
            date: { $gte: startDate, $lt: endDate },
            isActive: true,
            $or: [
                { customer: id },
                { vendor: id }
            ]
        } : null;

        // Fetch all in parallel
        const [vouchers, trips, stocks, indirectSales] = await Promise.all([
            Voucher.find(voucherQuery).lean(),
            Trip.find(tripQuery).select('date createdAt sales purchases diesel expenses losses stocks summary').lean(),
            stockQuery ? InventoryStock.find(stockQuery).lean() : Promise.resolve([]),
            indirectQuery ? IndirectSale.find(indirectQuery).lean() : Promise.resolve([])
        ]);

        // Helper: mirrors vendor.controller.js isTdsApplicableForDate exactly
        const isTdsApplicableForDate = (date) => {
            if (!subject.tdsApplicable) return false;
            if (!subject.tdsUpdatedAt) return true; // no activation date → applies to all
            const txDate = new Date(date);
            txDate.setHours(0, 0, 0, 0);
            const activationDate = new Date(subject.tdsUpdatedAt);
            activationDate.setHours(0, 0, 0, 0);
            return txDate >= activationDate;
        };

        // Process Vouchers
        vouchers.forEach(v => {
            let debit = 0;
            let credit = 0;
            let isMatch = false;

            const vDate = new Date(v.date);
            const dayOfMonth = vDate.getDate();
            const dayIndex = dayOfMonth - 1;

            if (dayIndex < 0 || dayIndex >= days.length) return;

            const isPaymentReceipt = v.voucherType === 'Payment' || v.voucherType === 'Receipt';

            // For Journal/Contra/other: use entries only.
            // For Payment/Receipt: use parties + account header only.
            // This prevents double-counting the same amount via both paths.
            if (!isPaymentReceipt && v.entries) {
                v.entries.forEach(e => {
                    const entryAcc = e.account ? e.account.toString().trim() : '';
                    let entryMatch = entryAcc === subjectIdStr;
                    // Name fallback for legacy data
                    if (!entryMatch && subjectType === 'vendor') {
                        const accLower = entryAcc.toLowerCase();
                        const eNameLower = e.name ? e.name.trim().toLowerCase() : '';
                        if ((vendorNameStr && (accLower === vendorNameStr || eNameLower === vendorNameStr)) ||
                            (companyNameStr && (accLower === companyNameStr || eNameLower === companyNameStr))) {
                            entryMatch = true;
                        }
                    } else if (!entryMatch && ((subjectNameStr && entryAcc.toLowerCase() === subjectNameStr) || (e.name && e.name.trim().toLowerCase() === subjectNameStr))) {
                        entryMatch = true;
                    }
                    if (entryMatch) {
                        debit += e.debitAmount || 0;
                        credit += e.creditAmount || 0;
                        isMatch = true;
                    }
                });
            }

            if (isPaymentReceipt) {
                // Parties
                if (v.parties) {
                    v.parties.forEach(p => {
                        if (p.partyId && p.partyId.toString() === subjectIdStr) {
                            let isTypeMatch = false;
                            if (subjectType === 'ledger' && p.partyType === 'ledger') isTypeMatch = true;
                            else if (subjectType === 'customer' && p.partyType === 'customer') isTypeMatch = true;
                            else if (subjectType === 'vendor' && p.partyType === 'vendor') isTypeMatch = true;
                            else if (subjectType === 'dieselStation' && (!p.partyType || p.partyType === 'dieselStation')) isTypeMatch = true;

                            if (isTypeMatch) {
                                if (subjectType === 'vendor' || subjectType === 'dieselStation') {
                                    debit += p.amount || 0;
                                } else {
                                    if (v.voucherType === 'Payment') debit += p.amount || 0;
                                    else credit += p.amount || 0;
                                }
                                isMatch = true;
                            }
                        }
                    });
                }

                // Account Header (cash/bank ledger)
                if (subjectType === 'ledger' && v.account) {
                    if (v.account.toString() === subjectIdStr) {
                        const totalAmount = v.parties
                            ? v.parties.reduce((sum, p) => sum + (p.amount || 0), 0)
                            : 0;
                        if (v.voucherType === 'Payment') credit += totalAmount;
                        else debit += totalAmount;
                        isMatch = true;
                    }
                }
            }

            if (isMatch) {
                days[dayIndex].debit += debit;
                days[dayIndex].credit += credit;
                days[dayIndex].voucherCount += 1;
            }
        });

        // Process Trips
        trips.forEach(t => {
            let debit = 0;
            let credit = 0;
            let isMatch = false;

            const tDate = new Date(t.createdAt);
            const dayOfMonth = tDate.getDate();
            const dayIndex = dayOfMonth - 1;

            if (dayIndex < 0 || dayIndex >= days.length) return;

            if (subjectType === 'customer') {
                t.sales.forEach(s => {
                    if (s.client && s.client.toString() === id.toString()) {
                        debit += s.amount || 0;
                        credit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                        isMatch = true;
                    }
                });
            } else if (subjectType === 'vendor') {
                t.purchases.forEach(p => {
                    if (p.supplier && p.supplier.toString() === id.toString()) {
                        credit += p.amount || 0;
                        let tdsAmount = 0;
                        if (isTdsApplicableForDate(t.date || t.createdAt)) {
                            tdsAmount = (p.amount || 0) * 0.001;
                        }
                        debit += tdsAmount;
                        isMatch = true;
                    }
                });
            } else if (subjectType === 'ledger') {
                if (t.sales) {
                    t.sales.forEach(s => {
                        let localDebit = 0;
                        if (s.cashLedger && s.cashLedger.toString() === id.toString()) {
                            localDebit += s.cashPaid || 0;
                        }
                        if (s.onlineLedger && s.onlineLedger.toString() === id.toString()) {
                            localDebit += s.onlinePaid || 0;
                        }
                        if (localDebit > 0) {
                            debit += localDebit;
                            isMatch = true;
                        }
                    });
                }
            } else if (subjectType === 'dieselStation') {
                if (t.diesel && t.diesel.stations) {
                    t.diesel.stations.forEach(s => {
                        if (s.dieselStation && s.dieselStation.toString() === id.toString()) {
                            credit += s.amount || 0;
                            isMatch = true;
                        }
                    });
                }
            }

            if (isMatch) {
                days[dayIndex].debit += debit;
                days[dayIndex].credit += credit;
                days[dayIndex].voucherCount += 1; // Count trip as one transaction entry source
            }
        });

        // Process Stocks
        stocks.forEach(s => {
            let debit = 0;
            let credit = 0;
            let isMatch = false;

            const sDate = new Date(s.date);
            const dayOfMonth = sDate.getDate();
            const dayIndex = dayOfMonth - 1;

            if (dayIndex < 0 || dayIndex >= days.length) return;

            if (subjectType === 'customer') {
                if (s.customerId && s.customerId.toString() === id.toString()) {
                    if (s.type === 'sale' || s.type === 'receipt') {
                        if (s.type === 'sale') debit += s.amount || 0;
                        credit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                        isMatch = true;
                    }
                }
            } else if (subjectType === 'vendor') {
                const sVendorId = s.vendorId?._id || s.vendorId;
                if (sVendorId && sVendorId.toString() === id.toString()) {
                    if (s.type === 'purchase' || s.type === 'opening') {
                        credit += s.amount || 0;
                        let tdsAmount = 0;
                        if (isTdsApplicableForDate(s.date)) {
                            tdsAmount = (s.amount || 0) * 0.001;
                        }
                        debit += tdsAmount;
                        isMatch = true;
                    }
                }
            } else if (subjectType === 'ledger') {
                const sLedgerId = s.ledgerId?._id || s.ledgerId;
                if (sLedgerId && sLedgerId.toString() === id.toString()) {
                    if (s.type === 'purchase' || s.inventoryType === 'feed') {
                        credit += s.amount || 0;
                        debit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                        isMatch = true;
                    } else if (s.type === 'sale') {
                        debit += s.amount || 0;
                        credit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                        isMatch = true;
                    }
                }
                if (s.cashLedgerId && s.cashLedgerId.toString() === id.toString()) { debit += s.cashPaid || 0; isMatch = true; }
                if (s.onlineLedgerId && s.onlineLedgerId.toString() === id.toString()) { debit += s.onlinePaid || 0; isMatch = true; }
                if (s.expenseLedgerId && s.expenseLedgerId.toString() === id.toString()) { debit += s.amount || 0; isMatch = true; }
            }

            if (isMatch) {
                days[dayIndex].debit += debit;
                days[dayIndex].credit += credit;
                days[dayIndex].voucherCount += 1;
            }
        });

        // Process Indirect Sales
        indirectSales.forEach(s => {
            let debit = 0;
            let credit = 0;
            let isMatch = false;

            const sDate = new Date(s.date);
            const dayOfMonth = sDate.getDate();
            const dayIndex = dayOfMonth - 1;

            if (dayIndex < 0 || dayIndex >= days.length) return;

            if (subjectType === 'customer') {
                debit += s.sales?.amount || 0;
                isMatch = true;
            } else if (subjectType === 'vendor') {
                const amt = s.summary?.totalPurchaseAmount || 0;
                credit += amt;
                let tdsAmount = 0;
                if (isTdsApplicableForDate(s.date)) {
                    tdsAmount = amt * 0.001;
                }
                debit += tdsAmount;
                isMatch = true;
            }

            if (isMatch) {
                days[dayIndex].debit += debit;
                days[dayIndex].credit += credit;
                days[dayIndex].voucherCount += 1;
            }
        });

        const totals = {
            debit: days.reduce((acc, d) => acc + d.debit, 0),
            credit: days.reduce((acc, d) => acc + d.credit, 0),
            voucherCount: days.reduce((acc, d) => acc + d.voucherCount, 0)
        };

        successResponse(res, "Daily summary retrieved", 200, {
            subject: {
                id: subject._id,
                name: subjectType === 'vendor'
                    ? (subject.companyName || subject.vendorName)
                    : (subject.name || subject.shopName || subject.vendorName),
                companyName: subject.companyName,
                vendorName: subject.vendorName,
                type: subjectType
            },
            days,
            totals,
            year: targetYear,
            month: targetMonth + 1
        });

    } catch (error) {
        next(error);
    }
};

export const getLedgerTransactions = async (req, res, next) => {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    try {
        const [rawLedger, rawStation, rawVendor, rawCustomer] = await Promise.all([
            Ledger.findById(id).populate('group', 'name type slug').lean(),
            DieselStation.findById(id).populate('group', 'name type slug').lean(),
            Vendor.findById(id).populate('group', 'name type slug').lean(),
            Customer.findById(id).populate('group', 'name type slug').lean()
        ]);

        let ledger = rawLedger;
        let subjectType = 'ledger';
        if (!ledger && rawStation) {
            ledger = rawStation;
            subjectType = 'dieselStation';
        } else if (!ledger && rawVendor) {
            ledger = rawVendor;
            subjectType = 'vendor';
        } else if (!ledger && rawCustomer) {
            ledger = rawCustomer;
            subjectType = 'customer';
        }

        if (!ledger) {
            throw new AppError('Ledger not found', 404);
        }

        let subjectName = ledger.name;
        if (subjectType === 'vendor') {
            subjectName = ledger.companyName || ledger.vendorName;
        } else if (subjectType === 'customer') {
            subjectName = ledger.shopName || ledger.ownerName;
        }

        let ledgerGroup = ledger.group;
        if (!ledgerGroup) {
            if (subjectType === 'dieselStation') {
                ledgerGroup = await Group.findOne({ slug: 'diesel-creditors' }) || { name: 'Diesel Creditors' };
            } else if (subjectType === 'vendor') {
                ledgerGroup = await Group.findOne({ slug: 'sundry-creditors' }) || { name: 'Sundry Creditors' };
            } else if (subjectType === 'customer') {
                ledgerGroup = await Group.findOne({ slug: 'sundry-debtors' }) || { name: 'Sundry Debtors' };
            }
        }

        const queryStartDate = startDate ? new Date(startDate) : null;
        let queryEndDate = endDate ? new Date(endDate) : null;

        // Adjust endDate to end of day if provided
        if (queryEndDate) {
            queryEndDate.setHours(23, 59, 59, 999);
        }

        const subjectIdStr = id.toString();
        const subjectNameStr = subjectName ? subjectName.trim().toLowerCase() : '';
        const vendorNameStr = (subjectType === 'vendor' && ledger.vendorName) ? ledger.vendorName.trim().toLowerCase() : '';
        const companyNameStr = (subjectType === 'vendor' && ledger.companyName) ? ledger.companyName.trim().toLowerCase() : '';

        // Target voucher query to match subject by ID, account header, party or legacy name entries
        const voucherConditions = [
            { account: id },
            { 'parties.partyId': id },
            { 'entries.account': id }
        ];
        const nameMatches = [];
        if (subjectName) nameMatches.push(subjectName);
        if (vendorNameStr && vendorNameStr !== subjectNameStr) nameMatches.push(ledger.vendorName);
        if (companyNameStr && companyNameStr !== subjectNameStr && companyNameStr !== vendorNameStr) nameMatches.push(ledger.companyName);

        nameMatches.forEach(nm => {
            if (nm) {
                voucherConditions.push({ 'entries.account': nm });
                voucherConditions.push({ 'entries.account': new RegExp(`^${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
            }
        });

        const voucherQuery = {
            isActive: true,
            $or: voucherConditions
        };

        if (queryStartDate || queryEndDate) {
            voucherQuery.date = {};
            if (queryStartDate) voucherQuery.date.$gte = queryStartDate;
            if (queryEndDate) voucherQuery.date.$lte = queryEndDate;
        }

        // Trips Query
        const tripConditions = [
            { 'sales.cashLedger': id },
            { 'sales.onlineLedger': id },
            { 'sales.client': id },
            { 'purchases.supplier': id },
            { 'diesel.stations.dieselStation': id },
            { 'diesel.stations.paymentLedger': id }
        ];

        if (subjectType === 'dieselStation' && subjectName) {
            tripConditions.push({ 'diesel.stations.stationName': subjectName });
        }

        const tripQuery = {
            $or: tripConditions
        };

        if (queryStartDate || queryEndDate) {
            tripQuery.date = {};
            if (queryStartDate) tripQuery.date.$gte = queryStartDate;
            if (queryEndDate) tripQuery.date.$lte = queryEndDate;
        }

        // Inventory Stock Query
        const stockQuery = {
            $or: [
                { 'ledgerId': id },
                { 'vendorId': id },
                { 'customerId': id },
                { 'cashLedgerId': id },
                { 'onlineLedgerId': id },
                { 'expenseLedgerId': id }
            ]
        };
        if (queryStartDate || queryEndDate) {
            stockQuery.date = {};
            if (queryStartDate) stockQuery.date.$gte = queryStartDate;
            if (queryEndDate) stockQuery.date.$lte = queryEndDate;
        }

        const [vouchers, trips, stocks] = await Promise.all([
            Voucher.find(voucherQuery).lean()
                .populate('party', 'shopName vendorName companyName')
                .populate('account', 'name'),
            Trip.find(tripQuery).lean()
                .populate('vehicle', 'registrationNumber vehicleNumber')
                .populate('supervisor', 'name')
                .populate('sales.client', 'shopName ownerName')
                .populate('purchases.supplier', 'companyName vendorName')
                .populate('diesel.stations.dieselStation', 'name')
                .populate('diesel.stations.paymentLedger', 'name'),
            InventoryStock.find(stockQuery).lean()
                .populate('customerId', 'shopName ownerName')
                .populate('vendorId', 'shopName vendorName companyName')
        ]);

        await populateVoucherParties(vouchers);

        let transactions = [];

        // 1. Process Vouchers
        vouchers.forEach(v => {
            let debit = 0;
            let credit = 0;
            let description = v.narration || v.voucherType;
            let refNo = v.voucherNumber;

            const isPaymentReceipt = v.voucherType === 'Payment' || v.voucherType === 'Receipt';

            if (isPaymentReceipt) {
                // If this entity is the Header Account (Cash/Bank)
                if (v.account && getObjectIdStr(v.account) === id.toString()) {
                    if (v.parties && v.parties.length > 0) {
                        const isNewVoucher = Boolean(v.isMultiPartyDisplay) || (v.parties && v.parties.length > 1) || (v.createdAt && new Date(v.createdAt) >= new Date('2026-08-15T00:00:00.000Z'));
                        if (isNewVoucher) {
                            v.parties.forEach((p, pIdx) => {
                                const partyObj = p.partyId;
                                const partyName = p.partyName || (partyObj ? (partyObj.companyName || partyObj.shopName || partyObj.vendorName || partyObj.name || partyObj.ownerName) : '') || 'Party';
                                const pAmount = p.amount || 0;
                                const isPayment = v.voucherType === 'Payment';

                                transactions.push({
                                    _id: `${v._id}_party_${pIdx}`,
                                    date: v.date,
                                    createdAt: v.createdAt,
                                    type: v.voucherType,
                                    refNo: `VCH-${refNo}`,
                                    description: partyName,
                                    debit: isPayment ? 0 : pAmount,
                                    credit: isPayment ? pAmount : 0,
                                    source: 'voucher',
                                    narration: v.narration || ''
                                });
                            });
                            return;
                        } else {
                            const totalAmount = v.parties.reduce((sum, p) => sum + (p.amount || 0), 0);
                            if (v.voucherType === 'Payment') {
                                credit += totalAmount;
                            } else {
                                debit += totalAmount;
                            }
                            const firstParty = v.parties[0]?.partyId;
                            if (v.parties.length === 1 && firstParty) {
                                description = firstParty.companyName || firstParty.shopName || firstParty.vendorName || firstParty.name || 'Unknown Party';
                            } else {
                                description = `Multiple Accounts (${v.parties.length})`;
                            }
                        }
                    }
                }

                // If this entity is in PARTIES
                if (v.parties && v.parties.length > 0) {
                    v.parties.forEach(p => {
                        const pId = p.partyId ? getObjectIdStr(p.partyId) : '';
                        if (pId === id.toString()) {
                            const pAmount = p.amount || 0;
                            if (subjectType === 'customer') {
                                // Receipt from Customer decreases debt (Credit)
                                if (v.voucherType === 'Receipt') credit += pAmount;
                                else debit += pAmount;
                            } else {
                                // Payment to Vendor/Diesel Station/Expense decreases payable (Debit)
                                if (v.voucherType === 'Payment') debit += pAmount;
                                else credit += pAmount;
                            }

                            if (!v.account || getObjectIdStr(v.account) !== id.toString()) {
                                description = v.account ? v.account.name : 'Unknown Account';
                            }
                        }
                    });
                }

                // Fallback: match via entries name
                if (debit === 0 && credit === 0 && v.entries && v.entries.length > 0) {
                    v.entries.forEach(e => {
                        const accName = e.account ? e.account.toLowerCase().trim() : '';
                        const isMatch = nameMatches.some(nm => nm && nm.toLowerCase().trim() === accName);
                        if (isMatch) {
                            debit += e.debitAmount || 0;
                            credit += e.creditAmount || 0;

                            let oppositeAccountName = '';
                            if (e.debitAmount > 0) {
                                const crEntry = v.entries.find(entry => entry.creditAmount > 0 && entry.account && !nameMatches.some(nm => nm.toLowerCase().trim() === entry.account.toLowerCase().trim()));
                                if (crEntry) oppositeAccountName = crEntry.account;
                            } else if (e.creditAmount > 0) {
                                const drEntry = v.entries.find(entry => entry.debitAmount > 0 && entry.account && !nameMatches.some(nm => nm.toLowerCase().trim() === entry.account.toLowerCase().trim()));
                                if (drEntry) oppositeAccountName = drEntry.account;
                            }
                            if (oppositeAccountName) description = oppositeAccountName;
                        }
                    });
                }
            } else {
                // Contra / Journal
                if (v.entries && v.entries.length > 0) {
                    v.entries.forEach(e => {
                        const accName = e.account ? e.account.toLowerCase().trim() : '';
                        const isMatch = nameMatches.some(nm => nm && nm.toLowerCase().trim() === accName) || (e.account && e.account.toString() === id.toString());
                        if (isMatch) {
                            debit += e.debitAmount || 0;
                            credit += e.creditAmount || 0;

                            let oppositeAccountName = '';
                            if (e.debitAmount > 0) {
                                const crEntry = v.entries.find(entry => entry.creditAmount > 0 && entry.account && !nameMatches.some(nm => nm.toLowerCase().trim() === entry.account.toLowerCase().trim()));
                                if (crEntry) oppositeAccountName = crEntry.account;
                            } else if (e.creditAmount > 0) {
                                const drEntry = v.entries.find(entry => entry.debitAmount > 0 && entry.account && !nameMatches.some(nm => nm.toLowerCase().trim() === entry.account.toLowerCase().trim()));
                                if (drEntry) oppositeAccountName = drEntry.account;
                            }
                            if (oppositeAccountName) description = oppositeAccountName;
                        }
                    });
                }
            }

            if (debit > 0 || credit > 0) {
                transactions.push({
                    _id: v._id,
                    date: v.date,
                    createdAt: v.createdAt,
                    type: v.voucherType,
                    refNo: `VCH-${refNo}`,
                    description,
                    debit,
                    credit,
                    source: 'voucher',
                    narration: v.narration || ''
                });
            }
        });

        // 2. Process Trips
        trips.forEach(t => {
            const vNo = t.vehicle?.registrationNumber || t.vehicle?.vehicleNumber || '';
            // A) Sales
            if (t.sales && t.sales.length > 0) {
                t.sales.forEach((s, sIdx) => {
                    const clientMatch = s.client && getObjectIdStr(s.client) === id.toString();
                    const cashMatch = s.cashLedger && getObjectIdStr(s.cashLedger) === id.toString();
                    const onlineMatch = s.onlineLedger && getObjectIdStr(s.onlineLedger) === id.toString();

                    if (clientMatch) {
                        if ((s.amount || 0) > 0) {
                            transactions.push({
                                _id: `${t._id}_sale_${sIdx}`,
                                date: t.date || t.createdAt,
                                createdAt: t.createdAt,
                                type: 'Sale',
                                refNo: s.billNumber || t.tripId || '-',
                                description: `Trip Bill: ${s.billNumber || ''} (${s.birds || 0} birds, ${s.weight || 0} kg @ ₹${s.rate || 0})`,
                                debit: s.amount || 0,
                                credit: 0,
                                source: 'trip',
                                narration: s.narration || (t.tripId ? `Trip: ${t.tripId}` : '')
                            });
                        }
                        const paymentAmt = (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                        if (paymentAmt > 0) {
                            transactions.push({
                                _id: `${t._id}_rec_${sIdx}`,
                                date: t.date || t.createdAt,
                                createdAt: t.createdAt,
                                type: 'Receipt',
                                refNo: s.billNumber || t.tripId || '-',
                                description: `Payment for Bill: ${s.billNumber || ''}${s.discount ? ` (incl. ₹${s.discount} disc)` : ''}`,
                                debit: 0,
                                credit: paymentAmt,
                                source: 'trip',
                                narration: s.narration || (t.tripId ? `Trip: ${t.tripId}` : '')
                            });
                        }
                    }

                    if (cashMatch && (s.cashPaid || 0) > 0) {
                        transactions.push({
                            _id: `${t._id}_cash_${sIdx}`,
                            date: t.date || t.createdAt,
                            createdAt: t.createdAt,
                            type: 'Receipt',
                            refNo: t.tripId,
                            description: `Trip Bill: ${s.billNumber} (${s.birds} birds) - ${s.client?.shopName || s.client?.ownerName || s.product || 'Bird Sale'}`,
                            debit: s.cashPaid || 0,
                            credit: 0,
                            source: 'trip',
                            narration: t.tripId ? `Trip: ${t.tripId}` : ''
                        });
                    }
                    if (onlineMatch && (s.onlinePaid || 0) > 0) {
                        transactions.push({
                            _id: `${t._id}_online_${sIdx}`,
                            date: t.date || t.createdAt,
                            createdAt: t.createdAt,
                            type: 'Receipt',
                            refNo: t.tripId,
                            description: `Trip Bill: ${s.billNumber} (${s.birds} birds) - ${s.client?.shopName || s.client?.ownerName || s.product || 'Bird Sale'}`,
                            debit: s.onlinePaid || 0,
                            credit: 0,
                            source: 'trip',
                            narration: t.tripId ? `Trip: ${t.tripId}` : ''
                        });
                    }
                });
            }

            // B) Purchases (for Vendor)
            if (t.purchases && t.purchases.length > 0) {
                t.purchases.forEach((p, pIdx) => {
                    const supplierMatch = p.supplier && getObjectIdStr(p.supplier) === id.toString();
                    if (supplierMatch && (p.amount || 0) > 0) {
                        transactions.push({
                            _id: `${t._id}_pur_${pIdx}`,
                            date: t.date || t.createdAt,
                            createdAt: t.createdAt,
                            type: 'Purchase',
                            refNo: p.dcNumber || t.tripId || '-',
                            description: `Birds Purchase: ${p.birds || 0} birds, ${p.weight || 0} kg @ ₹${p.rate || 0}${vNo ? ` (${vNo})` : ''}`,
                            debit: 0,
                            credit: p.amount || 0,
                            source: 'trip',
                            narration: t.tripId ? `Trip: ${t.tripId}` : ''
                        });
                    }
                });
            }

            // C) Diesel Stations
            if (t.diesel && t.diesel.stations && t.diesel.stations.length > 0) {
                t.diesel.stations.forEach((s, sIdx) => {
                    const stationMatch = (s.dieselStation && getObjectIdStr(s.dieselStation) === id.toString()) ||
                        (subjectType === 'dieselStation' && s.stationName && s.stationName.toLowerCase().trim() === subjectNameStr);
                    const paymentLedgerMatch = s.paymentLedger && getObjectIdStr(s.paymentLedger) === id.toString();

                    if (stationMatch && (s.amount || 0) > 0) {
                        transactions.push({
                            _id: `${t._id}_diesel_${sIdx}`,
                            date: t.date || t.createdAt,
                            createdAt: s.timestamp || t.createdAt || t.date,
                            type: 'Purchase',
                            refNo: s.indentNumber || s.receipt || t.tripId || '-',
                            description: `Diesel Purchase: ${s.volume || 0}L @ ₹${s.rate || 0}${vNo ? ` (${vNo})` : ''}`,
                            debit: 0,
                            credit: s.amount || 0,
                            source: 'trip',
                            narration: s.narration || (t.tripId ? `Trip: ${t.tripId}` : '')
                        });
                    }

                    if (paymentLedgerMatch && (s.amount || 0) > 0) {
                        transactions.push({
                            _id: `${t._id}_diesel_pay_${sIdx}`,
                            date: t.date || t.createdAt,
                            createdAt: s.timestamp || t.createdAt || t.date,
                            type: 'Payment',
                            refNo: s.indentNumber || s.receipt || t.tripId || '-',
                            description: `Diesel Expense: ${s.stationName || s.name || 'Diesel Station'} (${s.volume || 0}L)`,
                            debit: 0,
                            credit: s.amount || 0,
                            source: 'trip',
                            narration: s.narration || (t.tripId ? `Trip: ${t.tripId}` : '')
                        });
                    }
                });
            }
        });

        // 3. Process Inventory Stocks
        stocks.forEach(s => {
            let debit = 0;
            let credit = 0;
            let isRelevant = false;

            const sLedgerId = s.ledgerId?._id || s.ledgerId;
            const sVendorId = s.vendorId?._id || s.vendorId;
            const sCustomerId = s.customerId?._id || s.customerId;
            if ((sLedgerId && getObjectIdStr(sLedgerId) === id.toString()) ||
                (sVendorId && getObjectIdStr(sVendorId) === id.toString()) ||
                (sCustomerId && getObjectIdStr(sCustomerId) === id.toString())) {
                if (s.type === 'purchase' || s.inventoryType === 'feed') {
                    credit += s.amount || 0;
                    debit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                    isRelevant = true;
                } else if (s.type === 'sale') {
                    debit += s.amount || 0;
                    credit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                    isRelevant = true;
                }
            }

            // Cash Payment
            if (s.cashLedgerId && getObjectIdStr(s.cashLedgerId) === id.toString()) {
                debit += s.cashPaid || 0;
                isRelevant = true;
            }

            // Online Payment
            if (s.onlineLedgerId && getObjectIdStr(s.onlineLedgerId) === id.toString()) {
                debit += s.onlinePaid || 0;
                isRelevant = true;
            }

            // Expense (Feed Consume, etc.)
            if (s.expenseLedgerId && getObjectIdStr(s.expenseLedgerId) === id.toString()) {
                debit += s.amount || 0;
                isRelevant = true;
            }

            if (isRelevant && (debit > 0 || credit > 0)) {
                let vchType = 'Journal';
                let vchDesc = '';
                if (s.type === 'purchase' || s.inventoryType === 'feed') {
                    vchType = 'Purchase';
                    const parts = [];
                    if (s.bags) parts.push(`${s.bags} bags`);
                    if (s.weight || s.feedQty) parts.push(`${s.weight || s.feedQty} kg`);
                    if (s.rate) parts.push(`@ ₹${s.rate}`);
                    vchDesc = `Feed Purchase${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
                } else if (s.type === 'receipt') {
                    vchType = 'Receipt';
                    vchDesc = `STOCK_RECEIPT_BILL - ${s.customerId?.shopName || s.customerId?.ownerName || 'Customer'}`;
                } else if (s.type === 'consume') {
                    vchType = 'Journal';
                    vchDesc = 'FEED CONSUMPTION';
                } else if (s.type === 'sale') {
                    vchType = 'Receipt';
                    vchDesc = `STOCK_BILL - ${s.customerId?.shopName || s.customerId?.ownerName || 'Customer'} (${s.birds || 0} birds)`;
                } else {
                    vchType = 'Stock Sale';
                    vchDesc = `STOCK_BILL - ${s.customerId?.shopName || s.customerId?.ownerName || 'Customer'} (${s.birds || 0} birds)`;
                }

                transactions.push({
                    _id: s._id,
                    date: s.date || s.createdAt,
                    createdAt: s.createdAt,
                    type: vchType,
                    refNo: s.billNumber || s.refNo || '-',
                    description: vchDesc,
                    narration: s.narration || s.notes || '',
                    debit,
                    credit,
                    source: 'stock'
                });
            }
        });

        // 4. Calculate Opening Balance
        let openingBalance = ledger.openingBalance || 0;
        let openingType = ledger.openingBalanceType || (subjectType === 'customer' ? 'debit' : 'credit');
        let signedOpening = toSignedValue(openingBalance, openingType);

        if (queryStartDate) {
            const preVoucherQuery = {
                isActive: true,
                date: { $lt: queryStartDate },
                $or: voucherConditions
            };

            const preTripQuery = {
                date: { $lt: queryStartDate },
                $or: tripConditions
            };

            const stackQuery = {
                date: { $lt: queryStartDate },
                $or: [
                    { 'ledgerId': id },
                    { 'vendorId': id },
                    { 'customerId': id },
                    { 'cashLedgerId': id },
                    { 'onlineLedgerId': id },
                    { 'expenseLedgerId': id }
                ]
            };

            const [preVouchers, preTrips, preStocks] = await Promise.all([
                Voucher.find(preVoucherQuery).lean().select('voucherType date account parties entries isMultiPartyDisplay createdAt'),
                Trip.find(preTripQuery).lean().select('sales purchases diesel date createdAt'),
                InventoryStock.find(stackQuery).lean().select('ledgerId vendorId customerId inventoryType type amount discount cashLedgerId onlineLedgerId cashPaid onlinePaid expenseLedgerId')
            ]);

            preVouchers.forEach(v => {
                let debit = 0;
                let credit = 0;
                const isPaymentReceipt = v.voucherType === 'Payment' || v.voucherType === 'Receipt';
                if (isPaymentReceipt) {
                    if (v.account && getObjectIdStr(v.account) === id.toString()) {
                        const total = (v.parties || []).reduce((s, p) => s + (p.amount || 0), 0);
                        if (v.voucherType === 'Payment') credit += total;
                        else debit += total;
                    }
                    if (v.parties) {
                        v.parties.forEach(p => {
                            if (p.partyId && getObjectIdStr(p.partyId) === id.toString()) {
                                const pAmount = p.amount || 0;
                                if (subjectType === 'customer') {
                                    if (v.voucherType === 'Receipt') credit += pAmount;
                                    else debit += pAmount;
                                } else {
                                    if (v.voucherType === 'Payment') debit += pAmount;
                                    else credit += pAmount;
                                }
                            }
                        });
                    }
                    if (debit === 0 && credit === 0 && v.entries && v.entries.length > 0) {
                        v.entries.forEach(e => {
                            const accName = e.account ? e.account.toLowerCase().trim() : '';
                            if (nameMatches.some(nm => nm && nm.toLowerCase().trim() === accName)) {
                                debit += e.debitAmount || 0;
                                credit += e.creditAmount || 0;
                            }
                        });
                    }
                } else {
                    (v.entries || []).forEach(e => {
                        const accName = e.account ? e.account.toLowerCase().trim() : '';
                        if (nameMatches.some(nm => nm && nm.toLowerCase().trim() === accName) || (e.account && e.account.toString() === id.toString())) {
                            debit += e.debitAmount || 0;
                            credit += e.creditAmount || 0;
                        }
                    });
                }
                signedOpening += (debit - credit);
            });

            preTrips.forEach(t => {
                if (t.sales) {
                    t.sales.forEach(s => {
                        if (s.client && getObjectIdStr(s.client) === id.toString()) {
                            signedOpening += (s.amount || 0);
                            signedOpening -= ((s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0));
                        }
                        if (s.cashLedger && getObjectIdStr(s.cashLedger) === id.toString()) signedOpening += (s.cashPaid || 0);
                        if (s.onlineLedger && getObjectIdStr(s.onlineLedger) === id.toString()) signedOpening += (s.onlinePaid || 0);
                    });
                }
                if (t.purchases) {
                    t.purchases.forEach(p => {
                        if (p.supplier && getObjectIdStr(p.supplier) === id.toString()) {
                            signedOpening -= (p.amount || 0);
                        }
                    });
                }
                if (t.diesel && t.diesel.stations) {
                    t.diesel.stations.forEach(s => {
                        const stationMatch = (s.dieselStation && getObjectIdStr(s.dieselStation) === id.toString()) ||
                            (subjectType === 'dieselStation' && s.stationName && s.stationName.toLowerCase().trim() === subjectNameStr);
                        if (stationMatch) {
                            signedOpening -= (s.amount || 0);
                        }
                        if (s.paymentLedger && getObjectIdStr(s.paymentLedger) === id.toString()) {
                            signedOpening -= (s.amount || 0);
                        }
                    });
                }
            });

            preStocks.forEach(s => {
                let debit = 0;
                let credit = 0;
                const sLedgerId = s.ledgerId?._id || s.ledgerId;
                const sVendorId = s.vendorId?._id || s.vendorId;
                const sCustomerId = s.customerId?._id || s.customerId;
                if ((sLedgerId && getObjectIdStr(sLedgerId) === id.toString()) ||
                    (sVendorId && getObjectIdStr(sVendorId) === id.toString()) ||
                    (sCustomerId && getObjectIdStr(sCustomerId) === id.toString())) {
                    if (s.type === 'purchase' || s.inventoryType === 'feed') {
                        credit += s.amount || 0;
                        debit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                    } else if (s.type === 'sale') {
                        debit += s.amount || 0;
                        credit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                    }
                }
                if (s.cashLedgerId && getObjectIdStr(s.cashLedgerId) === id.toString()) debit += s.cashPaid || 0;
                if (s.onlineLedgerId && getObjectIdStr(s.onlineLedgerId) === id.toString()) debit += s.onlinePaid || 0;
                if (s.expenseLedgerId && getObjectIdStr(s.expenseLedgerId) === id.toString()) debit += s.amount || 0;
                signedOpening += (debit - credit);
            });
        }

        // 5. Sort transactions chronologically
        transactions.sort((a, b) => {
            const timeA = new Date(a.date || a.createdAt || 0).getTime();
            const timeB = new Date(b.date || b.createdAt || 0).getTime();
            if (timeA !== timeB) return timeA - timeB;
            const createA = new Date(a.createdAt || 0).getTime();
            const createB = new Date(b.createdAt || 0).getTime();
            return createA - createB;
        });

        // 6. Calculate Running Balance
        let currentBalance = signedOpening;
        transactions = transactions.map(t => {
            currentBalance += (t.debit - t.credit);
            const formatted = fromSignedValue(currentBalance);
            return {
                ...t,
                runningBalance: formatted.amount,
                runningBalanceType: formatted.type
            };
        });

        // 7. Final Opening Balance for Display (at queryStartDate)
        const displayOpening = fromSignedValue(signedOpening);

        // Add Opening Balance Entry
        transactions.unshift({
            _id: 'op_bal',
            date: queryStartDate || getFinancialYearStartDate(ledger.createdAt),
            type: 'OPENING',
            refNo: '-',
            description: 'OP',
            debit: 0,
            credit: 0,
            runningBalance: displayOpening.amount,
            runningBalanceType: displayOpening.type
        });

        successResponse(res, "Ledger transactions retrieved", 200, {
            ledger: {
                _id: ledger._id,
                name: subjectName,
                group: ledgerGroup
            },
            openingBalance: displayOpening.amount,
            openingBalanceType: displayOpening.type,
            transactions,
            closingBalance: transactions.length > 0 ? transactions[transactions.length - 1].runningBalance : displayOpening.amount,
            closingBalanceType: transactions.length > 0 ? transactions[transactions.length - 1].runningBalanceType : displayOpening.type
        });

    } catch (error) {
        next(error);
    }
};

export const getPurchaseSalesReport = async (req, res, next) => {
    const { id } = req.params;
    const { startDate, endDate, vehicleNo, driver, gstNo, panNo } = req.query;

    try {
        const ledger = await Ledger.findById(id).populate('group');
        if (!ledger) {
            throw new AppError('Ledger not found', 404);
        }

        const groupName = ledger.group ? ledger.group.name.toLowerCase() : '';
        const isPurchase = groupName.includes('purchase');
        const isSales = groupName.includes('sales');

        if (!isPurchase && !isSales) {
            throw new AppError('This ledger is not a Purchase or Sales Account', 400);
        }

        const reportData = [];

        // Helpers to display GST/PAN consistently when a customer stores either value.
        const extractPanFromGst = (gst) => {
            if (!gst) return '-';
            const cleanGst = gst.trim().toUpperCase();
            if (cleanGst.length === 15) {
                return cleanGst.substring(2, 12);
            }
            return '-';
        };

        const splitGstOrPan = (value) => {
            if (!value) return { gstNo: '-', panNo: '-' };
            const cleanValue = value.trim().toUpperCase();
            if (cleanValue.length === 15) {
                return { gstNo: cleanValue, panNo: extractPanFromGst(cleanValue) };
            }
            if (cleanValue.length === 10) {
                return { gstNo: '-', panNo: cleanValue };
            }
            return { gstNo: cleanValue, panNo: '-' };
        };

        if (isPurchase) {
            // 1. Fetch Trips (Purchases)
            const tripQuery = {
                status: { $in: ['completed', 'ongoing'] }
            };
            if (startDate || endDate) {
                tripQuery.date = {};
                if (startDate) tripQuery.date.$gte = new Date(startDate);
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    tripQuery.date.$lte = end;
                }
            }
            const trips = await Trip.find(tripQuery)
                .populate('vehicle', 'vehicleNumber')
                .populate('purchases.supplier', 'vendorName companyName gstNumber panNumber')
                .lean();

            trips.forEach(trip => {
                if (trip.purchases) {
                    trip.purchases.forEach((p, idx) => {
                        const supplier = p.supplier;
                        if (!supplier) return;

                        const supGst = supplier.gstNumber || '-';
                        const supPan = supplier.panNumber || extractPanFromGst(supplier.gstNumber);

                        reportData.push({
                            id: `trip_pur_${trip._id}_${idx}`,
                            date: trip.date,
                            particulars: supplier.companyName || supplier.vendorName || '-',
                            birds: p.birds || 0,
                            avg: p.birds > 0 ? Number((p.weight / p.birds).toFixed(2)) : 0,
                            weight: p.weight || 0,
                            rate: p.rate || 0,
                            amount: p.amount || 0,
                            details: trip.tripId || '-',
                            vehicleNo: trip.vehicle?.vehicleNumber || '-',
                            driver: trip.driver || '-',
                            gstNo: supGst,
                            panNo: supPan
                        });
                    });
                }
            });

            // 2. Fetch Inventory Stocks (Purchases)
            const stockQuery = { type: 'purchase' };
            if (startDate || endDate) {
                stockQuery.date = {};
                if (startDate) stockQuery.date.$gte = new Date(startDate);
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    stockQuery.date.$lte = end;
                }
            }
            const stocks = await InventoryStock.find(stockQuery)
                .populate('vehicleId', 'vehicleNumber')
                .populate('vendorId', 'vendorName companyName gstNumber panNumber')
                .lean();

            stocks.forEach(stock => {
                const vendor = stock.vendorId;
                const vName = vendor ? (vendor.companyName || vendor.vendorName) : '-';
                const vGst = vendor ? vendor.gstNumber || '-' : '-';
                const vPan = vendor ? vendor.panNumber || extractPanFromGst(vendor.gstNumber) : '-';

                reportData.push({
                    id: `stock_pur_${stock._id}`,
                    date: stock.date,
                    particulars: vName,
                    birds: stock.birds || 0,
                    avg: stock.birds > 0 ? Number((stock.weight / stock.birds).toFixed(2)) : 0,
                    weight: stock.weight || 0,
                    rate: stock.rate || 0,
                    amount: stock.amount || 0,
                    details: 'STOCK PUR',
                    vehicleNo: stock.vehicleNumber || stock.vehicleId?.vehicleNumber || '-',
                    driver: '-',
                    gstNo: vGst,
                    panNo: vPan
                });
            });

            // 3. Fetch Indirect Sales (Purchase side)
            const indirectQuery = { isActive: true };
            if (startDate || endDate) {
                indirectQuery.date = {};
                if (startDate) indirectQuery.date.$gte = new Date(startDate);
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    indirectQuery.date.$lte = end;
                }
            }
            const indirectSales = await IndirectSale.find(indirectQuery)
                .populate('vendor', 'vendorName gstNumber panNumber')
                .lean();

            indirectSales.forEach(sale => {
                const vendor = sale.vendor;
                if (!vendor) return;

                const vGst = vendor.gstNumber || '-';
                const vPan = vendor.panNumber || extractPanFromGst(vendor.gstNumber);

                const amt = sale.summary?.totalPurchaseAmount || 0;
                const birds = sale.summary?.totalPurchaseBirds || 0;
                const wt = sale.summary?.totalPurchaseWeight || 0;

                reportData.push({
                    id: `indirect_pur_${sale._id}`,
                    date: sale.date,
                    particulars: vendor.vendorName || '-',
                    birds: birds,
                    avg: birds > 0 ? Number((wt / birds).toFixed(2)) : 0,
                    weight: wt,
                    rate: wt > 0 ? Number((amt / wt).toFixed(2)) : 0,
                    amount: amt,
                    details: 'INDIRECT PUR',
                    vehicleNo: sale.vehicleNumber || '-',
                    driver: sale.driver || '-',
                    gstNo: vGst,
                    panNo: vPan
                });
            });
        } else if (isSales) {
            // 1. Fetch Trips (Sales)
            const tripQuery = {
                status: { $in: ['completed', 'ongoing'] }
            };
            if (startDate || endDate) {
                tripQuery.date = {};
                if (startDate) tripQuery.date.$gte = new Date(startDate);
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    tripQuery.date.$lte = end;
                }
            }
            const trips = await Trip.find(tripQuery)
                .populate('vehicle', 'vehicleNumber')
                .populate('sales.client', 'shopName ownerName gstOrPanNumber')
                .lean();

            trips.forEach(trip => {
                if (trip.sales) {
                    trip.sales.forEach((s, idx) => {
                        if (s.isReceipt || (!(s.birds > 0) && !(s.weight > 0) && !(s.amount > 0))) return;

                        const client = s.client;
                        if (!client) return;

                        const clientName = client.shopName || client.ownerName || '-';
                        const { gstNo: clientGst, panNo: clientPan } = splitGstOrPan(client.gstOrPanNumber);

                        reportData.push({
                            id: `trip_sale_${trip._id}_${idx}`,
                            date: trip.date,
                            particulars: clientName,
                            birds: s.birds || 0,
                            avg: s.birds > 0 ? Number((s.weight / s.birds).toFixed(2)) : 0,
                            weight: s.weight || 0,
                            rate: s.rate || 0,
                            amount: s.amount || 0,
                            details: trip.tripId || '-',
                            vehicleNo: trip.vehicle?.vehicleNumber || '-',
                            driver: trip.driver || '-',
                            gstNo: clientGst,
                            panNo: clientPan
                        });
                    });
                }
            });

            // 2. Fetch Inventory Stocks (Sales)
            const stockQuery = { type: 'sale' };
            if (startDate || endDate) {
                stockQuery.date = {};
                if (startDate) stockQuery.date.$gte = new Date(startDate);
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    stockQuery.date.$lte = end;
                }
            }
            const stocks = await InventoryStock.find(stockQuery)
                .populate('vehicleId', 'vehicleNumber')
                .populate('customerId', 'shopName ownerName gstOrPanNumber')
                .lean();

            stocks.forEach(stock => {
                const customer = stock.customerId;
                const cName = customer ? customer.shopName || customer.ownerName : '-';
                const { gstNo: cGst, panNo: cPan } = splitGstOrPan(customer?.gstOrPanNumber);

                reportData.push({
                    id: `stock_sale_${stock._id}`,
                    date: stock.date,
                    particulars: cName,
                    birds: stock.birds || 0,
                    avg: stock.birds > 0 ? Number((stock.weight / stock.birds).toFixed(2)) : 0,
                    weight: stock.weight || 0,
                    rate: stock.rate || 0,
                    amount: stock.amount || 0,
                    details: 'STOCK SALES',
                    vehicleNo: stock.vehicleNumber || stock.vehicleId?.vehicleNumber || '-',
                    driver: '-',
                    gstNo: cGst,
                    panNo: cPan
                });
            });

            // 3. Fetch Indirect Sales
            const indirectQuery = { isActive: true };
            if (startDate || endDate) {
                indirectQuery.date = {};
                if (startDate) indirectQuery.date.$gte = new Date(startDate);
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    indirectQuery.date.$lte = end;
                }
            }
            const indirectSales = await IndirectSale.find(indirectQuery)
                .populate('customer', 'shopName ownerName gstOrPanNumber')
                .lean();

            indirectSales.forEach(sale => {
                const customer = sale.customer;
                if (!customer) return;

                const { gstNo: cGst, panNo: cPan } = splitGstOrPan(customer.gstOrPanNumber);

                const amt = sale.sales?.amount || 0;
                const birds = sale.sales?.birds || 0;
                const wt = sale.sales?.weight || 0;

                reportData.push({
                    id: `indirect_sale_${sale._id}`,
                    date: sale.date,
                    particulars: customer.shopName || customer.ownerName || '-',
                    birds: birds,
                    avg: birds > 0 ? Number((wt / birds).toFixed(2)) : 0,
                    weight: wt,
                    rate: wt > 0 ? Number((amt / wt).toFixed(2)) : 0,
                    amount: amt,
                    details: 'INDIRECT SALES',
                    vehicleNo: sale.vehicleNumber || '-',
                    driver: sale.driver || '-',
                    gstNo: cGst,
                    panNo: cPan
                });
            });
        }

        // Apply filters
        let filteredData = reportData;

        if (vehicleNo) {
            const vFilter = vehicleNo.trim().toLowerCase();
            filteredData = filteredData.filter(item => item.vehicleNo.toLowerCase().includes(vFilter));
        }

        if (driver) {
            const dFilter = driver.trim().toLowerCase();
            filteredData = filteredData.filter(item => item.driver.toLowerCase().includes(dFilter));
        }

        if (gstNo) {
            const gFilter = gstNo.trim().toLowerCase();
            filteredData = filteredData.filter(item => item.gstNo.toLowerCase().includes(gFilter));
        }

        if (panNo) {
            const pFilter = panNo.trim().toLowerCase();
            filteredData = filteredData.filter(item => item.panNo.toLowerCase().includes(pFilter));
        }

        // Sort chronologically by date
        filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));

        successResponse(res, "Purchase/Sales report fetched successfully", 200, {
            ledgerName: ledger.name,
            groupName: ledger.group?.name || '',
            isPurchase,
            transactions: filteredData
        });
    } catch (error) {
        next(error);
    }
};


