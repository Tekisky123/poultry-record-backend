import { Router } from 'express';
const router = Router();
import authRouter from './auth.routes.js';
import userRouter from './user.routes.js';
import vehicleRouter from './vehicle.routes.js';
import vendorRouter from './vendor.routes.js';
import customerRouter from './customer.routes.js';
import tripRouter from './trip.routes.js';
import dashboardRouter from './dashboard.routes.js';
import indirectExpenseRouter from './indirectExpense.routes.js';

router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/vehicle', vehicleRouter);
router.use('/vendor', vendorRouter);
router.use('/customer', customerRouter);
router.use('/trip', tripRouter);
router.use('/dashboard', dashboardRouter);
router.use('/indirect-expense', indirectExpenseRouter);

export default router;
