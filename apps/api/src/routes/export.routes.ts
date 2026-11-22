import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getProgramForm } from '../services/program-form.service.js';
import { buildProgramWorkbook } from '../services/program-export.service.js';
export const exportRouter=Router();
exportRouter.get('/exports/:kind/:id',requireAuth,asyncHandler(async(req,res)=>{
  const form=await getProgramForm(req.user!,req.params.kind,req.params.id,req.query);
  const data=await buildProgramWorkbook(form);
  const name=`${form.template.title} - ${form.entity.name}`.replace(/[^\w .-]/g,'').slice(0,120);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="${name}.xlsx"`);res.send(data);
}));
