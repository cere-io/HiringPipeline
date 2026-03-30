import type { CreateSchemaInput } from '../types';

export const SALES_REP_SCHEMA: CreateSchemaInput = {
  name: 'Sales Representative',
  domain: 'sales',
  fields: [
    { key: 'quota_attainment', label: 'Quota Attainment', type: 'rating', extraction_hint: 'track record of hitting/exceeding sales quotas', default_weight: 0.2 },
    { key: 'deal_size', label: 'Avg Deal Size', type: 'category', extraction_hint: 'typical deal size range', values: ['<10K', '10K-50K', '50K-250K', '250K-1M', '1M+'], default_weight: 0.12 },
    { key: 'sales_cycle', label: 'Sales Cycle Experience', type: 'category', extraction_hint: 'typical sales cycle length', values: ['transactional', 'short', 'mid', 'long', 'enterprise'], default_weight: 0.08 },
    { key: 'industry_verticals', label: 'Industry Verticals', type: 'string[]', extraction_hint: 'industries sold into (SaaS, fintech, healthcare, etc.)', default_weight: 0.1 },
    { key: 'tools_proficiency', label: 'Tools Proficiency', type: 'string[]', extraction_hint: 'CRM and sales tools (Salesforce, HubSpot, Outreach, etc.)', default_weight: 0.05 },
    { key: 'leadership', label: 'Leadership / Mentoring', type: 'rating', extraction_hint: 'team leadership, mentoring junior reps, managing SDRs', default_weight: 0.08 },
    { key: 'years_selling', label: 'Years Selling', type: 'number', extraction_hint: 'integer years in sales roles', default_weight: 0.07 },
    { key: 'company_pedigree', label: 'Company Pedigree', type: 'rating', extraction_hint: 'notable companies worked at and brand strength', default_weight: 0.1 },
    { key: 'hunter_vs_farmer', label: 'Hunter vs Farmer', type: 'category', extraction_hint: 'selling style', values: ['pure_hunter', 'hunter_leaning', 'hybrid', 'farmer_leaning', 'pure_farmer'], default_weight: 0.08 },
    { key: 'proof_of_results', label: 'Proof of Results', type: 'rating', extraction_hint: 'specific revenue numbers, awards (Presidents Club, etc.)', default_weight: 0.12 },
  ],
  profile_axes: [
    { key: 'revenue_performance', label: 'Revenue Performance', derivation_hint: 'Quota attainment and proof of results' },
    { key: 'deal_complexity', label: 'Deal Complexity', derivation_hint: 'Deal size and sales cycle sophistication' },
    { key: 'domain_expertise', label: 'Domain Expertise', derivation_hint: 'Industry vertical depth and specialization' },
    { key: 'relationship_building', label: 'Relationship Building', derivation_hint: 'Farming ability, account growth, retention' },
    { key: 'leadership_potential', label: 'Leadership Potential', derivation_hint: 'Team leadership and mentoring track record' },
    { key: 'institutional_signal', label: 'Institutional Signal', derivation_hint: 'Company pedigree and brand association' },
  ],
  created_by: 'system',
};
