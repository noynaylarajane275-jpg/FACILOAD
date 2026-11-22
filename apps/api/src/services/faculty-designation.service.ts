import type { FacultyDesignation } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import {
  create as createFacultyDesignationRow,
  findActiveById,
  findActiveDuplicate,
  list as listFacultyDesignationRows,
  softDelete,
  update as updateFacultyDesignationRow,
  type FacultyDesignationCreateData,
  type FacultyDesignationWithDetails,
} from '../repositories/faculty-designation.repository.js';
import { findActiveById as findFacultyById } from '../repositories/faculty.repository.js';
import { findById as findTermById } from '../repositories/term.repository.js';
import {
  assignDesignationSchema,
  updateFacultyDesignationSchema,
  type AssignDesignationInput,
  type UpdateFacultyDesignationInput,
} from '../validation/designation.validation.js';

export interface FacultyDesignationDto {
  id: string;
  faculty_id: string;
  designation_id: string;
  designation_name: string;
  designation_grants_service_credit: boolean;
  term_id: string;
  hours: number;
  service_credit: number;
  assigned_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function toFacultyDesignationDto(
  row: FacultyDesignationWithDetails,
): FacultyDesignationDto {
  return {
    id: row.id,
    faculty_id: row.faculty_id,
    designation_id: row.designation_id,
    designation_name: row.designation.name,
    designation_grants_service_credit: row.designation.grants_service_credit,
    term_id: row.term_id,
    hours: row.hours,
    service_credit: row.service_credit,
    assigned_by_user_id: row.assigned_by_user_id ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at?.toISOString() ?? null,
  };
}

function parseOrBadRequest<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  return parsed.data as z.infer<T>;
}

export async function listFacultyDesignations(
  facultyId: string | null,
  rawQuery: unknown,
): Promise<FacultyDesignationDto[]> {
  const query = parseOrBadRequest(
    z.object({
      termId: z.preprocess(
        (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
        z.string().uuid('Term must be a UUID').optional(),
      ),
    }),
    rawQuery,
  );
  const rows = await listFacultyDesignationRows(facultyId, query.termId ?? null);
  return rows.map(toFacultyDesignationDto);
}

export async function assignDesignation(
  facultyId: string,
  userId: string | null,
  rawBody: unknown,
): Promise<FacultyDesignationDto> {
  const faculty = await findFacultyById(facultyId);
  if (!faculty) {
    throw ApiError.notFound('Faculty member not found');
  }

  const data = parseOrBadRequest(assignDesignationSchema, rawBody);

  const term = await findTermById(data.term_id);
  if (!term) {
    throw ApiError.notFound('Term not found');
  }
  const designation = await import('../repositories/designation.repository.js').then(r=>r.findActiveById(data.designation_id));
  if(!designation) throw ApiError.notFound('Designation not found');

  // Duplicate active assignment check
  const dup = await findActiveDuplicate(
    facultyId,
    data.designation_id,
    data.term_id,
  );
  if (dup) {
    throw ApiError.conflict(
      'FACULTY_DESIGNATION_DUPLICATE',
      'This faculty member already has an active assignment to this designation for this term',
    );
  }

  // If designation does not grant service credit, force service_credit to 0
  const serviceCredit = designation.grants_service_credit && !/\b(chair|chairman|dean)\b/i.test(designation.name) ? data.service_credit??designation.service_credit_hours : 0;
  const actor=userId?await import('../config/prisma.js').then(({prisma})=>prisma.user.findUnique({where:{id:userId}})):null;

  const row = await createFacultyDesignationRow({
    faculty_id: facultyId,
    designation_id: data.designation_id,
    term_id: data.term_id,
    hours: data.hours,
    service_credit: serviceCredit,
    assigned_by_user_id: actor?.id,
    // assigned_by_user_id omitted: column is optional (String?) and token userId
    // is a string not matching DB UUIDs — proper FK resolution handled in Bite 2b.
  });
  return toFacultyDesignationDto(row);
}

export async function updateFacultyDesignation(
  id: string,
  rawBody: unknown,
): Promise<FacultyDesignationDto> {
  const existing = await findActiveById(id);
  if (!existing) {
    throw ApiError.notFound('Faculty designation not found');
  }

  const data = parseOrBadRequest(updateFacultyDesignationSchema, rawBody);

  const row = await updateFacultyDesignationRow(id, {
    ...(data.hours !== undefined ? { hours: data.hours } : {}),
    ...(data.service_credit !== undefined ? { service_credit: existing.designation.grants_service_credit && !/\b(chair|chairman|dean)\b/i.test(existing.designation.name) ? data.service_credit : 0 } : {}),
  });
  return toFacultyDesignationDto(row);
}

export async function deleteFacultyDesignation(id: string): Promise<void> {
  const existing = await findActiveById(id);
  if (!existing) {
    throw ApiError.notFound('Faculty designation not found');
  }
  await softDelete(id);
}
