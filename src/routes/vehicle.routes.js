import express from 'express';
const router = express.Router();

import * as vehicleController from '../controllers/vehicle.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';


router.post('/', authenticateToken, authorize(["admin"]), vehicleController.addVehicle);
router.get('/', authenticateToken, authorize(["admin"]), vehicleController.getVehicles);
router.get('/:id', authenticateToken, authorize(["admin"]), vehicleController.getVehicleById);

export default router;