import { Router } from 'express';
const router = Router();
import authRouter from './auth.routes.js';
import userRouter from './user.routes.js';
import vehicleRouter from './vehicle.routes.js';
import vendorRouter from './vendor.routes.js';
import clientRouter from './client.routes.js';
import tripRouter from './trip.routes.js';
import dashboardRouter from './dashboard.routes.js';

router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/vehicle', vehicleRouter);
router.use('/vendor', vendorRouter);
router.use('/client', clientRouter);
router.use('/trip', tripRouter);
router.use('/dashboard', dashboardRouter);

export default router;
