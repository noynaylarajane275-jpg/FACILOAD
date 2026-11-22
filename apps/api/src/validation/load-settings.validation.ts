import { z } from 'zod';
const hours = z.number().finite().min(0).max(168);
export const loadSettingsSchema = z.object({
  lab_coefficient: z.number().finite().min(0).max(1),
  weekly_hours: hours.positive(), consultation_hours: hours.min(1),
  min_research: hours.min(1), min_extension: hours.min(1), min_imp: hours,
  min_session_hours: hours.min(1).max(23.5),
  prep_tiers: z.array(z.object({ minPreps: z.number().int().min(1), maxPreps: z.number().int().min(1), ceiling: hours })).min(1).max(20),
}).strict().superRefine((data, ctx) => {
  let next = 1;
  for (const tier of data.prep_tiers) {
    if (tier.minPreps !== next || tier.maxPreps < tier.minPreps) ctx.addIssue({ code:'custom',path:['prep_tiers'],message:'Prep tiers must be ordered, contiguous and non-overlapping, starting at 1.' });
    next = tier.maxPreps + 1;
  }
});
