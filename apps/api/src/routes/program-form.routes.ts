import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getProgramForm } from '../services/program-form.service.js';
export const programFormRouter=Router();
programFormRouter.get('/forms/:kind/:id',requireAuth,asyncHandler(async(req,res)=>{res.json(await getProgramForm(req.user!,req.params.kind,req.params.id,req.query));}));
