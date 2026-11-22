import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../errors/apiError.js';
import type { AuthTokenPayload } from './auth.service.js';
import { assertFacultyScope, sessionHours, validate } from './faculty-program.service.js';
import { sessionSchema } from '../validation/faculty-program.validation.js';
import { getFacultyTeachingLoad, type TeachingLoadOutput } from './teaching-load.service.js';
import { getLoadConfig } from './load-settings.service.js';
import * as programRepository from '../repositories/faculty-program.repository.js';
import { list as listScheduleSlots } from '../repositories/schedule-slot.repository.js';
import { toScheduleSlotDto } from './schedule-slot.service.js';

type PlannerSession = TeachingLoadOutput['sessions'][number];
type Transaction = Prisma.TransactionClient;
const draftRequestSchema = z.object({
  sessions: z.array(z.unknown()).max(300),
  expectedRevision: z.number().int().nonnegative().optional(),
}).strict();
const decisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  feedback: z.string().trim().max(1000).optional().default(''),
}).strict();
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const overlaps = (a: { start_time: string; end_time: string }, b: { start_time: string; end_time: string }) =>
  a.start_time < b.end_time && a.end_time > b.start_time;

function normalizeSessions(input: unknown[]): PlannerSession[] {
  const result: PlannerSession[] = [];
  const ids = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw ApiError.badRequest('Each planner session must be an object');
    const raw = item as Record<string, unknown>;
    const id = raw.id === undefined ? randomUUID() : validate(z.string().uuid(), raw.id);
    if (ids.has(id)) throw ApiError.badRequest('Planner session IDs must be unique');
    ids.add(id);
    const { id: _ignored, ...sessionInput } = raw;
    const session = validate(sessionSchema, sessionInput);
    result.push({ ...session, id, faculty_designation_id: session.faculty_designation_id ?? null });
  }
  return result;
}

function parseSessions(value: string): PlannerSession[] {
  let decoded: unknown;
  try { decoded = JSON.parse(value); } catch { throw ApiError.server('Planner snapshot could not be read'); }
  if (!Array.isArray(decoded)) throw ApiError.server('Planner snapshot is invalid');
  return normalizeSessions(decoded);
}

function requireFacultyOwner(user: AuthTokenPayload, facultyId: string): void {
  if (user.role !== 'FACULTY' || user.facultyId !== facultyId) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the owning faculty account may edit or submit this planner');
  }
}

async function validatePlannerSessions(facultyId: string, termId: string, sessions: PlannerSession[]): Promise<void> {
  const [baseLoad, config, designations, teachingRows] = await Promise.all([
    getFacultyTeachingLoad(facultyId, termId, []),
    getLoadConfig(),
    prisma.facultyDesignation.findMany({
      where: { faculty_id: facultyId, term_id: termId, deleted_at: null, designation: { deleted_at: null } },
      select: { id: true },
    }),
    listScheduleSlots({ termId, facultyId, sectionId: null, roomId: null }),
  ]);
  const designationIds = new Set(designations.map((designation) => designation.id));
  const teaching = teachingRows.map(toScheduleSlotDto);
  let overloadHours = 0;
  for (let index = 0; index < sessions.length; index++) {
    const session = sessions[index]!;
    const duration = sessionHours(session);
    if (duration < config.minDesignationSessionHours) throw ApiError.badRequest(`A function session must be at least ${config.minDesignationSessionHours} hour(s)`);
    if (session.type === 'OVERLOAD') {
      if (!Number.isInteger(duration)) throw ApiError.badRequest('Overload sessions must have a whole-hour duration');
      overloadHours += duration;
    }
    if (session.type === 'DESIGNATION' && (!session.faculty_designation_id || !designationIds.has(session.faculty_designation_id))) {
      throw ApiError.badRequest('A designation session must use an active designation assigned to this faculty member and term');
    }
    const conflict = teaching.find((slot) => slot.day_of_week === session.day_of_week && overlaps(session, slot));
    if (conflict) {
      throw ApiError.conflict('FACULTY_CONFLICT', 'A function session overlaps a teaching session', {
        day_of_week: session.day_of_week,
        start_time: session.start_time,
        end_time: session.end_time,
        conflicting_slot: conflict,
      });
    }
    const other = sessions.slice(index + 1).find((candidate) => candidate.day_of_week === session.day_of_week && overlaps(session, candidate));
    if (other) {
      throw ApiError.conflict('FACULTY_CONFLICT', 'Function sessions cannot overlap each other', {
        day_of_week: session.day_of_week,
        start_time: session.start_time,
        end_time: session.end_time,
        conflicting_session: { type: other.type, start_time: other.start_time, end_time: other.end_time },
      });
    }
  }
  if (overloadHours > baseLoad.claimable_overload_hours) {
    throw ApiError.conflict('OVERLOAD_CAP_EXCEEDED', `Plotted overload cannot exceed ${baseLoad.claimable_overload_hours} claimable hour(s)`);
  }
  if (sessions.some((session) => minutes(session.end_time) <= minutes(session.start_time))) {
    throw ApiError.badRequest('A session must end after it starts');
  }
}

