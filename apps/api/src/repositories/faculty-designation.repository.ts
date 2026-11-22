import { Prisma, type FacultyDesignation } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export type FacultyDesignationWithDetails = Prisma.FacultyDesignationGetPayload<{ include: { designation: true } }>;

export interface FacultyDesignationCreateData {
  faculty_id: string;
  designation_id: string;
  term_id: string;
  hours: number;
  service_credit?: number;
  assigned_by_user_id?: string;
}

export type FacultyDesignationUpdateData = Partial<
  Pick<FacultyDesignationCreateData, 'hours' | 'service_credit'>
>;

/**
 * Active-only scope: soft-deleted assignments are excluded from every lookup
 * here. (faculty_id, designation_id, term_id) carries a partial unique index
 * (applied via prisma/apply-checks.ts) so a soft-deleted assignment's key
 * becomes reusable.
 */
function listWhere(
  facultyId: string | null,
  termId: string | null,
): Prisma.FacultyDesignationWhereInput {
  return {
    deleted_at: null,
    ...(facultyId ? { faculty_id: facultyId } : {}),
    ...(termId ? { term_id: termId } : {}),
  };
}

export async function list(
  facultyId: string | null,
  termId: string | null,
): Promise<FacultyDesignationWithDetails[]> {
  return prisma.facultyDesignation.findMany({
    where: listWhere(facultyId, termId),
    include: { designation: true },
    orderBy: [{ created_at: 'asc' }],
  });
}

export async function findActiveById(id: string): Promise<FacultyDesignationWithDetails | null> {
  return prisma.facultyDesignation.findFirst({
    where: { id, deleted_at: null },
    include: { designation: true },
  });
}

export async function findActiveDuplicate(
  faculty_id: string,
  designation_id: string,
  term_id: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.facultyDesignation.findFirst({
    where: {
      deleted_at: null,
      faculty_id,
      designation_id,
      term_id,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function create(
  data: FacultyDesignationCreateData,
): Promise<FacultyDesignationWithDetails> {
  return prisma.facultyDesignation.create({ data, include: { designation: true } });
}

export async function update(
  id: string,
  data: FacultyDesignationUpdateData,
): Promise<FacultyDesignationWithDetails> {
  return prisma.facultyDesignation.update({ where: { id }, data, include: { designation: true } });
}

export async function softDelete(id: string): Promise<void> {
  await prisma.facultyDesignation.update({ where: { id }, data: { deleted_at: new Date() } });
}
