import { z } from 'zod';
import { uuidIdSchema } from './subject.validation.js';

function presentString(label: string, max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
      .trim()
      .min(1, `${label} is required`)
      .max(max, `${label} must be at most ${max} characters`),
  );
}

function optionalText(label: string, max: number) {
  return z.preprocess(
    (value) => {
      if (value === null) {
        return null;
      }
      if (typeof value === 'string' && value.trim() === '') {
        return null;
      }
      return value;
    },
    z
      .string({ invalid_type_error: `${label} must be text` })
      .trim()
      .max(max, `${label} must be at most ${max} characters`)
      .nullable()
      .optional(),
  );
}

/** Hours: positive number up to 40. */
function hoursSchema(label: string) {
  return z
    .preprocess(
      (value) => (value === null || value === undefined ? undefined : value),
      z.coerce.number({ invalid_type_error: `${label} must be a number` }),
    )
    .refine((n) => n > 0, `${label} must be greater than 0`)
    .refine((n) => n <= 40, `${label} must be 40 or less`);
}

export const createDesignationSchema = z
  .object({
    name: presentString('Name', 120),
    default_hours: hoursSchema('Default hours'),
    service_credit_hours: z.coerce
      .number({ invalid_type_error: 'Service credit hours must be a number' })
      .min(0, 'Service credit hours must be 0 or more')
      .default(0),
    grants_service_credit: z
      .preprocess(
        (value) => value === undefined || value === null ? undefined : value,
        z.boolean().optional(),
      )
      .default(false),
  })
  .strict();

export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;

export const updateDesignationSchema = createDesignationSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export type UpdateDesignationInput = z.infer<typeof updateDesignationSchema>;

export const assignDesignationSchema = z
  .object({
    designation_id: uuidIdSchema,
    term_id: uuidIdSchema,
    hours: hoursSchema('Hours'),
    service_credit: z.coerce
      .number({ invalid_type_error: 'Service credit must be a number' })
      .min(0, 'Service credit must be 0 or more')
      .optional(),
  })
  .strict();

export type AssignDesignationInput = z.infer<typeof assignDesignationSchema>;

export const updateFacultyDesignationSchema = z
  .object({
    hours: hoursSchema('Hours').optional(),
    service_credit: z.coerce
      .number({ invalid_type_error: 'Service credit must be a number' })
      .min(0, 'Service credit must be 0 or more')
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export type UpdateFacultyDesignationInput = z.infer<typeof updateFacultyDesignationSchema>;

export const facultyDesignationsQuerySchema = z.object({
  termId: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().uuid('Term must be a UUID').optional(),
  ),
});

export type FacultyDesignationsQueryInput = z.infer<typeof facultyDesignationsQuerySchema>;
