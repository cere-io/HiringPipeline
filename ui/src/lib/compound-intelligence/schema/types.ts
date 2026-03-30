export type { TraitSchema, TraitField, ProfileAxis } from '../types';

export interface CreateSchemaInput {
  name: string;
  domain: string;
  fields: Array<{
    key: string;
    label: string;
    type: 'string[]' | 'number' | 'rating' | 'category' | 'boolean';
    extraction_hint: string;
    values?: string[];
    default_weight: number;
  }>;
  profile_axes?: Array<{
    key: string;
    label: string;
    derivation_hint: string;
  }>;
  created_by?: string;
}

export interface UpdateSchemaInput {
  name?: string;
  domain?: string;
  fields?: CreateSchemaInput['fields'];
  profile_axes?: CreateSchemaInput['profile_axes'];
  is_active?: boolean;
}