async function notify(tx: Transaction, recipientId: string, submissionId: string | null, type: string, title: string, message: string): Promise<void> {
  if (submissionId) await tx.plannerNotification.deleteMany({ where: { recipient_user_id: recipientId, submission_id: submissionId } });
  await tx.plannerNotification.create({
    data: { recipient_user_id: recipientId, submission_id: submissionId, type, title, message },
  });
  const older = await tx.plannerNotification.findMany({where:{recipient_user_id:recipientId},orderBy:[{created_at:'desc'},{id:'desc'}],skip:10,select:{id:true}});
  if (older.length) await tx.plannerNotification.deleteMany({where:{id:{in:older.map(item=>item.id)}}});
}

async function notifyFaculty(tx: Transaction, facultyId: string, submissionId: string | null, type: string, title: string, message: string): Promise<void> {
  const user = await tx.user.findFirst({ where: { faculty_id: facultyId, is_active: true }, select: { id: true } });
  if (user) await notify(tx, user.id, submissionId, type, title, message);
}

async function notifyChairs(tx: Transaction, submissionId: string, type: string, title: string, message: string): Promise<void> {
  if (type !== 'SUBMITTED') { await tx.plannerNotification.deleteMany({where:{submission_id:submissionId,recipient:{role:'CHAIR'}}}); return; }
  const chairs = await tx.user.findMany({ where: { role: 'CHAIR', is_active: true }, select: { id: true } });
  for (const chair of chairs) await notify(tx, chair.id, submissionId, type, title, message);
}

export async function getPlannerState(user: AuthTokenPayload, facultyId: string, termId: string) {
  await assertFacultyScope(user, facultyId, termId);
  const [draft, finalRows, pending, latestSubmission, slots, approvedSubmission] = await Promise.all([
    prisma.plannerDraft.findUnique({ where: { faculty_id_term_id: { faculty_id: facultyId, term_id: termId } } }),
    programRepository.listSessions(facultyId, termId),
    prisma.plannerSubmission.findFirst({ where: { faculty_id: facultyId, term_id: termId, status: 'PENDING' }, orderBy: { submitted_at: 'desc' } }),
    prisma.plannerSubmission.findFirst({ where: { faculty_id: facultyId, term_id: termId }, orderBy: { submitted_at: 'desc' }, select: { id: true, status: true, feedback: true, submitted_at: true, reviewed_at: true } }),
    listScheduleSlots({ termId, facultyId, sectionId: null, roomId: null }),
    prisma.plannerSubmission.findFirst({ where: { faculty_id: facultyId, term_id: termId, status: 'APPROVED' }, orderBy: { reviewed_at: 'desc' }, select: { id: true, reviewed_at: true } }),
  ]);
  const approvedSessions = finalRows.map((row) => ({
    id: row.id,
    type: row.type,
    faculty_designation_id: row.faculty_designation_id,
    day_of_week: row.day_of_week,
    start_time: row.start_time,
    end_time: row.end_time,
  })) as PlannerSession[];
  const sessions = draft ? parseSessions(draft.sessions_json) : approvedSessions;
  const load = await getFacultyTeachingLoad(facultyId, termId, sessions);
  return {
    draft: draft ? { id: draft.id, revision: draft.revision, sessions, updated_at: draft.updated_at } : null,
    sessions,
    pendingSubmission: pending ? { id: pending.id, status: pending.status, submitted_at: pending.submitted_at } : null,
    latestSubmission,
    approvedSubmission,
    approvedSessions,
    teachingSlots: slots.map(toScheduleSlotDto),
    load,
  };
}

