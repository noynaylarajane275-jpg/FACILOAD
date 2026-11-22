import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../config/prisma.js';
import { createApp } from '../app.js';
import { signAccessToken } from '../services/auth.service.js';

const prefix = `PLN-${process.pid}-${Date.now()}-`;
const app = createApp();
let facultyId = '';
let termId = '';
let sectionId = '';
let chairUserId = '';
let facultyUserId = '';
let facultyToken = '';
let otherFacultyToken = '';
let chairToken = '';

const route = (suffix: string) => `/api/faculty/${facultyId}/planner-draft/${suffix}?termId=${termId}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const schedule = (start_time: string) => [{ type: 'RESEARCH', day_of_week: 'MON', start_time, end_time: `${String(Number(start_time.slice(0, 2)) + 1).padStart(2, '0')}:${start_time.slice(3)}` }];

beforeAll(async () => {
  process.env.JWT_SECRET ??= 'planner-test-access-secret';
  const term = await prisma.academicTerm.create({ data: { school_year: `${prefix}2026`, semester: 'SECOND' } });
  termId = term.id;
  const faculty = await prisma.faculty.create({ data: { employee_no: `${prefix}F1`, first_name: 'Planner', last_name: 'Faculty' } });
  facultyId = faculty.id;
  const other = await prisma.faculty.create({ data: { employee_no: `${prefix}F2`, first_name: 'Other', last_name: 'Faculty' } });
  const chair = await prisma.user.create({ data: { email: `${prefix}chair@example.test`, password_hash: 'test', role: 'CHAIR' } });
  const facultyUser = await prisma.user.create({ data: { email: `${prefix}faculty@example.test`, password_hash: 'test', role: 'FACULTY', faculty_id: facultyId } });
  const otherUser = await prisma.user.create({ data: { email: `${prefix}other@example.test`, password_hash: 'test', role: 'FACULTY', faculty_id: other.id } });
  chairUserId = chair.id;
  facultyUserId = facultyUser.id;
  chairToken = signAccessToken({ userId: chair.id, role: 'CHAIR', facultyId: null });
  facultyToken = signAccessToken({ userId: facultyUser.id, role: 'FACULTY', facultyId });
  otherFacultyToken = signAccessToken({ userId: otherUser.id, role: 'FACULTY', facultyId: other.id });
  const subject = await prisma.subject.create({ data: { code: `${prefix}SUB`, title: 'Planner test subject', units: 3, lecture_hours: 2, lab_hours: 0 } });
  const section = await prisma.section.create({ data: { year_level: 2, name: `${prefix}SECTION` } });
  sectionId = section.id;
  await prisma.workloadAssignment.create({ data: { faculty_id: facultyId, term_id: termId, subject_id: subject.id, section_id: section.id } });
  await prisma.facultySectionStudents.create({ data: { faculty_id: facultyId, term_id: termId, section_id: section.id, student_count: 27 } });
});

afterAll(async () => {
  await prisma.plannerNotification.deleteMany({ where: { recipient_user_id: { in: [chairUserId, facultyUserId] } } });
  await prisma.plannerSubmission.deleteMany({ where: { faculty_id: facultyId, term_id: termId } });
  await prisma.plannerDraft.deleteMany({ where: { faculty_id: facultyId, term_id: termId } });
  await prisma.facultySession.deleteMany({ where: { faculty_id: facultyId, term_id: termId } });
  await prisma.facultySectionStudents.deleteMany({ where: { faculty_id: facultyId, term_id: termId } });
  await prisma.workloadAssignment.deleteMany({ where: { term_id: termId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.faculty.deleteMany({ where: { employee_no: { startsWith: prefix } } });
  await prisma.subject.deleteMany({ where: { code: { startsWith: prefix } } });
  await prisma.section.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.academicTerm.deleteMany({ where: { id: termId } });
});

describe('planner draft and Chairman approval workflow', () => {
  it('keeps final sessions separate, snapshots submissions, and enforces the explicit transitions', async () => {
    const ownership = await request(app).get(route('')).set(auth(otherFacultyToken));
    expect(ownership.status).toBe(403);
    expect((await request(app).put(`/api/faculty/${facultyId}/planner-draft?termId=${termId}`).set(auth(otherFacultyToken)).send({ sessions: [] })).status).toBe(403);
    expect((await request(app).get('/api/planner-reviews').set(auth(facultyToken))).status).toBe(403);

    const blockedFinalWrite = await request(app).post(`/api/faculty/${facultyId}/sessions?termId=${termId}`).set(auth(facultyToken)).send(schedule('09:00')[0]);
    expect(blockedFinalWrite.status).toBe(409);
    expect(blockedFinalWrite.body.error.code).toBe('PLANNER_APPROVAL_REQUIRED');
    const overlappingDraft = await request(app).put(route('')).set(auth(facultyToken)).send({ sessions: [
      ...schedule('09:00'),
      { type: 'EXTENSION', day_of_week: 'MON', start_time: '09:30', end_time: '10:30' },
    ] });
    expect(overlappingDraft.status).toBe(409);
    expect(overlappingDraft.body.error.code).toBe('FACULTY_CONFLICT');

    const saved = await request(app).put(route('')).set(auth(facultyToken)).send({ sessions: schedule('09:00'), expectedRevision: 0 });
    expect(saved.status).toBe(200);
    expect(saved.body.draft.revision).toBe(1);
    expect(await prisma.facultySession.count({ where: { faculty_id: facultyId, term_id: termId, deleted_at: null } })).toBe(0);

    const firstSubmission = await request(app).post(route('submit')).set(auth(facultyToken)).send({});
    expect(firstSubmission.status).toBe(201);
    const pendingProgram = await request(app).get(`/api/forms/faculty/${facultyId}?termId=${termId}`).set(auth(facultyToken));
    expect(pendingProgram.body.load.sessions).toHaveLength(0);
    const chairQueue = await request(app).get('/api/planner-reviews').set(auth(chairToken));
    expect(chairQueue.body.data).toHaveLength(1);
    const firstPreview = await request(app).get(`/api/planner-reviews/${firstSubmission.body.submission.id}`).set(auth(chairToken));
    expect(firstPreview.status).toBe(200);
    expect(firstPreview.body.submission.sessions[0]).toMatchObject({ day_of_week: 'MON', start_time: '09:00', end_time: '10:00' });
    expect(firstPreview.body.submission.load.functions.research).toMatchObject({ plotted: 1, counted: 1 });
    expect(firstPreview.body.submission.load.total_students).toBe(27);
    expect((await request(app).get('/api/notifications').set(auth(chairToken))).body.pendingReviewCount).toBe(1);
    expect((await request(app).post(`/api/planner-reviews/${firstSubmission.body.submission.id}`).set(auth(facultyToken)).send({ decision: 'APPROVE' })).status).toBe(403);

    const approved = await request(app).post(`/api/planner-reviews/${firstSubmission.body.submission.id}`).set(auth(chairToken)).send({ decision: 'APPROVE' });
    expect(approved.status).toBe(200);
    expect(await prisma.plannerSubmission.findUnique({ where: { id: firstSubmission.body.submission.id } })).toMatchObject({ status: 'APPROVED' });
    let finalRows = await prisma.facultySession.findMany({ where: { faculty_id: facultyId, term_id: termId, deleted_at: null } });
    expect(finalRows.map((row) => row.start_time)).toEqual(['09:00']);
    const facultyNotifications = await request(app).get('/api/notifications').set(auth(facultyToken));
    expect(facultyNotifications.body.notifications.some((item: { type: string }) => item.type === 'APPROVED')).toBe(true);

    const editedApprovedDraft = await request(app).put(route('')).set(auth(facultyToken)).send({ sessions: schedule('10:00'), expectedRevision: 1 });
    expect(editedApprovedDraft.status).toBe(200);
    finalRows = await prisma.facultySession.findMany({ where: { faculty_id: facultyId, term_id: termId, deleted_at: null } });
    expect(finalRows.map((row) => row.start_time)).toEqual(['09:00']);
    const editedProgram = await request(app).get(`/api/forms/faculty/${facultyId}?termId=${termId}`).set(auth(facultyToken));
    expect(editedProgram.body.load.sessions.map((session: { start_time: string }) => session.start_time)).toEqual(['09:00']);

    const secondSubmission = await request(app).post(route('submit')).set(auth(facultyToken)).send({});
    expect(secondSubmission.status).toBe(201);
    const correction = await request(app).put(route('')).set(auth(facultyToken)).send({ sessions: schedule('11:00'), expectedRevision: 2 });
    expect(correction.status).toBe(200);
    expect(correction.body.draft.withdrawnSubmissionId).toBe(secondSubmission.body.submission.id);
    expect((await prisma.plannerSubmission.findUnique({ where: { id: secondSubmission.body.submission.id } }))?.status).toBe('WITHDRAWN');
    const withdrawnPreview = await request(app).get(`/api/planner-reviews/${secondSubmission.body.submission.id}`).set(auth(chairToken));
    expect(withdrawnPreview.body.submission.sessions[0].start_time).toBe('10:00');

    const thirdSubmission = await request(app).post(route('submit')).set(auth(facultyToken)).send({});
    expect(thirdSubmission.status).toBe(201);
    const cancelled = await request(app).post(route('cancel-submission')).set(auth(facultyToken)).send({});
    expect(cancelled.body.submission.status).toBe('CANCELLED');
    finalRows = await prisma.facultySession.findMany({ where: { faculty_id: facultyId, term_id: termId, deleted_at: null } });
    expect(finalRows.map((row) => row.start_time)).toEqual(['09:00']);

    const fourthSubmission = await request(app).post(route('submit')).set(auth(facultyToken)).send({});
    expect(fourthSubmission.status).toBe(201);
    expect((await request(app).post(`/api/planner-reviews/${fourthSubmission.body.submission.id}`).set(auth(chairToken)).send({ decision: 'REJECT' })).status).toBe(400);
    const rejected = await request(app).post(`/api/planner-reviews/${fourthSubmission.body.submission.id}`).set(auth(chairToken)).send({ decision: 'REJECT', feedback: 'Please move the Monday session.' });
    expect(rejected.body.submission).toMatchObject({ status: 'REJECTED', feedback: 'Please move the Monday session.' });
    expect((await request(app).get('/api/notifications').set(auth(facultyToken))).body.notifications.some((item: { type: string; message: string }) => item.type === 'REJECTED' && item.message.includes('move the Monday'))).toBe(true);

    const finalDraft = await request(app).put(route('')).set(auth(facultyToken)).send({ sessions: schedule('12:00'), expectedRevision: 3 });
    expect(finalDraft.status).toBe(200);
    const finalSubmission = await request(app).post(route('submit')).set(auth(facultyToken)).send({});
    expect(finalSubmission.status).toBe(201);
    const finalApproval = await request(app).post(`/api/planner-reviews/${finalSubmission.body.submission.id}`).set(auth(chairToken)).send({ decision: 'APPROVE' });
    expect(finalApproval.body.submission.status).toBe('APPROVED');
    finalRows = await prisma.facultySession.findMany({ where: { faculty_id: facultyId, term_id: termId, deleted_at: null } });
    expect(finalRows.map((row) => row.start_time)).toEqual(['12:00']);
    const unread = await request(app).get('/api/notifications').set(auth(facultyToken));
    expect(unread.body.unreadCount).toBeGreaterThan(0);
    const notificationId = unread.body.notifications.find((item: { read_at: string | null }) => !item.read_at).id as string;
    expect((await request(app).patch(`/api/notifications/${notificationId}/read`).set(auth(otherFacultyToken))).status).toBe(404);
    expect((await request(app).patch(`/api/notifications/${notificationId}/read`).set(auth(facultyToken))).status).toBe(200);
    expect((await request(app).get('/api/notifications').set(auth(facultyToken))).body.unreadCount).toBe(unread.body.unreadCount - 1);
    expect((await request(app).get('/api/notifications').set(auth(chairToken))).body.pendingReviewCount).toBe(0);
  }, 20000);
});
