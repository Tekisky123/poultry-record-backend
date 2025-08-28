import express from 'express';
const router = express.Router();

import * as tripController from '../controllers/trip.controller.js';
import authenticateToken from '../middleware/authenticateToken.js';
import authorize from '../middleware/authorization.js';

// Trip CRUD operations (Supervisor can create, Admin/Superadmin can view)
router.post('/', authenticateToken, authorize(['supervisor']), tripController.addTrip);
router.get('/', authenticateToken, authorize(['admin', 'superadmin', 'supervisor']), tripController.getTrips);
router.get('/:id', authenticateToken, authorize(['admin', 'superadmin', 'supervisor']), tripController.getTripById);
router.put('/:id', authenticateToken, authorize(['admin', 'superadmin']), tripController.updateTrip);
router.delete('/:id', authenticateToken, authorize(['admin', 'superadmin']), tripController.deleteTrip);

// Trip management operations (Supervisor)
router.post('/:id/purchase', authenticateToken, authorize(['supervisor']), tripController.addPurchase);
router.post('/:id/sale', authenticateToken, authorize(['supervisor']), tripController.addSale);
router.put('/:id/diesel', authenticateToken, authorize(['supervisor']), tripController.updateTripDiesel);
router.put('/:id/expenses', authenticateToken, authorize(['supervisor']), tripController.updateTripExpenses);
router.put('/:id/complete', authenticateToken, authorize(['supervisor']), tripController.completeTrip);

// Trip statistics (Admin/Supervisor)
router.get('/stats/overview', authenticateToken, authorize(['admin', 'superadmin', 'supervisor']), tripController.getTripStats);

export default router;