export async function savePlannerDraft(user: AuthTokenPayload, facultyId: string, termId: string, body: unknown) {
  requireFacultyOwner(user, facultyId);
  await assertFacultyScope(user, facultyId, termId);
  const request = validate(draftRequestSchema, body);
  const sessions = normalizeSessions(request.sessions);
  await validatePlannerSessions(facultyId, termId, sessions);
  return prisma.$transaction(async (tx) => {
    const current = await tx.plannerDraft.findUnique({ where: { faculty_id_term_id: { faculty_id: facultyId, term_id: termId } } });
    if (request.expectedRevision !== undefined && request.expectedRevision !== (current?.revision ?? 0)) {
      throw ApiError.conflict('DRAFT_CHANGED', 'This draft changed in another session. Reload it before saving.');
    }
    const pending = await tx.plannerSubmission.findFirst({ where: { faculty_id: facultyId, term_id: termId, status: 'PENDING' }, orderBy: { submitted_at: 'desc' } });
    if (pending) {
      const withdrawn = await tx.plannerSubmission.updateMany({ where: { id: pending.id, status: 'PENDING' }, data: { status: 'WITHDRAWN', feedback: 'Faculty saved a correction; resubmission is required.' } });
      if (withdrawn.count !== 1) throw ApiError.conflict('SUBMISSION_CHANGED', 'The submission was already reviewed. Reload the planner before saving.');
      await notifyFaculty(tx, facultyId, pending.id, 'WITHDRAWN', 'Submission withdrawn for correction', 'Your saved changes withdrew the pending submission. Submit the revised planner again for approval.');
      await notifyChairs(tx, pending.id, 'WITHDRAWN', 'Planner submission withdrawn', 'The faculty member saved a correction. The revised planner must be resubmitted.');
    }
    const revision = (current?.revision ?? 0) + 1;
    const saved = current
      ? await tx.plannerDraft.update({ where: { id: current.id }, data: { revision, sessions_json: JSON.stringify(sessions) } })
      : await tx.plannerDraft.create({ data: { faculty_id: facultyId, term_id: termId, revision, sessions_json: JSON.stringify(sessions) } });
    return { id: saved.id, revision: saved.revision, sessions, updated_at: saved.updated_at, withdrawnSubmissionId: pending?.id ?? null };
  });
}

