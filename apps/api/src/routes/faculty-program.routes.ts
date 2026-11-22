import { Router } from 'express';
import { requireAuth, requireManagement } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { termIdQuery } from '../validation/faculty-program.validation.js';
import { assertFacultyScope,validate,putFunctions,getFacultyStudents,putFacultyStudents } from '../services/faculty-program.service.js';
import { listSessions } from '../repositories/faculty-program.repository.js';
import { ApiError } from '../errors/apiError.js';
import { archivePlannerNotification, revisePlannerSubmission, previewPlannerRevision,createChairPlanner,deleteChairPlanner } from '../services/planner-approval.service.js';
import { cancelPlannerSubmission, decidePlannerSubmission, getPlannerReview, getPlannerState, listPlannerNotifications, listPlannerReviews, markAllPlannerNotificationsRead, markPlannerNotificationRead, savePlannerDraft, submitPlannerDraft } from '../services/planner-approval.service.js';
export const facultyProgramRouter=Router();
facultyProgramRouter.use(requireAuth);
facultyProgramRouter.put('/faculty/:id/functions',asyncHandler(async(req,res)=>{const {termId}=validate(termIdQuery,req.query);res.json({load:await putFunctions(req.user!,req.params.id,termId,req.body)});}));
facultyProgramRouter.get('/faculty/:id/students',asyncHandler(async(req,res)=>{const {termId}=validate(termIdQuery,req.query);await assertFacultyScope(req.user!,req.params.id,termId);res.json(await getFacultyStudents(req.params.id,termId));}));
facultyProgramRouter.put('/faculty/:id/students',asyncHandler(async(req,res)=>{const {termId}=validate(termIdQuery,req.query);res.json(await putFacultyStudents(req.user!,req.params.id,termId,req.body));}));
facultyProgramRouter.get('/faculty/:id/sessions',asyncHandler(async(req,res)=>{const {termId}=validate(termIdQuery,req.query);await assertFacultyScope(req.user!,req.params.id,termId);res.json({data:await listSessions(req.params.id,termId)});}));
const approvedPlannerOnly=asyncHandler(async(_req,res)=>{throw ApiError.conflict('PLANNER_APPROVAL_REQUIRED','Function sessions become final only when a submitted planner is approved');});
facultyProgramRouter.post('/faculty/:id/sessions',approvedPlannerOnly);
facultyProgramRouter.patch('/faculty-sessions/:id',approvedPlannerOnly);
facultyProgramRouter.delete('/faculty-sessions/:id',approvedPlannerOnly);

facultyProgramRouter.get('/faculty/:id/planner-draft',asyncHandler(async(req,res)=>{const {termId}=validate(termIdQuery,req.query);res.json(await getPlannerState(req.user!,req.params.id,termId));}));
facultyProgramRouter.put('/faculty/:id/planner-draft',asyncHandler(async(req,res)=>{const {termId}=validate(termIdQuery,req.query);res.json({draft:await savePlannerDraft(req.user!,req.params.id,termId,req.body)});}));
facultyProgramRouter.post('/faculty/:id/planner-draft/submit',asyncHandler(async(req,res)=>{const {termId}=validate(termIdQuery,req.query);res.status(201).json({submission:await submitPlannerDraft(req.user!,req.params.id,termId)});}));
facultyProgramRouter.post('/faculty/:id/planner-draft/cancel-submission',asyncHandler(async(req,res)=>{const {termId}=validate(termIdQuery,req.query);res.json({submission:await cancelPlannerSubmission(req.user!,req.params.id,termId)});}));

facultyProgramRouter.get('/planner-reviews',requireManagement,asyncHandler(async(req,res)=>{res.json({data:await listPlannerReviews(req.query.history === 'true')});}));
facultyProgramRouter.post('/planner-reviews',requireManagement,asyncHandler(async(req,res)=>{const row=await createChairPlanner(req.user!,req.body);res.json({submission:await getPlannerReview(row.id)});}));
facultyProgramRouter.delete('/planner-reviews/:id',requireManagement,asyncHandler(async(req,res)=>{await deleteChairPlanner(req.user!,req.params.id);res.json({ok:true});}));
facultyProgramRouter.post('/planner-reviews/:id/preview',requireManagement,asyncHandler(async(req,res)=>{res.json({load:await previewPlannerRevision(req.params.id,req.body)});}));
facultyProgramRouter.put('/planner-reviews/:id',requireManagement,asyncHandler(async(req,res)=>{const revised=await revisePlannerSubmission(req.user!,req.params.id,req.body);res.json({submission:await getPlannerReview(revised.id)});}));
facultyProgramRouter.get('/planner-reviews/:id',requireManagement,asyncHandler(async(req,res)=>{res.json({submission:await getPlannerReview(req.params.id)});}));
facultyProgramRouter.post('/planner-reviews/:id',requireManagement,asyncHandler(async(req,res)=>{res.json({submission:await decidePlannerSubmission(req.user!,req.params.id,req.body)});}));

facultyProgramRouter.get('/notifications',asyncHandler(async(req,res)=>{res.json(await listPlannerNotifications(req.user!));}));
facultyProgramRouter.patch('/notifications/:id/read',asyncHandler(async(req,res)=>{res.json(await markPlannerNotificationRead(req.user!,req.params.id));}));
facultyProgramRouter.patch('/notifications/read-all',asyncHandler(async(req,res)=>{res.json(await markAllPlannerNotificationsRead(req.user!));}));

facultyProgramRouter.delete('/notifications/:id',asyncHandler(async(req,res)=>{res.json(await archivePlannerNotification(req.user!,req.params.id));}));
