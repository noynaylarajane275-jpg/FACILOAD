import { Router, type Request, type Response } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireManagement } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  assignDesignation,
  deleteFacultyDesignation,
  listFacultyDesignations,
  updateFacultyDesignation,
} from '../services/faculty-designation.service.js';
import { uuidIdSchema } from '../validation/subject.validation.js';

export const facultyDesignationRouter = Router();

function parseId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid id');
  }
  return parsed.data;
}

/**
 * Faculty designations.
 * - FACULTY-role accounts may only read their own facultyId (403 otherwise).
 * - Writes are Chair-only.
 */

facultyDesignationRouter.get(
  '/faculty/:id/designations',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const facultyId = parseId(req);
    const user = req.user;
    if (user?.role === 'FACULTY' && user.facultyId !== facultyId) {
      throw new ApiError(403, 'FORBIDDEN', 'Faculty accounts can only view their own designations');
    }
    res.status(200).json(await listFacultyDesignations(facultyId, req.query));
  }),
);

facultyDesignationRouter.post(
  '/faculty/:id/designations',
  requireAuth,
  requireManagement,
  asyncHandler(async (req: Request, res: Response) => {
    const facultyId = parseId(req);
    const user = req.user;
    res.status(201).json({
      designation: await assignDesignation(facultyId, user?.userId ?? null, req.body),
    });
  }),
);

facultyDesignationRouter.patch(
  '/faculty-designations/:id',
  requireAuth,
  requireManagement,
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ designation: await updateFacultyDesignation(parseId(req), req.body) });
  }),
);

facultyDesignationRouter.delete(
  '/faculty-designations/:id',
  requireAuth,
  requireManagement,
  asyncHandler(async (req: Request, res: Response) => {
    await deleteFacultyDesignation(parseId(req));
    res.status(204).send();
  }),
);