export async function submitPlannerDraft(user: AuthTokenPayload, facultyId: string, termId: string) {
  requireFacultyOwner(user, facultyId);
  await assertFacultyScope(user, facultyId, termId);
  const draft = await prisma.plannerDraft.findUnique({ where: { faculty_id_term_id: { faculty_id: facultyId, term_id: termId } } });
  if (!draft) throw ApiError.badRequest('Save a planner draft before submitting it');
  const sessions = parseSessions(draft.sessions_json);
  await validatePlannerSessions(facultyId, termId, sessions);
  const [load, teachingRows, faculty] = await Promise.all([
    getFacultyTeachingLoad(facultyId, termId, sessions),
    listScheduleSlots({ termId, facultyId, sectionId: null, roomId: null }),
    prisma.faculty.findFirst({ where: { id: facultyId, deleted_at: null }, select: { first_name: true, last_name: true } }),
  ]);
  if (!faculty) throw ApiError.notFound('Faculty member not found');
  const teachingJson = JSON.stringify({ slots: teachingRows.map(toScheduleSlotDto) });
  return prisma.$transaction(async (tx) => {
    const currentDraft = await tx.plannerDraft.findUnique({ where: { faculty_id_term_id: { faculty_id: facultyId, term_id: termId } } });
    if (!currentDraft || currentDraft.revision !== draft.revision || currentDraft.sessions_json !== draft.sessions_json) {
      throw ApiError.conflict('DRAFT_CHANGED', 'The planner changed while it was being prepared. Reload and submit again.');
    }
    const existing = await tx.plannerSubmission.findFirst({ where: { faculty_id: facultyId, term_id: termId }, orderBy: { submitted_at: 'desc' } });
    const snapshot = { draft_revision: draft.revision, sessions_json: JSON.stringify(sessions), teaching_json: teachingJson, load_json: JSON.stringify(load), status: 'PENDING', feedback: '', reviewed_at: null, reviewed_by_user_id: null, submitted_at: new Date() };
    const submission = existing
      ? await tx.plannerSubmission.update({ where: { id: existing.id }, data: snapshot })
      : await tx.plannerSubmission.create({ data: { faculty_id: facultyId, term_id: termId, ...snapshot } });
    await tx.plannerNotification.deleteMany({ where: { submission: { faculty_id: facultyId, term_id: termId } } });
    await notifyChairs(tx, submission.id, 'SUBMITTED', 'Planner awaiting review', `${faculty.first_name} ${faculty.last_name} submitted a weekly planner for approval.`);
    return { id: submission.id, status: submission.status, submitted_at: submission.submitted_at };
  });
}

export async function cancelPlannerSubmission(user: AuthTokenPayload, facultyId: string, termId: string) {
  requireFacultyOwner(user, facultyId);
  await assertFacultyScope(user, facultyId, termId);
  return prisma.$transaction(async (tx) => {
    const pending = await tx.plannerSubmission.findFirst({ where: { faculty_id: facultyId, term_id: termId, status: 'PENDING' }, orderBy: { submitted_at: 'desc' } });
    if (!pending) throw ApiError.conflict('NO_PENDING_SUBMISSION', 'There is no pending planner submission to cancel');
    const cancelled = await tx.plannerSubmission.updateMany({ where: { id: pending.id, status: 'PENDING' }, data: { status: 'CANCELLED', feedback: 'Cancelled by faculty.' } });
    if (cancelled.count !== 1) throw ApiError.conflict('SUBMISSION_CHANGED', 'The submission was already reviewed. Reload the planner.');
    await notifyFaculty(tx, facultyId, pending.id, 'CANCELLED', 'Planner submission cancelled', 'Your editable draft and previously approved planner were preserved.');
    await notifyChairs(tx, pending.id, 'CANCELLED', 'Planner submission cancelled', 'The faculty member cancelled the pending planner submission.');
    return { id: pending.id, status: 'CANCELLED' };
  });
}

export async function createChairPlanner(user: AuthTokenPayload, body: unknown) {
  if(user.role !== 'CHAIR') throw new ApiError(403,'FORBIDDEN','Chair only');
  const {facultyId,termId}=validate(z.object({facultyId:z.string().uuid(),termId:z.string().uuid()}).strict(),body);
  await assertFacultyScope(user,facultyId,termId);
  const state=await getPlannerState(user,facultyId,termId);
  const sessions=state.sessions;
  await validatePlannerSessions(facultyId,termId,sessions);
  return prisma.$transaction(async tx=>{
    const existing=await tx.plannerSubmission.findFirst({where:{faculty_id:facultyId,term_id:termId},orderBy:{submitted_at:'desc'}});
    if(existing) return existing;
    return tx.plannerSubmission.create({data:{faculty_id:facultyId,term_id:termId,draft_revision:state.draft?.revision??0,sessions_json:JSON.stringify(sessions),load_json:JSON.stringify(state.load),teaching_json:JSON.stringify({slots:state.teachingSlots}),status:'PENDING'}});
  });
}

