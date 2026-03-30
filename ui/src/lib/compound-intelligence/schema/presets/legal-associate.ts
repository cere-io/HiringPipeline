import type { CreateSchemaInput } from '../types';

export const LEGAL_ASSOCIATE_SCHEMA: CreateSchemaInput = {
  name: 'Legal Associate',
  domain: 'legal',
  fields: [
    { key: 'bar_admissions', label: 'Bar Admissions', type: 'string[]', extraction_hint: 'US state bar admissions', default_weight: 0.12 },
    { key: 'practice_areas', label: 'Practice Areas', type: 'string[]', extraction_hint: 'litigation, corporate, IP, tax, real estate, etc.', default_weight: 0.1 },
    { key: 'law_school', label: 'Law School', type: 'rating', extraction_hint: 'law school name and T14/T50 ranking', default_weight: 0.15 },
    { key: 'clerkship', label: 'Clerkship', type: 'rating', extraction_hint: 'judicial clerkships, court level (SCOTUS, Circuit, District)', default_weight: 0.12 },
    { key: 'law_review', label: 'Law Review / Journal', type: 'boolean', extraction_hint: 'law review or journal membership', default_weight: 0.06 },
    { key: 'moot_court', label: 'Moot Court', type: 'boolean', extraction_hint: 'moot court or trial advocacy participation', default_weight: 0.04 },
    { key: 'years_practice', label: 'Years of Practice', type: 'number', extraction_hint: 'integer years of legal practice', default_weight: 0.08 },
    { key: 'notable_cases', label: 'Notable Cases / Deals', type: 'rating', extraction_hint: 'significant cases, transactions, or regulatory matters', default_weight: 0.15 },
    { key: 'firm_pedigree', label: 'Firm Pedigree', type: 'rating', extraction_hint: 'AmLaw 100, BigLaw, V10, boutique, government', default_weight: 0.1 },
    { key: 'publications', label: 'Publications', type: 'rating', extraction_hint: 'law review articles, treatises, notable briefs', default_weight: 0.08 },
  ],
  profile_axes: [
    { key: 'academic_excellence', label: 'Academic Excellence', derivation_hint: 'Law school prestige, law review, grades' },
    { key: 'practical_depth', label: 'Practical Depth', derivation_hint: 'Years of practice and complexity of matters' },
    { key: 'institutional_pedigree', label: 'Institutional Pedigree', derivation_hint: 'Firm prestige and clerkship caliber' },
    { key: 'subject_matter_expertise', label: 'Subject Matter Expertise', derivation_hint: 'Specialization depth in practice areas' },
    { key: 'thought_leadership', label: 'Thought Leadership', derivation_hint: 'Publications, speaking, industry recognition' },
    { key: 'client_impact', label: 'Client Impact', derivation_hint: 'Notable cases won and deal value' },
  ],
  created_by: 'system',
};
