import express from 'express';
const router = express.Router();

import * as dashboardController from '../controllers/dashboard.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

router.post('/stats', authenticateToken, dashboardController.getStats);

export default router;