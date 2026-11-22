/**
 * Module — Teaching-load API tests (real DB + real HTTP via supertest).
 * Covers correct numbers for a seeded fixture, the Faculty-role self-scope
 * (own = 200, other = 403), unknown faculty (404), and bad id/termId (400).
 *
 * Every fixture carries this suite's TLT- marker; cleanup runs before each
 * test and again in afterAll so the dev database is left untouched.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { hashPassword, signAccessToken } from '../services/auth.service.js';

beforeAll(() => {
  process.env.JWT_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
});

const PREFIX = 'TLT-';
const CHAIR_EMAIL = `tltst-chair-${process.pid}@flowsched.local`;
const FACULTY_A_EMAIL = `tltst-fac-a-${process.pid}@flowsched.local`;
const FACULTY_B_EMAIL = `tltst-fac-b-${process.pid}@flowsched.local`;
const PASSWORD = 'Test-Password-123';

let chairToken = '';
let facultyAToken = '';
let facultyBToken = '';

interface Fixtures {
  termId: string;
  facultyAId: string;
  facultyBId: string;
}

async function cleanFixtures(): Promise<void> {
  // Unlink accounts first: user.faculty_id would otherwise restrict the
  // faculty deleteMany below.
  await prisma.user.updateMany({
    where: { email: { in: [FACULTY_A_EMAIL, FACULTY_B_EMAIL] } },
    data: { faculty_id: null },
  });
  await prisma.workloadAssignment.deleteMany({
    where: { faculty: { employee_no: { startsWith: PREFIX } } },
  });
  await prisma.faculty.deleteMany({ where: { employee_no: { startsWith: PREFIX } } });
  await prisma.subject.deleteMany({ where: { code: { startsWith: PREFIX } } });
  await prisma.section.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.academicTerm.deleteMany({ where: { school_year: { startsWith: PREFIX } } });
}

beforeEach(cleanFixtures);

// Leave no fixtures behind for other suites (or the dev database).
afterAll(async () => {
  await cleanFixtures();
  await prisma.user.deleteMany({
    where: { email: { in: [CHAIR_EMAIL, FACULTY_A_EMAIL, FACULTY_B_EMAIL] } },
  });
});

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  for (const [email, role] of [
    [CHAIR_EMAIL, 'CHAIR'],
    [FACULTY_A_EMAIL, 'FACULTY'],
    [FACULTY_B_EMAIL, 'FACULTY'],
  ] as const) {
    await prisma.user.upsert({
      where: { email },
      update: { password_hash: passwordHash, role, is_active: true },
      create: { email, password_hash: passwordHash, role },
    });
  }
});

async function seedFixtures(): Promise<Fixtures> {
  const term = await prisma.academicTerm.create({
    data: { school_year: `${PREFIX}2026-2027`, semester: 'FIRST' },
  });
  const facultyA = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}A001`, first_name: 'Load', last_name: 'FacultyA', max_units: 24 },
  });
  const facultyB = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}B002`, first_name: 'Load', last_name: 'FacultyB', max_units: 24 },
  });
  // Link faculty A's login to its record so its token carries facultyId.
  await prisma.user.update({
    where: { email: FACULTY_A_EMAIL },
    data: { faculty_id: facultyA.id },
  });
  const subject = await prisma.subject.create({
    data: { code: `${PREFIX}101`, title: 'Teaching Load 101', units: 3, lecture_hours: 3, lab_hours: 3 },
  });
  const section = await prisma.section.create({
    data: { year_level: 3, name: `${PREFIX}3A` },
  });
  await prisma.workloadAssignment.create({
    data: { faculty_id: facultyA.id, subject_id: subject.id, section_id: section.id, term_id: term.id },
  });

  chairToken = signAccessToken({ userId: 'chair-user', role: 'CHAIR', facultyId: null });
  facultyAToken = signAccessToken({ userId: 'fac-a', role: 'FACULTY', facultyId: facultyA.id });
  facultyBToken = signAccessToken({ userId: 'fac-b', role: 'FACULTY', facultyId: facultyB.id });

  return { termId: term.id, facultyAId: facultyA.id, facultyBId: facultyB.id };
}

describe('GET /api/faculty/:id/teaching-load', () => {
  it('returns the teaching load for a seeded faculty (CHAIR may read any)', async () => {
    const f = await seedFixtures();
    const res = await request(createApp())
      .get(`/api/faculty/${f.facultyAId}/teaching-load?termId=${f.termId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(200);
    expect(res.body.faculty.id).toBe(f.facultyAId);
    const load = res.body.load;
    expect(load.lecture_hours).toBe(3);
    expect(load.lab_hours).toBe(3);
    expect(load.weighted_lab_hours).toBe(2.1);
    expect(load.teaching_hours).toBe(5.1);
    expect(load.preps).toBe(2);
    expect(load.prep_ceiling).toBe(21);
    expect(load.prep_ceiling_source).toBe('TIER');
    expect(load.teaching_overload).toBe(0);
    expect(load.claimable_overload_hours).toBe(0);
    expect(load.regular_teaching_hours).toBe(5.1);
  });

  it('faculty can read their own load but not another faculty\'s (403)', async () => {
    const f = await seedFixtures();
    const own = await request(createApp())
      .get(`/api/faculty/${f.facultyAId}/teaching-load?termId=${f.termId}`)
      .set('Authorization', `Bearer ${facultyAToken}`);
    expect(own.status).toBe(200);
    const other = await request(createApp())
      .get(`/api/faculty/${f.facultyBId}/teaching-load?termId=${f.termId}`)
      .set('Authorization', `Bearer ${facultyAToken}`);
    expect(other.status).toBe(403);
  });

  it('returns 404 for an unknown faculty', async () => {
    const f = await seedFixtures();
    const unknownId = '00000000-0000-0000-0000-000000000000';
    const res = await request(createApp())
      .get(`/api/faculty/${unknownId}/teaching-load?termId=${f.termId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for a bad faculty id or termId', async () => {
    const f = await seedFixtures();
    const badId = await request(createApp())
      .get(`/api/faculty/not-a-uuid/teaching-load?termId=${f.termId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(badId.status).toBe(400);
    const badTerm = await request(createApp())
      .get(`/api/faculty/${f.facultyAId}/teaching-load?termId=not-a-uuid`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(badTerm.status).toBe(400);
    const missingTerm = await request(createApp())
      .get(`/api/faculty/${f.facultyAId}/teaching-load`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(missingTerm.status).toBe(400);
  });

  it('requires authentication', async () => {
    const f = await seedFixtures();
    const res = await request(createApp()).get(
      `/api/faculty/${f.facultyAId}/teaching-load?termId=${f.termId}`,
    );
    expect(res.status).toBe(401);
  });
});
