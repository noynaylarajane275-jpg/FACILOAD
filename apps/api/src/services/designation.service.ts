import type { Designation } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import {
  create as createDesignationRow,
  findActiveById,
  findActiveByName,
  list as listDesignationRows,
  softDelete,
  update as updateDesignationRow,
  type DesignationCreateData,
  type DesignationListParams,
  type DesignationSortField,
  type DesignationUpdateData,
  type SortDirection,
} from '../repositories/designation.repository.js';
import {
  createDesignationSchema,
  updateDesignationSchema,
  type CreateDesignationInput,
  type UpdateDesignationInput,
} from '../validation/designation.validation.js';

export interface DesignationDto {
  id: string;
  name: string;
  default_hours: number;
  service_credit_hours: number;
  grants_service_credit: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DesignationListDto {
  data: DesignationDto[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

function toDesignationDto(designation: Designation): DesignationDto {
  return {
    id: designation.id,
    name: designation.name,
    default_hours: designation.default_hours,
    service_credit_hours: designation.service_credit_hours,
    grants_service_credit: designation.grants_service_credit,
    created_at: designation.created_at.toISOString(),
    updated_at: designation.updated_at.toISOString(),
    deleted_at: designation.deleted_at?.toISOString() ?? null,
  };
}

function parseOrBadRequest<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  return parsed.data as z.infer<T>;
}

export async function listDesignations(rawQuery: unknown): Promise<DesignationListDto> {
  const query = parseOrBadRequest(
    // Reuse faculty's query schema shape for pagination/search
    z.object({
      search: z.preprocess(
        (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
        z.string().trim().max(100, 'Search must be at most 100 characters').optional(),
      ),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(10),
      sortBy: z.enum(['name', 'default_hours', 'created_at']).optional(),
      sortDir: z.enum(['asc', 'desc']).optional(),
    }),
    rawQuery,
  );
  const params: DesignationListParams = {
    search: query.search ?? null,
    page: query.page,
    pageSize: query.pageSize,
    sortBy: (query.sortBy ?? 'name') as DesignationSortField,
    sortDir: (query.sortDir ?? 'asc') as SortDirection,
  };
  const result = await listDesignationRows(params);
  return {
    data: result.rows.map(toDesignationDto),
    meta: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      pageCount: Math.ceil(result.total / result.pageSize),
    },
  };
}

export async function createDesignation(rawBody: unknown): Promise<DesignationDto> {
  const data = parseOrBadRequest(createDesignationSchema, rawBody);

  // Case-insensitive duplicate check among active designations
  const existing = await findActiveByName(data.name);
  if (existing) {
    throw ApiError.conflict(
      'DESIGNATION_DUPLICATE_NAME',
      `A designation named "${data.name}" already exists`,
    );
  }

  const row = await createDesignationRow({
    name: data.name,
    default_hours: data.default_hours,
    service_credit_hours: data.service_credit_hours,
    grants_service_credit: data.grants_service_credit,
  });
  return toDesignationDto(row);
}

export async function updateDesignation(id: string, rawBody: unknown): Promise<DesignationDto> {
  const existing = await findActiveById(id);
  if (!existing) {
    throw ApiError.notFound('Designation not found');
  }

  const data = parseOrBadRequest(updateDesignationSchema, rawBody);

  if (data.name !== undefined && data.name !== existing.name) {
    const dup = await findActiveByName(data.name, id);
    if (dup) {
      throw ApiError.conflict(
        'DESIGNATION_DUPLICATE_NAME',
        `A designation named "${data.name}" already exists`,
      );
    }
  }

  const updateData: DesignationUpdateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.default_hours !== undefined) updateData.default_hours = data.default_hours;
  if (data.service_credit_hours !== undefined) {
    updateData.service_credit_hours = data.service_credit_hours;
  }
  if (data.grants_service_credit !== undefined) {
    updateData.grants_service_credit = data.grants_service_credit;
  }

  const row = await updateDesignationRow(id, updateData);
  return toDesignationDto(row);
}

export async function deleteDesignation(id: string): Promise<void> {
  const existing = await findActiveById(id);
  if (!existing) {
    throw ApiError.notFound('Designation not found');
  }
  await softDelete(id);
}
