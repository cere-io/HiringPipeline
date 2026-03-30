import type { JoinApplication } from '../../agents/types';

const JOIN_API_BASE = 'https://api.join.com/v2';
const MAX_PAGE_SIZE = 50;

export class JoinAPIClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${JOIN_API_BASE}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': this.token },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Join API ${res.status} on ${path}: ${text}`);
    }
    return res.json();
  }

  async getRecentApplications(maxPages = 3): Promise<JoinApplication[]> {
    const all: JoinApplication[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const batch = await this.request<JoinApplication[]>('/applications', {
        pageSize: String(MAX_PAGE_SIZE),
        page: String(page),
      });
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < MAX_PAGE_SIZE) break;
    }
    return all;
  }

  async downloadAttachment(url: string): Promise<Uint8Array> {
    const res = await fetch(url, {
      headers: { 'Authorization': this.token },
    });
    if (!res.ok) throw new Error(`Join attachment download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
