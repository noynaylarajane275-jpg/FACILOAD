import { Router, type Request } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireManagement } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createSection,
  deleteSection,
  getSection,
  listSections,
  updateSection,
} from '../services/section.service.js';
import { uuidIdSchema } from '../validation/section.validation.js';

export const sectionRouter = Router();

function parseId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid section id');
  }
  return parsed.data;
}

// Reads: any authenticated role (feed section dropdowns).
// Writes: CHAIR.
sectionRouter.get(
  '/sections',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(200).json(await listSections(req.query));
  }),
);

sectionRouter.get(
  '/sections/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(200).json({ section: await getSection(parseId(req)) });
  }),
);

sectionRouter.post(
  '/sections',
  requireAuth,
  requireManagement,
  asyncHandler(async (req, res) => {
    res.status(201).json({ section: await createSection(req.body) });
  }),
);

sectionRouter.patch(
  '/sections/:id',
  requireAuth,
  requireManagement,
  asyncHandler(async (req, res) => {
    res.status(200).json({ section: await updateSection(parseId(req), req.body) });
  }),
);

sectionRouter.delete(
  '/sections/:id',
  requireAuth,
  requireManagement,
  asyncHandler(async (req, res) => {
    await deleteSection(parseId(req));
    res.status(204).send();
  }),
);