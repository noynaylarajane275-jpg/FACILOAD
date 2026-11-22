import { z } from 'zod';
export const formType=z.enum(['FACULTY_CLASS_PROGRAM','STUDENT_CLASS_PROGRAM','CLASSROOM_UTILIZATION']);
const text=z.string().trim().min(1).max(500);
const logo=z.string().regex(/^\/(?:school-logo\.jpg|uploads\/form-logos\/[a-f0-9-]+\.(?:png|jpg))$/).nullable();
export const formSettingsSchema=z.object({school_lines:text,college_lines:text,department:text,program:text,school_logo_path:logo,tuv_logo_path:logo}).strict();
export const formTemplateSchema=z.object({title:text,ref_code:z.string().trim().max(100),revision:z.string().trim().min(1).max(30)}).strict();
export const signatorySchema=z.object({slot:z.enum(['PREPARED','REVIEWED','VERIFIED','APPROVED']),name:text,title:text,active:z.boolean().default(true)}).strict();
