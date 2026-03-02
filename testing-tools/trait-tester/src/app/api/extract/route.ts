import { z } from 'zod';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import pdfParseImport from 'pdf-parse/lib/pdf-parse.js';

const pdfParse = typeof pdfParseImport === 'function' ? pdfParseImport : (pdfParseImport as any).default || pdfParseImport;

const ScoredTraitSchema = z.object({
  items: z.array(z.string()).default([]),
  rating: z.number().min(0).max(10).describe("Rate the extracted items from 0-10 based on how impressive they are. 0 if empty/none. 10 if world-class (e.g. reverse engineered a database, early engineer at Stripe, MIT/Stanford, won global hackathon)."),
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
  human_feedback_score: z.number().nullable().optional(),
  source_completeness: z.object({
    has_resume: z.boolean(),
    has_linkedin: z.boolean(),
  }),
  extracted_at: z.string().datetime(),
});

// Trait weights for calculating the conclusive score (Out of 100 max)
const WEIGHTS = {
  hard_things_done: 3.5,
  company_signals: 2.5,
  open_source_contributions: 2.0,
  hackathons: 1.0,
  schools: 1.0,
};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const source = formData.get('source') as string || 'unknown';
    let text = formData.get('text') as string;
    
    const file = formData.get('file') as File;
    if (file) {
      if (file.type === 'application/pdf') {
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
      } else {
        text = await file.text();
      }
    }

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Text or file is required' }), { status: 400 });
    }

    const { object } = await generateObject({
      model: google('gemini-2.5-pro'),
      schema: TraitSignalSchema,
      prompt: `Extract candidate traits from the following text (which may be a resume or LinkedIn profile). 
      
      For each of these nuanced signals, extract the items AND provide a rating from 0-10 based on how impressive they are:
      - hard_things_done: Specific accomplishments or difficult engineering tasks (e.g., "reversed engineered SQLite database").
      - hackathons: List of hackathons attended or won.
      - open_source_contributions: Notable open source projects pioneered or prototyped.
      - schools: Specific universities attended (e.g., "University of Waterloo", "MIT", "Johns Hopkins").
      - company_signals: Specific company profile signals (e.g., "joined Series A Silicon Valley-backed venture companies early").
      
      Text:
      ${text}
      
      Source type: ${source}
      `,
    });

    // Calculate the conclusive weighted score (Max: 10 * 10 = 100)
    const conclusive_score = 
      (object.hard_things_done.rating * WEIGHTS.hard_things_done) +
      (object.company_signals.rating * WEIGHTS.company_signals) +
      (object.open_source_contributions.rating * WEIGHTS.open_source_contributions) +
      (object.hackathons.rating * WEIGHTS.hackathons) +
      (object.schools.rating * WEIGHTS.schools);

    return new Response(JSON.stringify({ 
      ...object, 
      conclusive_score: parseFloat(conclusive_score.toFixed(1)),
      _weights: WEIGHTS,
      _originalText: text 
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}