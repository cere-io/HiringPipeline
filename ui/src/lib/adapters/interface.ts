/**
 * ATSAdapter — abstract interface for plugging any ATS into the Compound Intelligence SDK.
 *
 * Implementations translate ATS-specific data structures into the generic
 * subject format that Component 1 understands.
 */
export interface RawSubject {
  externalId: string;
  name: string;
  email?: string;
  role: string;
  source: string;
  text: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface SubjectMeta {
  subjectId: string;
  name: string;
  email?: string;
  role: string;
  source: string;
  externalId: string;
  linkedinUrl?: string;
  metadata?: Record<string, any>;
}

export interface ATSAdapter {
  name: string;
  type: string;

  /** Pull new subjects from the ATS since the last poll. */
  pollNewSubjects(since?: string): Promise<RawSubject[]>;

  /** Convert an ATS-specific payload (webhook body) to a RawSubject. */
  normalizeWebhook(body: any): RawSubject;

  /** Build metadata for the subject. */
  toSubjectMeta(subject: RawSubject): SubjectMeta;

  /** (Optional) Push AI scores back to the ATS. */
  pushScore?(externalId: string, score: number, reasoning: string): Promise<void>;
}

export interface AdapterConfig {
  type: string;
  schemaId: string;
  credentials: Record<string, string>;
  options?: Record<string, any>;
}
