/**
 * Module — Designation API tests (real DB + real HTTP via supertest).
 * Covers designation CRUD, duplicate-name 409, FACULTY write 403,
 * faculty-designation assign/duplicate 409, soft-delete + re-assign,
 * FACULTY self-only read scope, and engine integration.
 *
 * Every fixture carries this suite's DSG- marker; cleanup runs before each
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

const PREFIX = 'DSG-';
const CHAIR_EMAIL = `dsg-chair-${process.pid}@flowsched.local`;
const FACULTY_A_EMAIL = `dsg-fac-a-${process.pid}@flowsched.local`;
const FACULTY_B_EMAIL = `dsg-fac-b-${process.pid}@flowsched.local`;
const PASSWORD = 'Test-Password-123';

let chairToken = '';
let facultyAToken = '';
let facultyBToken = '';

interface Fixtures {
  termId: string;
  facultyAId: string;
  facultyBId: string;
  designationGrantsId: string;
  designationNoGrantsId: string;
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
  await prisma.facultyDesignation.deleteMany({
    where: { faculty: { employee_no: { startsWith: PREFIX } } },
  });
  await prisma.facultyTeachingLoadDetail.deleteMany({
    where: { faculty: { employee_no: { startsWith: PREFIX } } },
  });
  await prisma.designation.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.subject.deleteMany({ where: { code: { startsWith: PREFIX } } });
  await prisma.section.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.faculty.deleteMany({ where: { employee_no: { startsWith: PREFIX } } });
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
    data: { school_year: `${PREFIX}2026-2027`, semester: 'FIRST', is_active: true },
  });
  const facultyA = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}A001`, first_name: 'Desig', last_name: 'FacultyA', max_units: 24 },
  });
  const facultyB = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}B002`, first_name: 'Desig', last_name: 'FacultyB', max_units: 24 },
  });
  await prisma.user.update({
    where: { email: FACULTY_A_EMAIL },
    data: { faculty_id: facultyA.id },
  });

  const dg = await prisma.designation.create({
    data: {
      name: `${PREFIX}Grants Designation`,
      default_hours: 2,
      service_credit_hours: 1,
      grants_service_credit: true,
    },
  });
  const dn = await prisma.designation.create({
    data: {
      name: `${PREFIX}No Grants Designation`,
      default_hours: 1,
      service_credit_hours: 0,
      grants_service_credit: false,
    },
  });

  chairToken = signAccessToken({ userId: 'dsg-chair', role: 'CHAIR', facultyId: null });
  facultyAToken = signAccessToken({ userId: 'dsg-fac-a', role: 'FACULTY', facultyId: facultyA.id });
  facultyBToken = signAccessToken({ userId: 'dsg-fac-b', role: 'FACULTY', facultyId: facultyB.id });

  return {
    termId: term.id,
    facultyAId: facultyA.id,
    facultyBId: facultyB.id,
    designationGrantsId: dg.id,
    designationNoGrantsId: dn.id,
  };
}

describe('Designations API', () => {
  it('CRUD: create, list, update, soft-delete', async () => {
    await seedFixtures();

    const createRes = await request(createApp())
      .post('/api/designations')
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ name: `${PREFIX}Test Dept`, default_hours: 3, service_credit_hours: 1, grants_service_credit: true });
    expect(createRes.status).toBe(201);
    const id = createRes.body.designation.id;
    expect(createRes.body.designation.name).toBe(`${PREFIX}Test Dept`);

    const listRes = await request(createApp())
      .get('/api/designations')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((d: any) => d.id === id)).toBe(true);

    const updateRes = await request(createApp())
      .patch(`/api/designations/${id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ default_hours: 5 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.designation.default_hours).toBe(5);

    const delRes = await request(createApp())
      .delete(`/api/designations/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(delRes.status).toBe(204);

    const listRes2 = await request(createApp())
      .get('/api/designations')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(listRes2.body.data.some((d: any) => d.id === id)).toBe(false);
  });
  it('duplicate name returns 409', async () => {
    const f = await seedFixtures();
    const dupRes = await request(createApp())
      .post('/api/designations')
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ name: `${PREFIX}Grants Designation`, default_hours: 1, service_credit_hours: 0, grants_service_credit: true });
    expect(dupRes.status).toBe(409);
  });

  it('FACULTY gets 403 on every designation write', async () => {
    await seedFixtures();

    const postRes = await request(createApp())
      .post('/api/designations')
      .set('Authorization', `Bearer ${facultyAToken}`)
      .send({ name: `${PREFIX}Faculty Try`, default_hours: 1, service_credit_hours: 0, grants_service_credit: true });
    expect(postRes.status).toBe(403);

    const patchRes = await request(createApp())
      .patch(`/api/designations/${'00000000-0000-0000-0000-000000000001'}`)
      .set('Authorization', `Bearer ${facultyAToken}`)
      .send({ default_hours: 2 });
    expect(patchRes.status).toBe(403);

    const delRes = await request(createApp())
      .delete(`/api/designations/${'00000000-0000-0000-0000-000000000001'}`)
      .set('Authorization', `Bearer ${facultyAToken}`);
    expect(delRes.status).toBe(403);
  });
  it('assign designation + duplicate 409; soft-delete then re-assign succeeds', async () => {
    const f = await seedFixtures();

    const assignRes = await request(createApp())
      .post(`/api/faculty/${f.facultyAId}/designations`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ designation_id: f.designationGrantsId, term_id: f.termId, hours: 3, service_credit: 2 });
    expect(assignRes.status).toBe(201);
    expect(assignRes.body.designation.designation_name).toBe(`${PREFIX}Grants Designation`);
    expect(assignRes.body.designation.hours).toBe(3);
    expect(assignRes.body.designation.service_credit).toBe(2);

    const dupRes = await request(createApp())
      .post(`/api/faculty/${f.facultyAId}/designations`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ designation_id: f.designationGrantsId, term_id: f.termId, hours: 1, service_credit: 1 });
    expect(dupRes.status).toBe(409);

    const assignId = assignRes.body.designation.id;
    const delRes = await request(createApp())
      .delete(`/api/faculty-designations/${assignId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(delRes.status).toBe(204);

    const reAssignRes = await request(createApp())
      .post(`/api/faculty/${f.facultyAId}/designations`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ designation_id: f.designationGrantsId, term_id: f.termId, hours: 2, service_credit: 1 });
    expect(reAssignRes.status).toBe(201);
    expect(reAssignRes.body.designation.hours).toBe(2);
  });
  it('FACULTY can read own designations, 403 on another faculty\'s', async () => {
    const f = await seedFixtures();

    await request(createApp())
      .post(`/api/faculty/${f.facultyAId}/designations`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ designation_id: f.designationGrantsId, term_id: f.termId, hours: 3, service_credit: 2 });

    const ownRes = await request(createApp())
      .get(`/api/faculty/${f.facultyAId}/designations?termId=${f.termId}`)
      .set('Authorization', `Bearer ${facultyAToken}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.length).toBeGreaterThanOrEqual(1);

    const otherRes = await request(createApp())
      .get(`/api/faculty/${f.facultyBId}/designations?termId=${f.termId}`)
      .set('Authorization', `Bearer ${facultyAToken}`);
    expect(otherRes.status).toBe(403);
  });

  it('engine integration: designation hours flow into total_faculty_time; service_credits only for grants=true', async () => {
    const f = await seedFixtures();

    const subject = await prisma.subject.create({
      data: { code: `${PREFIX}101`, title: 'Designation Integration 101', units: 3, lecture_hours: 3, lab_hours: 3 },
    });
    const section = await prisma.section.create({
      data: { year_level: 3, name: `${PREFIX}3A` },
    });
    await prisma.workloadAssignment.create({
      data: { faculty_id: f.facultyAId, subject_id: subject.id, section_id: section.id, term_id: f.termId },
    });

    const firstDesignation = await request(createApp())
      .post(`/api/faculty/${f.facultyAId}/designations`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ designation_id: f.designationGrantsId, term_id: f.termId, hours: 3, service_credit: 2 });
    await prisma.facultySession.create({
      data: {
        faculty_id: f.facultyAId,
        term_id: f.termId,
        type: 'DESIGNATION',
        faculty_designation_id: firstDesignation.body.designation.id,
        day_of_week: 'MON',
        start_time: '08:00',
        end_time: '11:00',
      },
    });

    const loadRes = await request(createApp())
      .get(`/api/faculty/${f.facultyAId}/teaching-load?termId=${f.termId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(loadRes.status).toBe(200);
    const load = loadRes.body.load;
    expect(load.designation_hours).toBe(3);
    expect(load.service_credits).toBe(2);
    expect(load.total_faculty_time).toBe(8.1);

    const secondDesignation = await request(createApp())
      .post(`/api/faculty/${f.facultyAId}/designations`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ designation_id: f.designationNoGrantsId, term_id: f.termId, hours: 2, service_credit: 5 });
    await prisma.facultySession.create({
      data: {
        faculty_id: f.facultyAId,
        term_id: f.termId,
        type: 'DESIGNATION',
        faculty_designation_id: secondDesignation.body.designation.id,
        day_of_week: 'MON',
        start_time: '11:00',
        end_time: '13:00',
      },
    });

    const loadRes2 = await request(createApp())
      .get(`/api/faculty/${f.facultyAId}/teaching-load?termId=${f.termId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(loadRes2.status).toBe(200);
    const load2 = loadRes2.body.load;
    expect(load2.designation_hours).toBe(5);
    expect(load2.service_credits).toBe(2);
    expect(load2.total_faculty_time).toBe(10.1);
  });
});
