import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../errors/apiError.js';
import type { AuthTokenPayload } from './auth.service.js';
import { assertFacultyScope,validate } from './faculty-program.service.js';
import { getFacultyTeachingLoad } from './teaching-load.service.js';
import { getFormConfiguration } from './form.service.js';
import { toTermDto } from './term.service.js';
import { list } from '../repositories/schedule-slot.repository.js';
import { toScheduleSlotDto } from './schedule-slot.service.js';
export const programQuerySchema=z.object({termId:z.string().uuid(),program:z.string().trim().max(160).optional(),major:z.string().trim().max(160).optional(),sig_prepared:z.string().trim().min(1).max(160).optional(),sig_reviewed:z.string().trim().min(1).max(160).optional(),sig_verified:z.string().trim().min(1).max(160).optional(),sig_approved:z.string().trim().min(1).max(160).optional()}).strict();
export const programKindSchema=z.enum(['faculty','sections','rooms']);
export async function getProgramForm(user:AuthTokenPayload,kindValue:unknown,idValue:unknown,queryValue:unknown){
  const kind=validate(programKindSchema,kindValue),id=validate(z.string().uuid(),idValue),query=validate(programQuerySchema,queryValue);
  if(kind==='faculty')await assertFacultyScope(user,id,query.termId);
  else if(user.role==='FACULTY')throw new ApiError(403,'FORBIDDEN','Faculty may print or export only their own faculty program');
  const term=await prisma.academicTerm.findUnique({where:{id:query.termId}});if(!term)throw ApiError.notFound('Term not found');
  let entity:{id:string;name:string;rank:string|null;student_count?:number|null};
  if(kind==='faculty'){
    const row=await prisma.faculty.findFirst({where:{id,deleted_at:null}});if(!row)throw ApiError.notFound('Faculty member not found');entity={id,name:`${row.first_name} ${row.last_name}`,rank:row.rank};
  }else if(kind==='sections'){
    const row=await prisma.section.findUnique({where:{id}});if(!row)throw ApiError.notFound('Section not found');entity={id,name:`${row.name} (Year ${row.year_level})`,rank:null,student_count:null};
  }else{
    const row=await prisma.room.findUnique({where:{id}});if(!row)throw ApiError.notFound('Room not found');entity={id,name:row.name,rank:null};
  }
  const [config,slots,load,assignments]=await Promise.all([getFormConfiguration(),list({termId:term.id,facultyId:kind==='faculty'?id:null,sectionId:kind==='sections'?id:null,roomId:kind==='rooms'?id:null}),kind==='faculty'?getFacultyTeachingLoad(id,term.id):Promise.resolve(null),kind==='faculty'?prisma.workloadAssignment.findMany({where:{faculty_id:id,term_id:term.id,deleted_at:null},include:{subject:true,section:true},orderBy:[{subject:{code:'asc'}},{section:{name:'asc'}}]}):Promise.resolve([])]);
  const type=kind==='faculty'?'FACULTY_CLASS_PROGRAM':kind==='sections'?'STUDENT_CLASS_PROGRAM':'CLASSROOM_UTILIZATION';
  const template=config.templates.find(t=>t.type===type);if(!template)throw ApiError.notFound('Form template is not configured');
  const signatureSlots=kind==='faculty'?['PREPARED','REVIEWED','VERIFIED','APPROVED'] as const:kind==='sections'?['PREPARED'] as const:['PREPARED','REVIEWED','APPROVED'] as const;
  const signatures=signatureSlots.map(slot=>{
    const chosen=query[`sig_${slot.toLowerCase()}` as 'sig_prepared'|'sig_reviewed'|'sig_verified'|'sig_approved'];
    const options=config.signatories.filter(s=>s.active&&s.slot===slot);
    const match=chosen?options.find(s=>s.id===chosen):options[0];
    if(chosen&&z.string().uuid().safeParse(chosen).success&&!match)throw ApiError.badRequest('Signatory option is inactive, unknown, or belongs to another slot');
    return {slot,name:match?.name??chosen??'',title:match?.title??'',option_id:match?.id??null};
  });
  return {kind,entity,term:toTermDto(term),settings:{...config.settings,program:query.program??config.settings.program,major:query.major??''},template,signatory_options:config.signatories.filter(s=>s.active),signatures,
    effectivity:load?.effectivity??{start:term.effectivity_start,end:term.effectivity_end,source:'TERM'},slots:slots.map(toScheduleSlotDto),load,
    assignments:assignments.map(a=>({id:a.id,subject_id:a.subject_id,subject_code:a.subject.code,section_id:a.section_id,section_label:`${a.section.name} (Year ${a.section.year_level})`,lecture_hours:a.subject.lecture_hours??0,lab_hours:a.subject.lab_hours??0}))};
}
