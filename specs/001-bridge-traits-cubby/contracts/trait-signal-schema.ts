import { z } from 'zod';

export const TraitSignalSchema = z.object({
  skills: z.array(z.string()).default([]),
  years_of_experience: z.number().nonnegative().nullable(),
  company_stages: z.array(z.string()).default([]),
  education_level: z.string().nullable(),
  source_completeness: z.object({
    has_resume: z.boolean(),
    has_linkedin: z.boolean(),
  }),
  extracted_at: z.string().datetime(),
}).strict(); // strict() ensures no additional PII properties pass validation

export type TraitSignal = z.infer<typeof TraitSignalSchema>;
