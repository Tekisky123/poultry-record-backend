import express from 'express';
const router = express.Router();

import * as authController from '../controllers/auth.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

router.post('/signup', authenticateToken, authorize(["admin"]), authController.signup);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
// router.patch('/forgot-password', authController.updatePassword);

export default router;