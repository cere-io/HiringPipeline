import type { JoinApplication } from './agents/types';

const JOIN_API_BASE = 'https://api.join.com/v2';
const MAX_PAGE_SIZE = 50;

export class JoinClient {
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

    /**
     * Fetch ALL applications across all pages.
     * Join API uses pageSize (max 50) + page (1-based) pagination.
     */
    async getAllApplications(): Promise<JoinApplication[]> {
        const all: JoinApplication[] = [];
        let page = 1;

        while (true) {
            const batch = await this.request<JoinApplication[]>('/applications', {
                pageSize: String(MAX_PAGE_SIZE),
                page: String(page),
            });
            if (!Array.isArray(batch) || batch.length === 0) break;
            all.push(...batch);
            if (batch.length < MAX_PAGE_SIZE) break;
            page++;
        }

        return all;
    }

    /**
     * Fetch recent applications (first N pages only, newest first).
     * Use for cron polling — avoids fetching thousands of old applications every tick.
     */
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

    async getApplication(id: number): Promise<JoinApplication> {
        return this.request<JoinApplication>(`/applications/${id}`);
    }

    async getJobs(): Promise<{ id: number; title: string; status: string }[]> {
        return this.request('/jobs');
    }

    /**
     * Download a CV/attachment as a binary buffer.
     * Join attachment URLs are pre-signed — the sig is in the query param,
     * but the Authorization header is still required.
     */
    async downloadAttachment(url: string): Promise<Uint8Array> {
        const res = await fetch(url, {
            headers: { 'Authorization': this.token },
        });
        if (!res.ok) {
            throw new Error(`Join attachment download failed: ${res.status}`);
        }
        const buf = await res.arrayBuffer();
        return new Uint8Array(buf);
    }
}

let _client: JoinClient | null = null;

export function getJoinClient(): JoinClient {
    if (!_client) {
        const token = process.env.JOIN_API_TOKEN;
        if (!token) {
            throw new Error('[JOIN] JOIN_API_TOKEN is not set in environment');
        }
        _client = new JoinClient(token);
    }
    return _client;
}
