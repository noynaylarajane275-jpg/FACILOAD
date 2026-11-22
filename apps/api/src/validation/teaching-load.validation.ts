import { z } from 'zod';
import { uuidIdSchema } from './subject.validation.js';

const hours = (label: string) =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` })
    .min(0, `${label} must be 0 or more`)
    .max(40, `${label} must be 40 or less`);

export const updateTeachingLoadDetailsSchema = z.object({
  term_id: uuidIdSchema,
  research: hours('Research').optional(),
  extension: hours('Extension').optional(),
  imp: hours('IMP').optional(),
  consultation: hours('Consultation').optional(),
  overload_plotted_hours: hours('Plotted overload').optional(),
}).strict().refine(
  (data) => Object.keys(data).some((key) => key !== 'term_id'),
  { message: 'Provide at least one teaching-load field to update' },
);

export type UpdateTeachingLoadDetailsInput = z.infer<typeof updateTeachingLoadDetailsSchema>;
