import IndirectSale from '../models/IndirectSale.js';
import Customer from '../models/Customer.js';
import Vendor from '../models/Vendor.js';
import AppError from '../utils/AppError.js';
import { successResponse } from '../utils/responseHandler.js';
import mongoose from 'mongoose';

const roundNumber = (value, decimals = 2) => {
    if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
    return Number(Number(value).toFixed(decimals));
};

const generateInvoiceNumber = async () => {
    const lastRecord = await IndirectSale.findOne({ invoiceNumber: { $exists: true } })
        .sort({ invoiceNumber: -1 })
        .select('invoiceNumber')
        .lean();

    const lastNumber = lastRecord?.invoiceNumber
        ? parseInt(lastRecord.invoiceNumber, 10)
        : 0;

    const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
    return String(nextNumber).padStart(5, '0');
};

const buildListFilter = (query) => {
    const filter = { isActive: true };
    const conditions = [];

    if (query.customer) {
        if (!mongoose.Types.ObjectId.isValid(query.customer)) {
            throw new AppError('Invalid customer id', 400);
        }
        conditions.push({ customer: query.customer });
    }

    if (query.vendor) {
        if (!mongoose.Types.ObjectId.isValid(query.vendor)) {
            throw new AppError('Invalid vendor id', 400);
        }
        conditions.push({ vendor: query.vendor });
    }

    if (query.search) {
        const regex = new RegExp(query.search, 'i');
        conditions.push({
            $or: [
                { place: regex },
                { vehicleNumber: regex },
                { driver: regex }
            ]
        });
    }

    if (conditions.length > 0) {
        filter.$and = conditions;
    }

    return filter;
};

export const createIndirectSale = async (req, res, next) => {
    try {
        const { date, customer, vendor, place, vehicleNumber, driver, notes } = req.body;

        if (!date || !customer || !vendor) {
            throw new AppError('Date, customer and vendor are required', 400);
        }

        const customerExists = await Customer.findById(customer);
        if (!customerExists) {
            throw new AppError('Selected customer not found', 404);
        }

        const vendorExists = await Vendor.findById(vendor);
        if (!vendorExists) {
            throw new AppError('Selected vendor not found', 404);
        }

        const indirectSale = new IndirectSale({
            invoiceNumber: await generateInvoiceNumber(),
            date,
            customer,
            vendor,
            place,
            vehicleNumber,
            driver,
            notes,
            createdBy: req.user._id,
            updatedBy: req.user._id
        });

        indirectSale.recalculateSummary();

        await indirectSale.save();
        await indirectSale.populate([
            { path: 'customer', select: 'shopName ownerName contact place tdsApplicable' },
            { path: 'vendor', select: 'vendorName companyName contactNumber' },
            { path: 'createdBy', select: 'name' },
            { path: 'updatedBy', select: 'name' }
        ]);

        successResponse(res, 'Indirect purchase and sale created', 201, indirectSale);
    } catch (error) {
        next(error);
    }
};

export const getIndirectSales = async (req, res, next) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const numericLimit = Math.min(Number(limit) || 10, 50);
        const numericPage = Number(page) || 1;

        const filter = buildListFilter(req.query);

        const [data, total] = await Promise.all([
            IndirectSale.find(filter)
                .populate('customer', 'shopName ownerName place tdsApplicable')
                .populate('vendor', 'vendorName companyName')
                .sort({ date: -1, createdAt: -1 })
                .skip((numericPage - 1) * numericLimit)
                .limit(numericLimit),
            IndirectSale.countDocuments(filter)
        ]);

        successResponse(res, 'Indirect purchase and sales list', 200, {
            records: data,
            pagination: {
                totalItems: total,
                itemsPerPage: numericLimit,
                currentPage: numericPage,
                totalPages: Math.ceil(total / numericLimit)
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getIndirectSaleById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const record = await IndirectSale.findById(id)
            .populate('customer', 'shopName ownerName contact place tdsApplicable')
            .populate('vendor', 'vendorName companyName contactNumber')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        if (!record || !record.isActive) {
            throw new AppError('Indirect record not found', 404);
        }

        successResponse(res, 'Indirect purchase and sale record', 200, record);
    } catch (error) {
        next(error);
    }
};

export const updateIndirectSaleDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { date, customer, vendor, place, vehicleNumber, driver, notes, status } = req.body;

        const record = await IndirectSale.findById(id);
        if (!record || !record.isActive) {
            throw new AppError('Indirect record not found', 404);
        }

        if (customer && customer.toString() !== record.customer.toString()) {
            const customerExists = await Customer.findById(customer);
            if (!customerExists) {
                throw new AppError('Selected customer not found', 404);
            }
            record.customer = customer;
        }

        if (vendor && vendor.toString() !== record.vendor.toString()) {
            const vendorExists = await Vendor.findById(vendor);
            if (!vendorExists) {
                throw new AppError('Selected vendor not found', 404);
            }
            record.vendor = vendor;
        }

        if (date) record.date = date;
        if (place !== undefined) record.place = place;
        if (vehicleNumber !== undefined) record.vehicleNumber = vehicleNumber;
        if (driver !== undefined) record.driver = driver;
        if (notes !== undefined) record.notes = notes;
        if (status && ['draft', 'completed'].includes(status)) {
            record.status = status;
        }

        record.updatedBy = req.user._id;
        record.recalculateSummary();
        await record.save();
        await record.populate([
            { path: 'customer', select: 'shopName ownerName place' },
            { path: 'vendor', select: 'vendorName companyName' },
            { path: 'createdBy', select: 'name' },
            { path: 'updatedBy', select: 'name' }
        ]);

        successResponse(res, 'Indirect sale details updated', 200, record);
    } catch (error) {
        next(error);
    }
};

