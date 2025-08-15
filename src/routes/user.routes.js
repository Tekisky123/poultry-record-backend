import express from 'express';
const router = express.Router();

import * as userController from '../controllers/user.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

router.get('/', authenticateToken, authorize(["admin"]), userController.getUsers);
router.get('/:id', authenticateToken, authorize(["admin"]), userController.getUserById);

export default router;