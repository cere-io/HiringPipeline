import type { ATSAdapter, RawSubject, SubjectMeta } from '../interface';
import {
  NotionClient,
  extractTitle,
  extractRichText,
  extractSelect,
  extractEmail,
  extractUrl,
  extractNumber,
  blocksToText,
} from './client';
import type { NotionPage } from './client';

/**
 * Column mapping — maps your Notion database property names to the adapter's fields.
 * Uses case-insensitive matching, so "Name", "name", and "NAME" all work.
 */
export interface NotionColumnMapping {
  name?: string;        // default: auto-detects the title column
  role?: string;        // default: "Role"
  email?: string;       // default: "Email"
  status?: string;      // default: "Status"
  score?: string;       // default: "Score" — where AI score gets written back
  resume?: string;      // default: "Resume" or "Notes"
  source?: string;      // default: "Source"
  linkedin?: string;    // default: "LinkedIn"
}

const DEFAULT_MAPPING: Required<NotionColumnMapping> = {
  name: '',
  role: 'Role',
  email: 'Email',
  status: 'Status',
  score: 'Score',
  resume: 'Resume',
  source: 'Source',
  linkedin: 'LinkedIn',
};

function findProp(properties: Record<string, any>, target: string): any {
  if (!target) return undefined;
  const lower = target.toLowerCase();
  for (const [key, val] of Object.entries(properties)) {
    if (key.toLowerCase() === lower) return val;
  }
  return undefined;
}

function findTitleProp(properties: Record<string, any>): { key: string; val: any } | null {
  for (const [key, val] of Object.entries(properties)) {
    if (val?.type === 'title') return { key, val };
  }
  return null;
}

export class NotionAdapter implements ATSAdapter {
  name = 'Notion';
  type = 'notion';
  private client: NotionClient;
  private databaseId: string;
  private mapping: Required<NotionColumnMapping>;
  private includePageBody: boolean;
  private statusFilter?: string;

  constructor(opts: {
    token: string;
    databaseId: string;
    columnMapping?: NotionColumnMapping;
    includePageBody?: boolean;
    statusFilter?: string;
  }) {
    this.client = new NotionClient(opts.token);
    this.databaseId = opts.databaseId;
    this.mapping = { ...DEFAULT_MAPPING, ...opts.columnMapping };
    this.includePageBody = opts.includePageBody ?? true;
    this.statusFilter = opts.statusFilter;
  }

  async pollNewSubjects(since?: string): Promise<RawSubject[]> {
    let filter: any = undefined;

    const conditions: any[] = [];

    if (this.statusFilter) {
      conditions.push({
        property: this.mapping.status,
        select: { equals: this.statusFilter },
      });
    }

    if (since) {
      conditions.push({
        timestamp: 'created_time',
        created_time: { after: since },
      });
    }

    if (conditions.length === 1) {
      filter = conditions[0];
    } else if (conditions.length > 1) {
      filter = { and: conditions };
    }

    const result = await this.client.queryDatabase(this.databaseId, filter);
    const pages = result.results || [];

    const subjects: RawSubject[] = [];
    for (const page of pages) {
      subjects.push(await this.pageToRawSubject(page));
    }
    return subjects;
  }

  normalizeWebhook(body: any): RawSubject {
    if (body.properties && body.id) {
      return this.pageToRawSubjectSync(body as NotionPage);
    }

    return {
      externalId: body.candidateId || body.id || `notion-${Date.now()}`,
      name: body.name || body.candidateName || 'Unknown',
      email: body.email,
      role: body.role || 'general',
      source: 'notion',
      text: body.resumeText || body.notes || body.text || '',
      metadata: body,
      createdAt: new Date().toISOString(),
    };
  }

  toSubjectMeta(subject: RawSubject): SubjectMeta {
    return {
      subjectId: subject.externalId.startsWith('notion-') ? subject.externalId : `notion-${subject.externalId}`,
      name: subject.name,
      email: subject.email,
      role: subject.role,
      source: 'notion',
      externalId: subject.externalId,
      linkedinUrl: subject.metadata?.linkedin,
      metadata: subject.metadata,
    };
  }

  async pushScore(externalId: string, score: number, reasoning: string): Promise<void> {
    const pageId = externalId.replace(/^notion-/, '');
    const properties: Record<string, any> = {};

    properties[this.mapping.score] = { number: score };

    await this.client.updatePageProperty(pageId, properties);
  }

  // --- Internal helpers ---

  private async pageToRawSubject(page: NotionPage): Promise<RawSubject> {
    const subject = this.pageToRawSubjectSync(page);

    if (this.includePageBody) {
      try {
        const blocks = await this.client.getPageBlocks(page.id);
        const bodyText = blocksToText(blocks);
        if (bodyText.trim()) {
          subject.text = subject.text
            ? `${subject.text}\n\n--- Page Content ---\n${bodyText}`
            : bodyText;
        }
      } catch {
        // page body fetch failed — property text is still available
      }
    }

    return subject;
  }

  private pageToRawSubjectSync(page: NotionPage): RawSubject {
    const props = page.properties;

    const titleResult = this.mapping.name
      ? findProp(props, this.mapping.name)
      : findTitleProp(props)?.val;

    const name = titleResult ? (extractTitle(titleResult) || extractRichText(titleResult)) : 'Unknown';
    const role = extractSelect(findProp(props, this.mapping.role))
              || extractRichText(findProp(props, this.mapping.role))
              || 'general';
    const email = extractEmail(findProp(props, this.mapping.email))
               || extractRichText(findProp(props, this.mapping.email))
               || '';
    const source = extractSelect(findProp(props, this.mapping.source))
                || extractRichText(findProp(props, this.mapping.source))
                || 'notion';
    const linkedin = extractUrl(findProp(props, this.mapping.linkedin))
                  || extractRichText(findProp(props, this.mapping.linkedin))
                  || '';
    const status = extractSelect(findProp(props, this.mapping.status)) || '';

    // Build text from ALL available rich_text and title properties
    const textParts: string[] = [];
    textParts.push(`Candidate: ${name}`);
    if (role && role !== 'general') textParts.push(`Role: ${role}`);

    for (const [key, val] of Object.entries(props) as [string, any][]) {
      if (val.type === 'rich_text') {
        const txt = extractRichText(val);
        if (txt && txt.trim().length > 0) textParts.push(`${key}: ${txt}`);
      }
      if (val.type === 'select' && val.select?.name) {
        textParts.push(`${key}: ${val.select.name}`);
      }
      if (val.type === 'multi_select' && val.multi_select?.length > 0) {
        textParts.push(`${key}: ${val.multi_select.map((s: any) => s.name).join(', ')}`);
      }
      if (val.type === 'status' && val.status?.name) {
        textParts.push(`${key}: ${val.status.name}`);
      }
    }

    if (linkedin) textParts.push(`LinkedIn: ${linkedin}`);

    return {
      externalId: `notion-${page.id.replace(/-/g, '')}`,
      name,
      email: email || undefined,
      role,
      source,
      text: textParts.join('\n'),
      metadata: {
        notionPageId: page.id,
        status,
        linkedin,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
      },
      createdAt: page.created_time,
    };
  }
}
