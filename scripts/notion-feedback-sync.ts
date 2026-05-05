/**
 * Notion scorecard -> replay.feedback polling sync.
 *
 * Polls the Notion Job Roles DB (24cd800083d6804daaf7f5b100d71ea9) plus the candidate pages
 * under it, diffs against a local state file to detect NEW or UPDATED human scorecards, and
 * emits `replay.feedback` events to the Replay Harness replay stream so distillation re-runs
 * whenever an interviewer files a score.
 *
 * Addresses Fred's 2026-04-17 follow-up: "wire the interviewer scorecard back into the
 * pipeline so it auto-loops." Webhooks aren't configured yet; polling is the zero-dep
 * stand-in. Cron cadence: every 10 min (matches the PIA connector pattern).
 *
 * Env required:
 *   NOTION_API_KEY        - Notion integration token with read access to Job Roles DB + candidate pages
 *   CEF_ORCHESTRATOR_URL  - orchestrator base URL
 *   CEF_AUTH_TOKEN        - ROB/orchestrator bearer token
 *
 * Defaults (override via env):
 *   HIRING_SERVICE_PUBKEY - 0x377f...4a6c (Hiring Agent svc 2666)
 *   REPLAY_STREAM_ID      - stream-2fcefa72 (candidates-replay)
 *   CANDIDATES_DB_ID      - bc66a818-be72-4ce3-b205-01f35df214c8 (Candidate Board - Full Pipeline)
 *   STATE_FILE            - drafts/notion-feedback-state.json
 */

import * as fs from 'fs';
import * as path from 'path';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const CANDIDATES_DB_ID = process.env.CANDIDATES_DB_ID || 'bc66a818-be72-4ce3-b205-01f35df214c8';
const HIRING_SERVICE_PUBKEY = process.env.HIRING_SERVICE_PUBKEY || '0x377faeeeb34ddb18a86211efeb9364bc9bf93849a6bb20c969b8953976964a6c';
const REPLAY_STREAM_ID = process.env.REPLAY_STREAM_ID || 'stream-2fcefa72';
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, '..', 'drafts', 'notion-feedback-state.json');
const ORCH_URL = process.env.CEF_ORCHESTRATOR_URL || 'https://orchestrator.compute.test.ddcdragon.com';

type StateShape = { lastScores: Record<string, { human_score: number; updated_at: string }> };

function loadState(): StateShape {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { lastScores: {} }; }
}
function saveState(s: StateShape) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

async function notionFetch(url: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(url, {
    ...init,
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Notion ${r.status}: ${await r.text()}`);
  return r.json();
}

async function listCandidatePages(): Promise<Array<{ id: string; name: string; humanScore: number | null; updatedAt: string }>> {
  const out: Array<{ id: string; name: string; humanScore: number | null; updatedAt: string }> = [];
  let cursor: string | undefined;
  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const r = await notionFetch(`${NOTION_API}/databases/${CANDIDATES_DB_ID}/query`, { method: 'POST', body: JSON.stringify(body) });
    for (const p of r.results || []) {
      const props = p.properties || {};
      const nameProp = props['Role Name'] || props['Name'] || props['Candidate'];
      const scoreProp = props['Human Score'] || props['Interviewer Score'] || props['human_score'];
      const name = nameProp?.title?.map((t: any) => t.plain_text).join('') || p.id;
      const humanScore = typeof scoreProp?.number === 'number' ? scoreProp.number : null;
      out.push({ id: p.id, name, humanScore, updatedAt: p.last_edited_time });
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function emitReplayFeedback(candidateId: string, humanScore: number, name: string): Promise<void> {
  const token = process.env.CEF_AUTH_TOKEN;
  if (!token) throw new Error('CEF_AUTH_TOKEN required');
  const body = {
    event_type: 'replay.feedback',
    payload: {
      candidateId,
      role: 'recruiting-replay',
      outcome: humanScore,
      source: 'notion-scorecard',
      mode: 'recruiting',
      subject_name: name,
      emitted_at: new Date().toISOString(),
    },
  };
  const url = `${ORCH_URL}/api/v1/agent-services/${HIRING_SERVICE_PUBKEY}/streams/${REPLAY_STREAM_ID}/events`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`CEF emit ${r.status}: ${await r.text()}`);
}

async function main() {
  if (!process.env.NOTION_API_KEY) { console.error('NOTION_API_KEY required'); process.exit(2); }

  const state = loadState();
  const pages = await listCandidatePages();
  console.log(`Polled ${pages.length} candidate pages.`);

  let emitted = 0; let skipped = 0;
  for (const p of pages) {
    if (p.humanScore === null || p.humanScore === undefined) continue;
    const prior = state.lastScores[p.id];
    const changed = !prior || prior.human_score !== p.humanScore || prior.updated_at !== p.updatedAt;
    if (!changed) { skipped += 1; continue; }
    try {
      await emitReplayFeedback(p.id, p.humanScore, p.name);
      state.lastScores[p.id] = { human_score: p.humanScore, updated_at: p.updatedAt };
      emitted += 1;
      console.log(`  emit replay.feedback: ${p.name} (${p.id.slice(0, 8)}) human=${p.humanScore}`);
    } catch (e: any) {
      console.error(`  FAILED: ${p.name}: ${e.message}`);
    }
  }
  saveState(state);
  console.log(`Done. Emitted ${emitted}, skipped ${skipped}, total ${pages.length}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
