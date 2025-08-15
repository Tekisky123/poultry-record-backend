import express from 'express';
const router = express.Router();

import * as clientController from '../controllers/client.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

router.post('/', authenticateToken, authorize(["admin"]), clientController.addClient);
router.get('/', authenticateToken, authorize(["admin"]), clientController.getClients);
router.get('/:id', authenticateToken, authorize(["admin"]), clientController.getClientById);

export default router;