import { prisma } from '../config/prisma.js';
export const getFormSettings=()=>prisma.formSettings.upsert({where:{id:'singleton'},create:{id:'singleton'},update:{}});
export const listFormTemplates=()=>prisma.formTemplate.findMany({orderBy:{type:'asc'}});
export const listSignatories=()=>prisma.signatoryOption.findMany({orderBy:[{slot:'asc'},{name:'asc'}]});
