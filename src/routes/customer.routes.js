import express from 'express';
const router = express.Router();

import * as customerController from '../controllers/customer.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

// Admin routes (using Customer ID)
router.post('/', authenticateToken, authorize(["admin", "superadmin"]), customerController.addCustomer);
router.get('/', authenticateToken, authorize(["admin", "superadmin", "supervisor"]), customerController.getCustomers);
router.get('/admin/:id', authenticateToken, authorize(["admin", "superadmin", "supervisor"]), customerController.getCustomerById);
router.put('/admin/:id', authenticateToken, authorize(["admin", "superadmin"]), customerController.updateCustomer);
router.delete('/admin/:id', authenticateToken, authorize(["admin", "superadmin"]), customerController.deleteCustomer);

// Customer panel routes (using User ID)
router.get('/panel/:id/sales', authenticateToken, authorize(["admin", "superadmin", "customer", "supervisor"]), customerController.getCustomerSales);
router.get('/panel/:id/profile', authenticateToken, authorize(["admin", "superadmin", "customer", "supervisor"]), customerController.getCustomerProfile);
router.put('/panel/:id/profile', authenticateToken, authorize(["admin", "superadmin", "customer"]), customerController.updateCustomerProfile);
router.get('/panel/:id/dashboard-stats', authenticateToken, authorize(["admin", "superadmin", "customer"]), customerController.getCustomerDashboardStats);
router.get('/panel/:id/purchase-ledger', authenticateToken, authorize(["admin", "superadmin", "customer"]), customerController.getCustomerPurchaseLedger);
router.get('/panel/:id/payments', authenticateToken, authorize(["admin", "superadmin", "customer"]), customerController.getCustomerPayments);
router.put('/panel/:id/password', authenticateToken, authorize(["admin", "superadmin", "customer"]), customerController.updateCustomerPassword);
router.get('/panel/:id/opening-balance', authenticateToken, authorize(["admin", "superadmin", "customer", "supervisor"]), customerController.getCustomerOpeningBalance);
router.put('/:customerId/opening-balance', authenticateToken, authorize(["admin", "superadmin", "supervisor"]), customerController.updateCustomerOpeningBalance);

export default router;