export async function deleteChairPlanner(user: AuthTokenPayload,idValue: unknown) {
  if(user.role !== 'CHAIR') throw new ApiError(403,'FORBIDDEN','Chair only');
  const id=validate(z.string().uuid(),idValue);
  await prisma.$transaction(async tx=>{
    const row=await tx.plannerSubmission.findUnique({where:{id}});
    if(!row) throw ApiError.notFound('Planner not found');
    await tx.plannerNotification.deleteMany({where:{submission:{faculty_id:row.faculty_id,term_id:row.term_id}}});
    await tx.plannerSubmission.delete({where:{id}});

  });
}

export async function previewPlannerRevision(idValue: unknown, body: unknown) {
  const id = validate(z.string().uuid(), idValue);
  const source = await prisma.plannerSubmission.findUnique({where:{id}});
  if (!source) throw ApiError.notFound('Planner submission not found');
  const request = validate(draftRequestSchema, body);
  const sessions = normalizeSessions(request.sessions);
  await validatePlannerSessions(source.faculty_id,source.term_id,sessions);
  return getFacultyTeachingLoad(source.faculty_id,source.term_id,sessions);
}

export async function revisePlannerSubmission(user: AuthTokenPayload, idValue: unknown, body: unknown) {
  if (user.role !== 'CHAIR') throw new ApiError(403, 'FORBIDDEN', 'Only the Chair can revise submitted planners');
  const id = validate(z.string().uuid(), idValue);
  const source = await prisma.plannerSubmission.findUnique({where:{id}});
  if (!source) throw ApiError.notFound('Planner submission not found');

  const request = validate(draftRequestSchema, body);
  const sessions = normalizeSessions(request.sessions);
  await validatePlannerSessions(source.faculty_id, source.term_id, sessions);
  const load = await getFacultyTeachingLoad(source.faculty_id, source.term_id, sessions);
  const teaching = await listScheduleSlots({termId:source.term_id,facultyId:source.faculty_id,sectionId:null,roomId:null});
  return prisma.$transaction(async tx => {
    const latest = await tx.plannerSubmission.findFirst({where:{faculty_id:source.faculty_id,term_id:source.term_id,status:'PENDING'}});
    if (latest && latest.id !== id) throw ApiError.conflict('SUBMISSION_CHANGED','A newer submission needs review. Open that submission instead.');
    const current = await tx.plannerSubmission.findUnique({where:{id}});
    if (current?.status !== source.status || current.sessions_json !== source.sessions_json) throw ApiError.conflict('SUBMISSION_CHANGED','This submission changed. Reload before editing.');
    const draft = await tx.plannerDraft.upsert({where:{faculty_id_term_id:{faculty_id:source.faculty_id,term_id:source.term_id}},create:{faculty_id:source.faculty_id,term_id:source.term_id,revision:1,sessions_json:JSON.stringify(sessions)},update:{revision:{increment:1},sessions_json:JSON.stringify(sessions)}});
    const replacement = await tx.plannerSubmission.update({where:{id},data:{draft_revision:draft.revision,sessions_json:JSON.stringify(sessions),load_json:JSON.stringify(load),teaching_json:JSON.stringify({slots:teaching.map(toScheduleSlotDto)}),status:source.status === 'APPROVED' ? 'APPROVED' : 'PENDING',reviewed_at:source.status === 'APPROVED' ? new Date() : null,reviewed_by_user_id:source.status === 'APPROVED' ? user.userId : null}});
    if (source.status === 'APPROVED') {
      await tx.facultySession.updateMany({where:{faculty_id:source.faculty_id,term_id:source.term_id,deleted_at:null},data:{deleted_at:new Date()}});
      for (const session of sessions) await tx.facultySession.create({data:{faculty_id:source.faculty_id,term_id:source.term_id,type:session.type,faculty_designation_id:session.faculty_designation_id,day_of_week:session.day_of_week,start_time:session.start_time,end_time:session.end_time}});
    }
    await notifyFaculty(tx,source.faculty_id,id,'UPDATED','Chair updated your planner','Your planner and editable draft were updated. Approved planner changes are synced to Teaching Load.');
    return replacement;
  });
}

