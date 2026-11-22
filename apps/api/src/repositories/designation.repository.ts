import { Prisma, type Designation } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export type DesignationSortField = 'name' | 'default_hours' | 'created_at';
export type SortDirection = 'asc' | 'desc';

export interface DesignationListParams {
  search: string | null;
  page: number;
  pageSize: number;
  sortBy: DesignationSortField;
  sortDir: SortDirection;
}

export interface DesignationListResult {
  rows: Designation[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DesignationCreateData {
  name: string;
  default_hours: number;
  service_credit_hours: number;
  grants_service_credit: boolean;
}

export type DesignationUpdateData = Partial<DesignationCreateData>;

/**
 * Active-only scope: soft-deleted designations are excluded from every lookup
 * here (database-specification.md Section 7). `name` carries a partial unique
 * index (applied via prisma/apply-checks.ts) so a soft-deleted designation's
 * name becomes reusable.
 */
function listWhere(search: string | null): Prisma.DesignationWhereInput {
  const trimmed = search?.trim();
  if (!trimmed) {
    return { deleted_at: null };
  }
  return {
    deleted_at: null,
    OR: [{ name: { contains: trimmed } }],
  };
}

function orderByFor(
  sortBy: DesignationSortField,
  sortDir: SortDirection,
): Prisma.DesignationOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'default_hours':
      return [{ default_hours: sortDir }, { name: 'asc' }];
    case 'created_at':
      return [{ created_at: sortDir }, { name: 'asc' }];
    case 'name':
    default:
      return [{ name: sortDir }];
  }
}

export async function list(params: DesignationListParams): Promise<DesignationListResult> {
  const where = listWhere(params.search);
  const [rows, total] = await prisma.$transaction([
    prisma.designation.findMany({
      where,
      orderBy: orderByFor(params.sortBy, params.sortDir),
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.designation.count({ where }),
  ]);
  return { rows, total, page: params.page, pageSize: params.pageSize };
}

export async function findActiveById(id: string): Promise<Designation | null> {
  return prisma.designation.findFirst({ where: { id, deleted_at: null } });
}

export async function findActiveByName(
  name: string,
  excludeId?: string,
): Promise<{ id: string; name: string } | null> {
  const candidates = await prisma.designation.findMany({
    where: { deleted_at: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true },
  });
  const target = name.toLowerCase();
  return candidates.find((row) => row.name.toLowerCase() === target) ?? null;
}

export async function create(data: DesignationCreateData): Promise<Designation> {
  return prisma.designation.create({ data });
}

export async function update(id: string, data: DesignationUpdateData): Promise<Designation> {
  return prisma.designation.update({ where: { id }, data });
}

export async function softDelete(id: string): Promise<Designation> {
  return prisma.designation.update({ where: { id }, data: { deleted_at: new Date() } });
}
