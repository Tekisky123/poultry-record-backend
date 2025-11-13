import Group from "../models/Group.js";
import Ledger from "../models/Ledger.js";
import { successResponse } from "../utils/responseHandler.js";
import AppError from "../utils/AppError.js";

// Helper function to check for circular references
const checkCircularReference = async (groupId, parentGroupId) => {
    if (!parentGroupId) return true;
    
    // Convert to string for comparison, handle null groupId (for new groups)
    const groupIdStr = groupId ? groupId.toString() : null;
    const parentGroupIdStr = parentGroupId.toString();
    
    if (groupIdStr && groupIdStr === parentGroupIdStr) {
        throw new AppError('A group cannot be its own parent', 400);
    }

    let currentParentId = parentGroupId;
    const visited = new Set();
    
    // Only add groupId to visited set if it exists (not null for new groups)
    if (groupIdStr) {
        visited.add(groupIdStr);
    }

    while (currentParentId) {
        const currentParentIdStr = currentParentId.toString();
        if (visited.has(currentParentIdStr)) {
            throw new AppError('Circular reference detected. This would create an infinite loop.', 400);
        }
        visited.add(currentParentIdStr);

        const parent = await Group.findById(currentParentId);
        if (!parent) break;
        currentParentId = parent.parentGroup;
    }

    return true;
};

export const addGroup = async (req, res, next) => {
    try {
        const { name, type, parentGroup } = req.body;

        // Validate parent group exists if provided
        if (parentGroup) {
            const parent = await Group.findById(parentGroup);
            if (!parent || !parent.isActive) {
                throw new AppError('Parent group not found or inactive', 404);
            }
            // Check for circular reference
            await checkCircularReference(null, parentGroup);
        }

        const groupData = {
            name,
            type,
            parentGroup: parentGroup || null,
            createdBy: req.user._id,
            updatedBy: req.user._id
        };

        const group = new Group(groupData);
        await group.save();

        const populatedGroup = await Group.findById(group._id)
            .populate('parentGroup', 'name type')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "New group added", 201, populatedGroup);
    } catch (error) {
        next(error);
    }
};

export const getGroups = async (req, res, next) => {
    try {
        const { type } = req.query;
        const query = { isActive: true };
        
        if (type) {
            query.type = type;
        }

        const groups = await Group.find(query)
            .populate('parentGroup', 'name type')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .sort({ name: 1 });

        successResponse(res, "Groups retrieved successfully", 200, groups);
    } catch (error) {
        next(error);
    }
};

export const getGroupById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const group = await Group.findOne({ _id: id, isActive: true })
            .populate('parentGroup', 'name type')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        if (!group) {
            throw new AppError('Group not found', 404);
        }

        // Get child groups
        const childGroups = await Group.find({ parentGroup: id, isActive: true })
            .populate('parentGroup', 'name type')
            .select('name type parentGroup');

        // Get ledgers in this group
        const ledgers = await Ledger.find({ group: id, isActive: true })
            .populate('vendor', 'vendorName')
            .populate('customer', 'shopName')
            .select('name ledgerType vendor customer');

        const groupData = {
            ...group.toObject(),
            childGroups,
            ledgers
        };

        successResponse(res, "Group retrieved successfully", 200, groupData);
    } catch (error) {
        next(error);
    }
};

export const updateGroup = async (req, res, next) => {
    const { id } = req.params;
    try {
        const { name, type, parentGroup } = req.body;

        const group = await Group.findById(id);
        if (!group || !group.isActive) {
            throw new AppError('Group not found', 404);
        }

        // Prevent editing predefined groups (optional - can be removed if needed)
        // if (group.isPredefined && (name !== group.name || type !== group.type)) {
        //     throw new AppError('Cannot modify name or type of predefined groups', 400);
        // }

        // Validate parent group if provided
        if (parentGroup) {
            if (parentGroup.toString() === id) {
                throw new AppError('A group cannot be its own parent', 400);
            }
            const parent = await Group.findById(parentGroup);
            if (!parent || !parent.isActive) {
                throw new AppError('Parent group not found or inactive', 404);
            }
            // Check for circular reference
            await checkCircularReference(id, parentGroup);
        }

        const updateData = {
            ...(name && { name }),
            ...(type && { type }),
            parentGroup: parentGroup !== undefined ? (parentGroup || null) : group.parentGroup,
            updatedBy: req.user._id
        };

        const updatedGroup = await Group.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('parentGroup', 'name type')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        successResponse(res, "Group updated successfully", 200, updatedGroup);
    } catch (error) {
        next(error);
    }
};

export const deleteGroup = async (req, res, next) => {
    const { id } = req.params;
    try {
        const group = await Group.findById(id);
        if (!group || !group.isActive) {
            throw new AppError('Group not found', 404);
        }

        // Check if group has child groups
        const childGroups = await Group.countDocuments({ parentGroup: id, isActive: true });
        if (childGroups > 0) {
            throw new AppError('Cannot delete group with child groups. Please delete or move child groups first.', 400);
        }

        // Check if group has ledgers
        const ledgersCount = await Ledger.countDocuments({ group: id, isActive: true });
        if (ledgersCount > 0) {
            throw new AppError('Cannot delete group with ledgers. Please delete or move ledgers first.', 400);
        }

        // Soft delete
        const deletedGroup = await Group.findByIdAndUpdate(
            id,
            { isActive: false, updatedBy: req.user._id },
            { new: true }
        );

        successResponse(res, "Group deleted successfully", 200, deletedGroup);
    } catch (error) {
        next(error);
    }
};

export const getGroupsByType = async (req, res, next) => {
    const { type } = req.params;
    try {
        const validTypes = ['Liability', 'Assets', 'Expenses', 'Income'];
        if (!validTypes.includes(type)) {
            throw new AppError('Invalid group type', 400);
        }

        const groups = await Group.find({ type, isActive: true })
            .populate('parentGroup', 'name type')
            .sort({ name: 1 });

        successResponse(res, `Groups of type ${type} retrieved successfully`, 200, groups);
    } catch (error) {
        next(error);
    }
};

