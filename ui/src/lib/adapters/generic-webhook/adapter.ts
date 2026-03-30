import type { ATSAdapter, RawSubject, SubjectMeta } from '../interface';

/**
 * GenericWebhookAdapter — accepts any JSON payload and maps user-specified fields.
 *
 * Field mapping defines how to extract subjectId, name, role, and text from
 * arbitrary webhook payloads. This lets any system plug in without writing
 * a custom adapter.
 */
export interface FieldMapping {
  subjectId: string;     // JSON path to subject ID (e.g., "candidate.id")
  name?: string;         // JSON path to name (e.g., "candidate.name")
  email?: string;        // JSON path to email
  role?: string;         // JSON path to role
  text: string;          // JSON path to the extractable text (resume, doc, etc.)
  source?: string;       // Literal source label or JSON path
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export class GenericWebhookAdapter implements ATSAdapter {
  name: string;
  type = 'generic-webhook';
  private mapping: FieldMapping;

  constructor(name: string, mapping: FieldMapping) {
    this.name = name;
    this.mapping = mapping;
  }

  async pollNewSubjects(): Promise<RawSubject[]> {
    return [];
  }

  normalizeWebhook(body: any): RawSubject {
    const m = this.mapping;
    const subjectId = String(getNestedValue(body, m.subjectId) || `gen-${Date.now()}`);
    return {
      externalId: subjectId,
      name: m.name ? String(getNestedValue(body, m.name) || 'Unknown') : 'Unknown',
      email: m.email ? String(getNestedValue(body, m.email) || '') : undefined,
      role: m.role ? String(getNestedValue(body, m.role) || 'general') : 'general',
      source: m.source || this.name,
      text: String(getNestedValue(body, m.text) || ''),
      metadata: body,
      createdAt: new Date().toISOString(),
    };
  }

  toSubjectMeta(subject: RawSubject): SubjectMeta {
    return {
      subjectId: subject.externalId,
      name: subject.name,
      email: subject.email,
      role: subject.role,
      source: subject.source,
      externalId: subject.externalId,
    };
  }
}
