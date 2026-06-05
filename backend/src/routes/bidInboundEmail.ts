import { Router } from 'express';
import * as controller from '../controllers/bidInboundEmailController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const bidInboundEmailRouter = Router();

bidInboundEmailRouter.post('/sendgrid', asyncHandler(controller.handleSendGridInbound));
