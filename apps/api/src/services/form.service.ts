import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../errors/apiError.js';
import { validate } from './faculty-program.service.js';
import { formSettingsSchema,formTemplateSchema,formType,signatorySchema } from '../validation/form.validation.js';
import * as repo from '../repositories/form.repository.js';
import { uploadsRoot,detectImageType,MAX_AVATAR_BYTES } from './avatar.service.js';
export const formLogoDir=()=>path.join(uploadsRoot(),'form-logos');
export async function getFormConfiguration(){
  const [settings,templates,signatories]=await Promise.all([repo.getFormSettings(),repo.listFormTemplates(),repo.listSignatories()]);
  return {settings,templates,signatories};
}
export const putFormSettings=(body:unknown)=>prisma.formSettings.update({where:{id:'singleton'},data:validate(formSettingsSchema,body)});
export const putFormTemplate=(type:unknown,body:unknown)=>prisma.formTemplate.upsert({where:{type:validate(formType,type)},create:{type:validate(formType,type),...validate(formTemplateSchema,body)},update:validate(formTemplateSchema,body)});
export const createSignatory=(body:unknown)=>prisma.signatoryOption.create({data:validate(signatorySchema,body)});
export async function updateSignatory(id:string,body:unknown){
  if(!await prisma.signatoryOption.findUnique({where:{id}})) throw ApiError.notFound('Signatory option not found');
  return prisma.signatoryOption.update({where:{id},data:validate(signatorySchema,body)});
}
export async function saveFormLogo(kind:'school'|'tuv',file:Express.Multer.File){
  const type=detectImageType(file.buffer);
  if(file.size>MAX_AVATAR_BYTES || !['image/png','image/jpeg'].includes(type??'') || file.mimetype!==type) throw ApiError.badRequest('Logo must be a PNG or JPG image no larger than 2MB');
  const name=`${randomUUID()}.${type==='image/png'?'png':'jpg'}`;
  await fs.mkdir(formLogoDir(),{recursive:true});
  const full=path.join(formLogoDir(),name), url=`/uploads/form-logos/${name}`;
  await fs.writeFile(full,file.buffer);
  try {return await prisma.formSettings.update({where:{id:'singleton'},data:kind==='school'?{school_logo_path:url}:{tuv_logo_path:url}});}
  catch(error){await fs.unlink(full);throw error;}
}
