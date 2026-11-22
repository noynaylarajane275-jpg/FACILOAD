import { Router, type Request, type Response } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireManagement } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createDesignation,
  deleteDesignation,
  listDesignations,
  updateDesignation,
} from '../services/designation.service.js';
import { uuidIdSchema } from '../validation/subject.validation.js';

export const designationRouter = Router();

function parseId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid designation id');
  }
  return parsed.data;
}

// Designations — reads open to any authenticated role; writes are Chair-only.

designationRouter.get(
  '/designations',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(200).json(await listDesignations(req.query));
  }),
);

designationRouter.post(
  '/designations',
  requireAuth,
  requireManagement,
  asyncHandler(async (req, res) => {
    res.status(201).json({ designation: await createDesignation(req.body) });
  }),
);

designationRouter.patch(
  '/designations/:id',
  requireAuth,
  requireManagement,
  asyncHandler(async (req, res) => {
    res.status(200).json({ designation: await updateDesignation(parseId(req), req.body) });
  }),
);

designationRouter.delete(
  '/designations/:id',
  requireAuth,
  requireManagement,
  asyncHandler(async (req, res) => {
    await deleteDesignation(parseId(req));
    res.status(204).send();
  }),
);
