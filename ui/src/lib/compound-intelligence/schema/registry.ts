import type { TraitSchema, DynamicWeights } from '../types';
import type { CreateSchemaInput, UpdateSchemaInput } from './types';
import type { CIStorage } from '../storage/interface';

import { SOFTWARE_ENGINEER_SCHEMA } from './presets/software-engineer';
import { LEGAL_ASSOCIATE_SCHEMA } from './presets/legal-associate';
import { SALES_REP_SCHEMA } from './presets/sales-rep';

export const PRESET_SCHEMAS: Record<string, CreateSchemaInput> = {
  'hiring': SOFTWARE_ENGINEER_SCHEMA,
  'legal-associate': LEGAL_ASSOCIATE_SCHEMA,
  'sales-rep': SALES_REP_SCHEMA,
};

export class SchemaRegistry {
  constructor(private storage: CIStorage) {}

  async create(input: CreateSchemaInput): Promise<TraitSchema> {
    const schema = await this.storage.createSchema(input);
    const defaults = this.buildDefaultWeights(schema);
    await this.storage.setWeights(schema.id, '__default__', defaults);
    return schema;
  }

  async get(id: string): Promise<TraitSchema | null> {
    return this.storage.getSchema(id);
  }

  async list(domain?: string): Promise<TraitSchema[]> {
    return this.storage.listSchemas(domain);
  }

  async update(id: string, input: UpdateSchemaInput): Promise<TraitSchema> {
    return this.storage.updateSchema(id, input);
  }

  async delete(id: string): Promise<void> {
    return this.storage.deleteSchema(id);
  }

  async createFromPreset(presetKey: string): Promise<TraitSchema> {
    const preset = PRESET_SCHEMAS[presetKey];
    if (!preset) throw new Error(`Unknown preset: ${presetKey}. Available: ${Object.keys(PRESET_SCHEMAS).join(', ')}`);
    return this.create(preset);
  }

  async seedAllPresets(): Promise<TraitSchema[]> {
    const results: TraitSchema[] = [];
    for (const [key, preset] of Object.entries(PRESET_SCHEMAS)) {
      const existing = await this.storage.listSchemas();
      const alreadyExists = existing.some(s => s.name === preset.name && s.domain === preset.domain);
      if (!alreadyExists) {
        results.push(await this.create(preset));
      }
    }
    return results;
  }

  async getWeightsForRole(schemaId: string, role: string): Promise<DynamicWeights> {
    const weights = await this.storage.getWeights(schemaId, role);
    if (weights) return weights;

    const defaults = await this.storage.getWeights(schemaId, '__default__');
    if (defaults) return defaults;

    const schema = await this.storage.getSchema(schemaId);
    if (!schema) throw new Error(`Schema ${schemaId} not found`);
    return this.buildDefaultWeights(schema);
  }

  buildDefaultWeights(schema: TraitSchema): DynamicWeights {
    const weights: DynamicWeights = {};
    let total = 0;
    for (const f of schema.fields) {
      weights[f.key] = f.default_weight;
      total += f.default_weight;
    }
    if (total > 0) {
      for (const k of Object.keys(weights)) {
        weights[k] = parseFloat((weights[k] / total).toFixed(6));
      }
    }
    return weights;
  }
}