export async function listPlannerReviews(includeHistory = false) {
  const rows = await prisma.plannerSubmission.findMany({
    where: includeHistory ? {} : { status: 'PENDING' },
    include: { faculty: { select: { first_name: true, last_name: true, employee_no: true } }, term: true },
    orderBy: { submitted_at: 'asc' },
  });
  const currentRows = rows.filter((row, index) => !rows.slice(index + 1).some(candidate => candidate.faculty_id === row.faculty_id && candidate.term_id === row.term_id));
  return currentRows.map((row) => ({
    id: row.id,
    status: row.status,
    faculty_id: row.faculty_id,
    faculty_name: `${row.faculty.first_name} ${row.faculty.last_name}`,
    employee_no: row.faculty.employee_no,
    term_id: row.term_id,
    term_label: `${row.term.school_year} ${row.term.semester}`,
    submitted_at: row.submitted_at,
  }));
}

export async function getPlannerReview(idValue: unknown) {
  const id = validate(z.string().uuid(), idValue);
  const row = await prisma.plannerSubmission.findUnique({
    where: { id },
    include: { faculty: { select: { first_name: true, last_name: true, employee_no: true } }, term: true },
  });
  if (!row) throw ApiError.notFound('Planner submission not found');
  let teaching: { slots: unknown[] };
  let load: TeachingLoadOutput;
  try {
    teaching = JSON.parse(row.teaching_json) as { slots: unknown[] };
    load = JSON.parse(row.load_json) as TeachingLoadOutput;
  } catch { throw ApiError.server('The submitted planner snapshot could not be read'); }
  return {
    id: row.id,
    status: row.status,
    feedback: row.feedback,
    submitted_at: row.submitted_at,
    faculty: { id: row.faculty_id, name: `${row.faculty.first_name} ${row.faculty.last_name}`, employee_no: row.faculty.employee_no },
    term: { id: row.term_id, label: `${row.term.school_year} ${row.term.semester}` },
    sessions: parseSessions(row.sessions_json),
    teachingSlots: teaching.slots,
    load,
  };
}

