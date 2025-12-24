import Ledger from "../models/Ledger.js";
import Group from "../models/Group.js";
import Vendor from "../models/Vendor.js";
import Customer from "../models/Customer.js";
import Trip from "../models/Trip.js";
import Voucher from "../models/Voucher.js";
import { toSignedValue, fromSignedValue } from "../utils/balanceUtils.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";
import { syncOutstandingBalance } from "../utils/balanceUtils.js";

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
            .sort({ name: 1 });

        successResponse(res, "Ledgers retrieved successfully", 200, ledgers);
    } catch (error) {
        next(error);
    }
};

export const getLedgerById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const ledger = await Ledger.findOne({ _id: id, isActive: true })
            .populate('group', 'name type slug')
            .populate('vendor', 'vendorName email contactNumber')
            .populate('customer', 'shopName contact')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

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
            .sort({ name: 1 });

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
            subject = await Customer.findById(id);
            if (subject) subjectType = 'customer';
            else {
                subject = await Vendor.findById(id);
                if (subject) subjectType = 'vendor';
                else {
                    subject = await Ledger.findById(id);
                    if (subject) subjectType = 'ledger';
                }
            }
        } else {
            if (subjectType === 'customer') subject = await Customer.findById(id);
            else if (subjectType === 'vendor') subject = await Vendor.findById(id);
            else if (subjectType === 'ledger') subject = await Ledger.findById(id);
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
                weight: 0
            });
        }

        let vouchers = await Voucher.find({ isActive: true, status: 'posted' }).lean();
        let trips = [];
        if (subjectType === 'customer') {
            trips = await Trip.find({ 'sales.client': id }).lean();
        } else if (subjectType === 'vendor') {
            trips = await Trip.find({ 'purchases.supplier': id }).lean();
        }

        let runningBalance = toSignedValue(subject.openingBalance || 0, subject.openingBalanceType || 'debit');

        const processVoucher = (v, isBeforeStart, monthIndex) => {
            let debit = 0;
            let credit = 0;

            if ((v.voucherType === 'Payment' || v.voucherType === 'Receipt') && v.parties) {
                v.parties.forEach(p => {
                    if (p.partyId && p.partyId.toString() === id.toString()) {
                        if (v.voucherType === 'Payment') {
                            debit += p.amount || 0;
                        } else {
                            credit += p.amount || 0;
                        }
                    }
                });
            } else {
                const name = subjectType === 'customer' ? (subject.shopName || subject.ownerName) :
                    subjectType === 'vendor' ? subject.vendorName : subject.name;
                v.entries.forEach(e => {
                    if ((e.account && e.account.toString() === id.toString()) ||
                        (e.accountName && e.name && e.name.toLowerCase() === name.toLowerCase())) {
                        debit += e.debitAmount || 0;
                        credit += e.creditAmount || 0;
                    }
                });
            }

            if (isBeforeStart) {
                runningBalance += (debit - credit);
            } else if (monthIndex >= 0) {
                months[monthIndex].debit += debit;
                months[monthIndex].credit += credit;
            }
        };

        const processTrip = (t, isBeforeStart, monthIndex) => {
            let debit = 0;
            let credit = 0;
            let birds = 0;
            let weight = 0;

            if (subjectType === 'customer') {
                t.sales.forEach(s => {
                    if (s.client && s.client.toString() === id.toString() && !s.isReceipt) {
                        debit += s.amount || 0;
                        credit += (s.cashPaid || 0) + (s.onlinePaid || 0) + (s.discount || 0);
                        birds += (s.birds || s.birdsCount || 0);
                        weight += s.weight || 0;
                    }
                });
            } else if (subjectType === 'vendor') {
                t.purchases.forEach(p => {
                    if (p.supplier && p.supplier.toString() === id.toString()) {
                        credit += p.amount || 0;
                        birds += p.birds || 0;
                        weight += p.weight || 0;
                    }
                });
            }

            if (isBeforeStart) {
                runningBalance += (debit - credit);
            } else if (monthIndex >= 0) {
                months[monthIndex].debit += debit;
                months[monthIndex].credit += credit;
                months[monthIndex].birds += birds;
                months[monthIndex].weight += weight;
            }
        };

        for (const v of vouchers) {
            const vDate = new Date(v.date);
            if (vDate < startDate) {
                processVoucher(v, true, -1);
            } else if (vDate < endDate) {
                const idx = months.findIndex(m => vDate >= m.startDate && vDate < m.endDate);
                if (idx !== -1) processVoucher(v, false, idx);
            }
        }

        for (const t of trips) {
            const tDate = new Date(t.createdAt);
            if (tDate < startDate) {
                processTrip(t, true, -1);
            } else if (tDate < endDate) {
                const idx = months.findIndex(m => tDate >= m.startDate && tDate < m.endDate);
                if (idx !== -1) processTrip(t, false, idx);
            }
        }

        const openingBalanceOfYear = fromSignedValue(runningBalance);
        let currentSigned = runningBalance;

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

        successResponse(res, "Monthly summary retrieved", 200, {
            subject: {
                id: subject._id,
                name: subject.name || subject.shopName || subject.vendorName,
                type: subjectType
            },
            openingBalance: openingBalanceOfYear.amount,
            openingBalanceType: openingBalanceOfYear.type,
            months: finalMonths,
            totals: {
                debit: months.reduce((acc, m) => acc + m.debit, 0),
                credit: months.reduce((acc, m) => acc + m.credit, 0),
                birds: months.reduce((acc, m) => acc + m.birds, 0),
                weight: months.reduce((acc, m) => acc + m.weight, 0)
            }
        });

    } catch (error) {
        next(error);
    }
};

