import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireManagement } from '../middleware/auth.middleware.js';
import { getLoadSettings, putLoadSettings } from '../services/load-settings.service.js';
import { assertFacultyScope } from '../services/faculty-program.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uuidIdSchema } from '../validation/subject.validation.js';
import { getFacultyTeachingLoad } from '../services/teaching-load.service.js';
import * as facultyRepository from '../repositories/faculty.repository.js';

export const teachingLoadRouter = Router();

teachingLoadRouter.get('/load-settings',requireAuth,asyncHandler(async (_req,res)=>{res.json({settings:await getLoadSettings()});}));
teachingLoadRouter.put('/load-settings',requireAuth,requireManagement,asyncHandler(async (req,res)=>{res.json({settings:await putLoadSettings(req.body)});}));

function parseId(value: string | undefined, label: string): string {
  const parsed = uuidIdSchema.safeParse(value);
  if (!parsed.success) {
    throw ApiError.badRequest(`Invalid ${label} id`);
  }
  return parsed.data;
}

const termQuerySchema = z.object({
  termId: z.string({ invalid_type_error: 'Term must be a UUID' }).uuid('Term must be a UUID'),
});

/**
 * GET /api/faculty/:id/teaching-load?termId=
 *
 * Read-only teaching load for a faculty member in a term.
 * - FACULTY-role accounts may only request their own facultyId (403 otherwise).
 * - CHAIR may request any faculty.
 * - 404 for an unknown faculty; 400 for a bad id/termId.
 */
teachingLoadRouter.get(
  '/faculty/:id/teaching-load',
  requireAuth,
  asyncHandler(async (req, res) => {
    const facultyId = parseId(req.params.id, 'faculty');

    const termParsed = termQuerySchema.safeParse(req.query);
    if (!termParsed.success) {
      throw ApiError.badRequest('Invalid termId');
    }
    const { termId } = termParsed.data;
    await assertFacultyScope(req.user!,facultyId,termId);

    // Faculty-role accounts are scoped to their own data (same self-scope as
    // the schedule-view faculty endpoint). CHAIR may request any faculty.
    const user = req.user;
    if (user?.role === 'FACULTY' && user.facultyId !== facultyId) {
      throw new ApiError(403, 'FORBIDDEN', 'Faculty accounts can only view their own teaching load');
    }

    const faculty = await facultyRepository.findActiveById(facultyId);
    if (!faculty) {
      throw ApiError.notFound('Faculty member not found');
    }

    const load = await getFacultyTeachingLoad(facultyId, termId);
    res.status(200).json({
      faculty: {
        id: faculty.id,
        employee_no: faculty.employee_no,
        first_name: faculty.first_name,
        last_name: faculty.last_name,
      },
      load,
    });
  }),
);
