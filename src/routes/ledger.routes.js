import express from 'express';
const router = express.Router();

import * as ledgerController from '../controllers/ledger.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

router.post('/', authenticateToken, authorize(["admin", "superadmin"]), ledgerController.addLedger);
router.get('/', authenticateToken, authorize(["admin", "superadmin"]), ledgerController.getLedgers);
router.get('/group/:groupId', authenticateToken, authorize(["admin", "superadmin", "supervisor"]), ledgerController.getLedgersByGroup);
router.get('/:id', authenticateToken, authorize(["admin", "superadmin"]), ledgerController.getLedgerById);
router.put('/:id', authenticateToken, authorize(["admin", "superadmin"]), ledgerController.updateLedger);
router.delete('/:id', authenticateToken, authorize(["admin", "superadmin"]), ledgerController.deleteLedger);

export default router;

