import { Router } from 'express';
import * as controller from '../controllers/authController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const authRouter = Router();

authRouter.post('/signup', authLimiter, asyncHandler(controller.signup));
authRouter.post('/login', authLimiter, asyncHandler(controller.login));
authRouter.post('/google', authLimiter, asyncHandler(controller.googleAuth));
authRouter.post('/refresh', asyncHandler(controller.refresh));
authRouter.post('/logout', asyncHandler(controller.logout));
authRouter.get('/me', requireAuth, asyncHandler(controller.me));
