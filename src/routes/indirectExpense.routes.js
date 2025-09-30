import express from 'express';
const router = express.Router();

import * as indirectExpenseController from '../controllers/indirectExpense.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

// All routes require authentication
router.use(authenticateToken);

// CRUD operations (Admin only)
router.post('/', authorize(['admin', 'superadmin']), indirectExpenseController.addIndirectExpense);
router.get('/', authorize(['admin', 'superadmin']), indirectExpenseController.getIndirectExpenses);
router.get('/stats', authorize(['admin', 'superadmin']), indirectExpenseController.getIndirectExpenseStats);
router.get('/:id', authorize(['admin', 'superadmin']), indirectExpenseController.getIndirectExpenseById);
router.put('/:id', authorize(['admin', 'superadmin']), indirectExpenseController.updateIndirectExpense);
router.delete('/:id', authorize(['admin', 'superadmin']), indirectExpenseController.deleteIndirectExpense);

export default router;