export const addPurchase = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { dcNumber, birds, weight, rate } = req.body;

        if (birds === undefined || weight === undefined || rate === undefined) {
            throw new AppError('Birds, weight and rate are required', 400);
        }

        const record = await IndirectSale.findById(id);
        if (!record || !record.isActive) {
            throw new AppError('Indirect record not found', 404);
        }

        const numericBirds = Number(birds) || 0;
        const numericWeight = Number(weight) || 0;
        const numericRate = Number(rate) || 0;

        const avg = numericBirds > 0 ? numericWeight / numericBirds : 0;
        const amount = numericWeight * numericRate;

        record.purchases.push({
            dcNumber,
            birds: roundNumber(numericBirds, 0),
            weight: roundNumber(numericWeight),
            avg: roundNumber(avg),
            rate: roundNumber(numericRate),
            amount: roundNumber(amount)
        });

        record.updatedBy = req.user._id;
        record.recalculateSummary();
        await record.save();
        await record.populate([
            { path: 'customer', select: 'shopName ownerName place tdsApplicable' },
            { path: 'vendor', select: 'vendorName companyName' }
        ]);

        successResponse(res, 'Purchase item added', 200, record);
    } catch (error) {
        next(error);
    }
};

export const updatePurchase = async (req, res, next) => {
    try {
        const { id, purchaseId } = req.params;
        const { dcNumber, birds, weight, rate } = req.body;

        const record = await IndirectSale.findById(id);
        if (!record || !record.isActive) {
            throw new AppError('Indirect record not found', 404);
        }

        const purchase = record.purchases.id(purchaseId);
        if (!purchase) {
            throw new AppError('Purchase item not found', 404);
        }

        if (dcNumber !== undefined) purchase.dcNumber = dcNumber;
        if (birds !== undefined) purchase.birds = roundNumber(Number(birds) || 0, 0);
        if (weight !== undefined) purchase.weight = roundNumber(Number(weight) || 0);
        if (rate !== undefined) purchase.rate = roundNumber(Number(rate) || 0);

        const numericBirds = purchase.birds || 0;
        const numericWeight = purchase.weight || 0;
        const numericRate = purchase.rate || 0;

        purchase.avg = roundNumber(numericBirds > 0 ? numericWeight / numericBirds : 0);
        purchase.amount = roundNumber(numericWeight * numericRate);

        record.updatedBy = req.user._id;
        record.recalculateSummary();
        await record.save();
        await record.populate([
            { path: 'customer', select: 'shopName ownerName place tdsApplicable' },
            { path: 'vendor', select: 'vendorName companyName' }
        ]);

        successResponse(res, 'Purchase item updated', 200, record);
    } catch (error) {
        next(error);
    }
};

export const deletePurchase = async (req, res, next) => {
    try {
        const { id, purchaseId } = req.params;

        const record = await IndirectSale.findById(id);
        if (!record || !record.isActive) {
            throw new AppError('Indirect record not found', 404);
        }

        const purchase = record.purchases.id(purchaseId);
        if (!purchase) {
            throw new AppError('Purchase item not found', 404);
        }

        record.purchases = record.purchases.filter(
            (item) => item._id.toString() !== purchaseId
        );
        record.updatedBy = req.user._id;
        record.recalculateSummary();
        await record.save();
        await record.populate([
            { path: 'customer', select: 'shopName ownerName place tdsApplicable' },
            { path: 'vendor', select: 'vendorName companyName' }
        ]);

        successResponse(res, 'Purchase item removed', 200, record);
    } catch (error) {
        next(error);
    }
};

export const updateMortality = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { birds } = req.body;

        if (birds === undefined) {
            throw new AppError('Mortality birds is required', 400);
        }

        const record = await IndirectSale.findById(id);
        if (!record || !record.isActive) {
            throw new AppError('Indirect record not found', 404);
        }

        record.mortality = {
            ...(record.mortality ? record.mortality.toObject() : {}),
            birds: roundNumber(Number(birds) || 0, 0)
        };

        record.updatedBy = req.user._id;
        record.recalculateSummary();
        await record.save();
        await record.populate([
            { path: 'customer', select: 'shopName ownerName place tdsApplicable' },
            { path: 'vendor', select: 'vendorName companyName' }
        ]);

        successResponse(res, 'Mortality updated', 200, record);
    } catch (error) {
        next(error);
    }
};

export const updateSales = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rate } = req.body;

        if (rate === undefined) {
            throw new AppError('Sales rate is required', 400);
        }

        const record = await IndirectSale.findById(id);
        if (!record || !record.isActive) {
            throw new AppError('Indirect record not found', 404);
        }

        const numericRate = Number(rate) || 0;
        record.sales = {
            ...(record.sales ? record.sales.toObject() : {}),
            rate: roundNumber(numericRate)
        };

        record.updatedBy = req.user._id;
        record.recalculateSummary();
        await record.save();
        await record.populate([
            { path: 'customer', select: 'shopName ownerName place tdsApplicable' },
            { path: 'vendor', select: 'vendorName companyName' }
        ]);

        successResponse(res, 'Sales updated', 200, record);
    } catch (error) {
        next(error);
    }
};

