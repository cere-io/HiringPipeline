import type { CreateSchemaInput } from '../types';

export const SOFTWARE_ENGINEER_SCHEMA: CreateSchemaInput = {
  name: 'Hiring',
  domain: 'hiring',
  fields: [
    { key: 'skills', label: 'Technical Skills', type: 'string[]', extraction_hint: 'technical and soft skills', default_weight: 0.1 },
    { key: 'years_of_experience', label: 'Years of Experience', type: 'number', extraction_hint: 'integer years of professional experience', default_weight: 0.1 },
    { key: 'company_stages', label: 'Company Stages', type: 'string[]', extraction_hint: 'startup, series_a, series_b, growth, public, enterprise', default_weight: 0.08 },
    { key: 'education_level', label: 'Education Level', type: 'category', extraction_hint: 'highest degree', values: ['PhD', 'Masters', 'Bachelors', 'None'], default_weight: 0.07 },
    { key: 'schools', label: 'Schools', type: 'rating', extraction_hint: 'school names and prestige rating', default_weight: 0.08 },
    { key: 'hard_things_done', label: 'Hard Things Built', type: 'rating', extraction_hint: 'impressive technical achievements that required real effort', default_weight: 0.215 },
    { key: 'hackathons', label: 'Hackathons', type: 'rating', extraction_hint: 'hackathon participation and awards', default_weight: 0.075 },
    { key: 'open_source_contributions', label: 'Open Source', type: 'rating', extraction_hint: 'open source contributions and projects', default_weight: 0.1 },
    { key: 'company_signals', label: 'Company Signals', type: 'rating', extraction_hint: 'notable employers and brand strength', default_weight: 0.14 },
  ],
  profile_axes: [
    { key: 'education', label: 'Education', derivation_hint: 'School prestige and degree level' },
    { key: 'company_caliber', label: 'Company Caliber', derivation_hint: 'Quality and prestige of employers' },
    { key: 'career_arc', label: 'Career Arc', derivation_hint: 'Progression trajectory and seniority growth' },
    { key: 'technical_depth', label: 'Technical Depth', derivation_hint: 'Breadth and depth of technical skills' },
    { key: 'proof_of_work', label: 'Proof of Work', derivation_hint: 'Tangible hard things built and shipped' },
    { key: 'public_signal', label: 'Public Signal', derivation_hint: 'Open source, talks, writing, community presence' },
  ],
  created_by: 'system',
};
