import express from 'express';
const router = express.Router();

import * as customerController from '../controllers/customer.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

router.post('/', authenticateToken, authorize(["admin", "superadmin"]), customerController.addCustomer);
router.get('/', authenticateToken, authorize(["admin", "superadmin", "supervisor"]), customerController.getCustomers);
router.get('/:id', authenticateToken, authorize(["admin", "superadmin", "supervisor"]), customerController.getCustomerById);
router.put('/:id', authenticateToken, authorize(["admin", "superadmin"]), customerController.updateCustomer);
router.delete('/:id', authenticateToken, authorize(["admin", "superadmin"]), customerController.deleteCustomer);

export default router;