export async function decidePlannerSubmission(user: AuthTokenPayload, idValue: unknown, body: unknown) {
  if (user.role !== 'CHAIR') throw new ApiError(403, 'FORBIDDEN', 'Chair only');
  const id = validate(z.string().uuid(), idValue);
  const decision = validate(decisionSchema, body);
  if (decision.decision === 'REJECT' && !decision.feedback.trim()) throw ApiError.badRequest('A rejection reason is required');
  const submission = await prisma.plannerSubmission.findUnique({ where: { id } });
  if (!submission) throw ApiError.notFound('Planner submission not found');
  if (submission.status !== 'PENDING') throw ApiError.conflict('SUBMISSION_ALREADY_REVIEWED', 'This submission is no longer pending review');
  const sessions = parseSessions(submission.sessions_json);
  if (decision.decision === 'APPROVE') await validatePlannerSessions(submission.faculty_id, submission.term_id, sessions);
  return prisma.$transaction(async (tx) => {
    const stillPending = await tx.plannerSubmission.findFirst({ where: { id, status: 'PENDING' } });
    if (stillPending && (stillPending.sessions_json !== submission.sessions_json || stillPending.draft_revision !== submission.draft_revision)) throw ApiError.conflict('SUBMISSION_CHANGED', 'The planner changed. Reopen it before approval.');
    await tx.plannerNotification.deleteMany({where:{submission_id:id}});
    if (!stillPending) throw ApiError.conflict('SUBMISSION_ALREADY_REVIEWED', 'This submission is no longer pending review');
    if (decision.decision === 'REJECT') {
      await tx.plannerSubmission.update({ where: { id }, data: { status: 'REJECTED', feedback: decision.feedback, reviewed_at: new Date(), reviewed_by_user_id: user.userId } });
      await notifyFaculty(tx, submission.faculty_id, id, 'REJECTED', 'Planner needs revision', decision.feedback);
      return { id, status: 'REJECTED', feedback: decision.feedback };
    }
    await tx.plannerSubmission.updateMany({ where: { faculty_id: submission.faculty_id, term_id: submission.term_id, status: 'APPROVED' }, data: { status: 'SUPERSEDED' } });
    await tx.facultySession.updateMany({ where: { faculty_id: submission.faculty_id, term_id: submission.term_id, deleted_at: null }, data: { deleted_at: new Date() } });
    for (const session of sessions) {
      await tx.facultySession.create({
        data: {
          faculty_id: submission.faculty_id,
          term_id: submission.term_id,
          type: session.type,
          faculty_designation_id: session.faculty_designation_id,
          day_of_week: session.day_of_week,
          start_time: session.start_time,
          end_time: session.end_time,
        },
      });
    }
    const approved = await tx.plannerSubmission.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', feedback: decision.feedback, reviewed_at: new Date(), reviewed_by_user_id: user.userId },
    });
    if (approved.count !== 1) throw ApiError.conflict('SUBMISSION_ALREADY_REVIEWED', 'This submission is no longer pending review');
    await notifyFaculty(tx, submission.faculty_id, id, 'APPROVED', 'Planner approved', 'Your submitted planner is now the approved final planner.');
    return { id, status: 'APPROVED' };
  });
}

export async function listPlannerNotifications(user: AuthTokenPayload) {
  const [notifications, unreadCount, pendingReviewCount] = await Promise.all([
    prisma.plannerNotification.findMany({
      where: { recipient_user_id: user.userId },
      include: { submission: { select: { id: true, status: true, faculty_id: true, term_id: true } } },
      orderBy: { created_at: 'desc' },
      take: 10,
    }),
    prisma.plannerNotification.count({ where: { recipient_user_id: user.userId, read_at: null } }),
    user.role === 'CHAIR' ? prisma.plannerSubmission.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),
  ]);
  return { notifications, unreadCount: notifications.filter(item => !item.read_at).length, pendingReviewCount };
}

export async function markPlannerNotificationRead(user: AuthTokenPayload, idValue: unknown) {
  const id = validate(z.string().uuid(), idValue);
  const result = await prisma.plannerNotification.updateMany({ where: { id, recipient_user_id: user.userId, read_at: null }, data: { read_at: new Date() } });
  if (!result.count) {
    const exists = await prisma.plannerNotification.findFirst({ where: { id, recipient_user_id: user.userId }, select: { id: true } });
    if (!exists) throw ApiError.notFound('Notification not found');
  }
  return { id, read: true };
}

export async function markAllPlannerNotificationsRead(user: AuthTokenPayload) {
  const result = await prisma.plannerNotification.updateMany({ where: { recipient_user_id: user.userId, read_at: null }, data: { read_at: new Date() } });
  return { updated: result.count };
}

export async function archivePlannerNotification(user: AuthTokenPayload, idValue: unknown) {
  const id = validate(z.string().uuid(), idValue);
  const result = await prisma.plannerNotification.deleteMany({where:{id,recipient_user_id:user.userId}});
  if (!result.count) throw ApiError.notFound('Notification not found');
  return {id, archived:true};
}
