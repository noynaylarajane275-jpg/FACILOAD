import { prisma } from '../config/prisma.js';
export const programKey=(faculty_id:string,term_id:string)=>({faculty_id_term_id:{faculty_id,term_id}});
export const listSessions=(faculty_id:string,term_id:string)=>prisma.facultySession.findMany({where:{faculty_id,term_id,deleted_at:null,OR:[{faculty_designation_id:null},{faculty_designation:{deleted_at:null,designation:{deleted_at:null}}}]},orderBy:[{day_of_week:'asc'},{start_time:'asc'}]});
export const getFacultyLoad=(faculty_id:string,term_id:string)=>prisma.facultyLoad.findUnique({where:programKey(faculty_id,term_id)});
export const getStudents=(faculty_id:string,term_id:string)=>prisma.facultySectionStudents.findMany({where:{faculty_id,term_id}});
export const getHandledSections=(faculty_id:string,term_id:string)=>prisma.workloadAssignment.findMany({where:{faculty_id,term_id,deleted_at:null},select:{section:true}});
