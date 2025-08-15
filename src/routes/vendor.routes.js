import express from 'express';
const router = express.Router();

import * as vendorController from '../controllers/vendor.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

router.post('/', authenticateToken, authorize(["admin"]), vendorController.addVendor);
router.get('/', authenticateToken, authorize(["admin"]), vendorController.getVendors);
router.get('/:id', authenticateToken, authorize(["admin"]), vendorController.getVendorById);

export default router;