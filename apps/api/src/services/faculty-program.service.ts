import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../errors/apiError.js';
import type { AuthTokenPayload } from './auth.service.js';
import { getLoadConfig } from './load-settings.service.js';
import { getFacultyTeachingLoad, round2 } from './teaching-load.service.js';
import * as repo from '../repositories/faculty-program.repository.js';
import { isManagementRole } from '../types/domain.js';
import { functionsSchema,sessionSchema,studentsSchema } from '../validation/faculty-program.validation.js';
export function validate<T extends z.ZodTypeAny>(schema:T,value:unknown):z.infer<T>{
  const result=schema.safeParse(value); if(!result.success) throw ApiError.badRequest('Invalid request',result.error.flatten()); return result.data;
}
export const sessionHours=(s:{start_time:string;end_time:string})=>round2((toMinutes(s.end_time)-toMinutes(s.start_time))/60);
const toMinutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
export async function assertFacultyScope(user:AuthTokenPayload,facultyId:string,termId:string){
  validate(z.string().uuid(),facultyId); validate(z.string().uuid(),termId);
  if(user.role==='FACULTY' && user.facultyId!==facultyId) throw new ApiError(403,'FORBIDDEN','Faculty accounts may access only their own program');
  const faculty=await prisma.faculty.findFirst({where:{id:facultyId,deleted_at:null}});
  if(!faculty) throw ApiError.notFound('Faculty member not found');
  if(!await prisma.academicTerm.findUnique({where:{id:termId}})) throw ApiError.notFound('Term not found');
  return faculty;
}
export async function putFunctions(user:AuthTokenPayload,faculty_id:string,term_id:string,body:unknown){
  await assertFacultyScope(user,faculty_id,term_id);
  const data=validate(functionsSchema,body), config=await getLoadConfig();
  for(const key of ['research','extension','imp'] as const) if(data[`${key}_hours`]<config.minFunctionHours[key]) throw ApiError.badRequest(`${key} must be at least ${config.minFunctionHours[key]} hours`);
  const current=await repo.getFacultyLoad(faculty_id,term_id);
  if(data.consultation_hours!==undefined && !isManagementRole(user.role) && data.consultation_hours!==(current?.consultation_hours??config.consultationHours)) throw new ApiError(403,'FORBIDDEN','Only the Chair can override consultation hours');
  if(data.consultation_hours!==undefined && data.consultation_hours<config.minDesignationSessionHours) throw ApiError.badRequest('Consultation must meet the minimum session hours');
  if(!isManagementRole(user.role)) delete data.consultation_hours;
  return prisma.facultyLoad.upsert({where:repo.programKey(faculty_id,term_id),create:{faculty_id,term_id,...data},update:data});
}
export async function getFacultyStudents(faculty_id:string,term_id:string){
  const [handled,counts]=await Promise.all([repo.getHandledSections(faculty_id,term_id),repo.getStudents(faculty_id,term_id)]);
  const byId=new Map(counts.map(c=>[c.section_id,c.student_count]));
  const students=[...new Map(handled.map(({section})=>[section.id,{section_id:section.id,section_name:`${section.name} (Year ${section.year_level})`,student_count:byId.get(section.id)??null}])).values()];
  return {students,total_students:round2(students.reduce((sum,s)=>sum+(s.student_count??0),0))};
}
export async function putFacultyStudents(user:AuthTokenPayload,faculty_id:string,term_id:string,body:unknown){
  await assertFacultyScope(user,faculty_id,term_id); const data=validate(studentsSchema,body);
  const handled=new Set((await repo.getHandledSections(faculty_id,term_id)).map(r=>r.section.id));
  for(const s of data.students) if(!handled.has(s.section_id)) throw ApiError.badRequest('Student count section is not handled by this faculty in this term');
  await prisma.$transaction(data.students.map(s=>prisma.facultySectionStudents.upsert({where:{faculty_id_section_id_term_id:{faculty_id,term_id,section_id:s.section_id}},create:{faculty_id,term_id,...s},update:{student_count:s.student_count}})));
  return getFacultyStudents(faculty_id,term_id);
}
export async function saveFacultySession(user:AuthTokenPayload,faculty_id:string,term_id:string,body:unknown,id?:string){
  await assertFacultyScope(user,faculty_id,term_id);
  const data=validate(sessionSchema,body), config=await getLoadConfig(), hours=sessionHours(data);
  if(hours<config.minDesignationSessionHours) throw ApiError.badRequest(`A session must be at least ${config.minDesignationSessionHours} hour(s)`);
  if(data.type==='OVERLOAD' && !Number.isInteger(hours)) throw ApiError.badRequest('Overload sessions must have a whole-hour duration');
  const cap=(await getFacultyTeachingLoad(faculty_id,term_id)).claimable_overload_hours;
  return prisma.$transaction(async(tx)=>{
    if(id && !await tx.facultySession.findFirst({where:{id,faculty_id,term_id,deleted_at:null}})) throw ApiError.notFound('Session not found');
    if(data.type==='DESIGNATION' && !await tx.facultyDesignation.findFirst({where:{id:data.faculty_designation_id!,faculty_id,term_id,deleted_at:null,designation:{deleted_at:null}}})) throw ApiError.badRequest('Designation does not belong to this faculty and term');
    const sessions=await tx.facultySession.findMany({where:{faculty_id,term_id,deleted_at:null,id:id?{not:id}:undefined,OR:[{faculty_designation_id:null},{faculty_designation:{deleted_at:null,designation:{deleted_at:null}}}]}});
    const overlap=sessions.filter(s=>s.day_of_week===data.day_of_week && s.start_time<data.end_time && s.end_time>data.start_time);
    const teaching=await tx.scheduleSlot.findMany({where:{workload_assignment:{faculty_id,term_id,deleted_at:null},day_of_week:data.day_of_week,start_time:{lt:data.end_time},end_time:{gt:data.start_time}},include:{workload_assignment:{include:{subject:true,section:true}}}});
    if(overlap.length || teaching.length) throw ApiError.conflict('FACULTY_CONFLICT','Session overlaps an existing teaching or function session',{
      faculty_id,day_of_week:data.day_of_week,start_time:data.start_time,end_time:data.end_time,
      conflicting_slots:[...overlap.map(s=>({slot_id:s.id,assignment_id:'',day_of_week:s.day_of_week,start_time:s.start_time,end_time:s.end_time,room_name:null,faculty_name:'',subject_code:s.type,section_label:''})),...teaching.map(s=>({slot_id:s.id,assignment_id:s.workload_assignment_id,day_of_week:s.day_of_week,start_time:s.start_time,end_time:s.end_time,room_name:null,faculty_name:'',subject_code:s.workload_assignment.subject.code,section_label:s.workload_assignment.section.name}))],
    });
    if(data.type==='OVERLOAD' && round2(sessions.filter(s=>s.type==='OVERLOAD').reduce((n,s)=>n+sessionHours(s),0)+hours)>cap) throw ApiError.conflict('OVERLOAD_CAP_EXCEEDED',`Plotted overload cannot exceed ${cap} claimable hour(s)`);
    return id?tx.facultySession.update({where:{id},data}):tx.facultySession.create({data:{faculty_id,term_id,...data}});
  });
}
export async function deleteFacultySession(user:AuthTokenPayload,id:string){
  validate(z.string().uuid(),id);
  const session=await prisma.facultySession.findFirst({where:{id,deleted_at:null}});
  if(!session) throw ApiError.notFound('Session not found');
  await assertFacultyScope(user,session.faculty_id,session.term_id);
  await prisma.facultySession.update({where:{id},data:{deleted_at:new Date()}});
}
