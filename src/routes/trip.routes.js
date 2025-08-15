import express from 'express';
const router = express.Router();

import * as tripController from '../controllers/trip.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

router.post('/', authenticateToken, tripController.addTrip);
router.get('/', authenticateToken,  tripController.getTrips);
router.get('/:id', authenticateToken, tripController.getTripById);
router.put('/:id/diesel', authenticateToken, tripController.updateTripDiesel);
router.put('/:id/expenses', authenticateToken, tripController.updateTripExpenses);
router.put('/:id/sales', authenticateToken, tripController.updateTripSales);
router.put('/:id/complete', authenticateToken, tripController.updateCompleteTrip);

export default router;