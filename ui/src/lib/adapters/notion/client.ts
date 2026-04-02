const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export interface NotionPage {
  id: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, any>;
}

export interface NotionBlock {
  id: string;
  type: string;
  [key: string]: any;
}

export interface NotionComment {
  id: string;
  author: string;
  text: string;
  createdTime: string;
}

export class NotionClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };
  }

  async queryDatabase(dbId: string, filter?: any, startCursor?: string): Promise<{ results: NotionPage[]; next_cursor: string | null }> {
    const body: any = {
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    };
    if (filter) body.filter = filter;
    if (startCursor) body.start_cursor = startCursor;

    const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Notion API ${res.status}: ${err}`);
    }

    return res.json();
  }

  async getAllPages(dbId: string, filter?: any): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.queryDatabase(dbId, filter, cursor);
      pages.push(...result.results);
      cursor = result.next_cursor || undefined;
    } while (cursor);

    return pages;
  }

  async getPageBlocks(pageId: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;

    do {
      const url = new URL(`${NOTION_API}/blocks/${pageId}/children`);
      if (cursor) url.searchParams.set('start_cursor', cursor);

      const res = await fetch(url.toString(), { headers: this.headers() });
      if (!res.ok) break;

      const data = await res.json();
      blocks.push(...data.results);
      cursor = data.next_cursor || undefined;
    } while (cursor);

    return blocks;
  }

  async getPageComments(pageId: string): Promise<NotionComment[]> {
    const comments: NotionComment[] = [];
    let cursor: string | undefined;

    do {
      const url = new URL(`${NOTION_API}/comments`);
      url.searchParams.set('block_id', pageId);
      if (cursor) url.searchParams.set('start_cursor', cursor);

      const res = await fetch(url.toString(), { headers: this.headers() });
      if (!res.ok) break;

      const data = await res.json();
      for (const c of data.results || []) {
        const text = (c.rich_text || []).map((t: any) => t.plain_text || '').join('');
        if (!text.trim()) continue;
        comments.push({
          id: c.id,
          author: c.created_by?.name || c.created_by?.person?.email || 'Unknown',
          text,
          createdTime: c.created_time,
        });
      }
      cursor = data.next_cursor || undefined;
    } while (cursor);

    return comments;
  }

  async updatePageProperty(pageId: string, properties: Record<string, any>): Promise<void> {
    const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Notion update failed ${res.status}: ${err}`);
    }
  }
}

// --- Property value extractors ---

export function extractTitle(prop: any): string {
  if (!prop || prop.type !== 'title') return '';
  return (prop.title || []).map((t: any) => t.plain_text).join('');
}

export function extractRichText(prop: any): string {
  if (!prop) return '';
  if (prop.type === 'rich_text') {
    return (prop.rich_text || []).map((t: any) => t.plain_text).join('');
  }
  if (prop.type === 'title') return extractTitle(prop);
  return '';
}

export function extractSelect(prop: any): string {
  if (!prop || prop.type !== 'select' || !prop.select) return '';
  return prop.select.name || '';
}

export function extractNumber(prop: any): number | null {
  if (!prop || prop.type !== 'number') return null;
  return prop.number;
}

export function extractEmail(prop: any): string {
  if (!prop || prop.type !== 'email') return '';
  return prop.email || '';
}

export function extractUrl(prop: any): string {
  if (!prop || prop.type !== 'url') return '';
  return prop.url || '';
}

export function extractMultiSelect(prop: any): string[] {
  if (!prop || prop.type !== 'multi_select') return [];
  return (prop.multi_select || []).map((s: any) => s.name);
}

export function blocksToText(blocks: NotionBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    const richTexts =
      block[block.type]?.rich_text ||
      block[block.type]?.text ||
      [];
    const text = richTexts.map((t: any) => t.plain_text || '').join('');
    if (text) lines.push(text);
  }
  return lines.join('\n');
}
