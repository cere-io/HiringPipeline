import { z } from 'zod';

const ScoredTraitSchema = z.object({
  items: z.array(z.string()).default([]),
  rating: z.number().min(0).max(10).describe("0-10 rating based on impressiveness"),
});

export const TraitSignalSchema = z.object({
  skills: z.array(z.string()).default([]),
  years_of_experience: z.number().nonnegative().nullable(),
  company_stages: z.array(z.string()).default([]),
  education_level: z.string().nullable(),
  schools: ScoredTraitSchema,
  hard_things_done: ScoredTraitSchema,
  hackathons: ScoredTraitSchema,
  open_source_contributions: ScoredTraitSchema,
  company_signals: ScoredTraitSchema,
  conclusive_score: z.number().optional().describe("Weighted sum of ratings"),
  human_feedback_score: z.number().nullable().optional(),
  source_completeness: z.object({
    has_resume: z.boolean(),
    has_linkedin: z.boolean(),
  }),
  extracted_at: z.string().datetime(),
}).strict(); // strict() ensures no additional PII properties pass validation

export type TraitSignal = z.infer<typeof TraitSignalSchema>;
