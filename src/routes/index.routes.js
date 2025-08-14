import { Router } from 'express';
const router = Router();
import authRouter from './auth.routes.js';

router.get('/', (req, res) => res.send("API is running..."));
router.use('/auth', authRouter);

export default router;
