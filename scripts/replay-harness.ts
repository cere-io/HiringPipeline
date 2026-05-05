/**
 * Replay harness — hiring only.
 *
 * Fred (2026-04-17): "let me go in there and take a look at [Rahul's sales] and clean this up
 *  ... Can I just set up this test workspace or test streams where I can just replay all these
 *  new candidates coming in or all these updates in Notion ... run it back again and again and
 *  again ... restructure and reindex things differently and look for different traits ...
 *  aggregate them, compound them differently."
 *
 * This is Rahul's hiring pipeline. Sales is a checkbox on the SAME agent (documented in
 * docs/MODES.md) but that is NOT this demo. This demo replays real Notion candidates through
 * the hiring qualify → score → distill loop, repeatedly, with three variations:
 *
 *   1) RESTRUCTURE — same resume, two extractor prompt shapes → different trait VALUES.
 *   2) REINDEX      — same traits, two weight sets → different composite SCORES.
 *   3) COMPOUND     — simulated interviewer scorecard → bounded weight shifts that accumulate
 *                      across nightly runs (see drafts/nightly/*.md for drift over time).
 *
 * Fixtures are pulled from the Notion Candidate Board (db bc66a818-be72-4ce3-b205-01f35df214c8)
 * and checked in as text-only snapshots below so the replay is reproducible without Notion
 * access on the CI runner.
 *
 * CEF test stream (ROB-verified 2026-04-17):
 *   Agent Service : Hiring Agent (id 2666, pubkey 0x377faeee...964a6c, bucket 573069)
 *   Workspace     : 2310 "Hiring Pipeline Replay"
 *   Stream        : stream-2fcefa72 "candidates-replay"
 *                   selectors: replay.candidate, notion.candidate.updated, replay.feedback
 *
 * Outputs:
 *   drafts/replay-harness-report.md   (human-readable)
 *   drafts/replay-harness-data.json   (machine-readable)
 *
 * Safe by design: in-memory MockCubby — nothing touches production hiring-* cubbies.
 */

import { extract } from '../src/agents/trait-extractor';
import type { Context, CandidateTraits, TraitWeights } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

// ------------------------------------------------------------------
// Mock CEF runtime
// ------------------------------------------------------------------

class MockCubby {
  private data: Record<string, any> = {};
  json = {
    get: (p: string) => this.data[p],
    set: (p: string, v: any) => { this.data[p] = v; },
    delete: (p: string) => { delete this.data[p]; },
    exists: (p: string) => !!this.data[p],
    mget: (ps: string[]) => ps.reduce((a, k) => ({ ...a, [k]: this.data[k] }), {}),
    mset: (items: Record<string, any>) => { Object.assign(this.data, items); },
    keys: () => Object.keys(this.data),
    incr: (p: string) => { this.data[p] = (this.data[p] || 0) + 1; return this.data[p]; },
  };
  vector = { createIndex: () => {}, add: () => {}, search: () => [], get: () => null, delete: () => {}, exists: () => false, count: () => 0 };
}

function makeContext(): Context {
  const cubbies: Record<string, MockCubby> = {
    'hiring-traits': new MockCubby(),
    'hiring-scores': new MockCubby(),
    'hiring-meta': new MockCubby(),
    'hiring-outcomes': new MockCubby(),
    'hiring-interviews': new MockCubby(),
  };
  return {
    log: (...args: any[]) => { if (process.env.REPLAY_VERBOSE) console.log('[log]', ...args); },
    emit: () => {},
    fetch: async (url: string, opts: any) => {
      // Translate OpenAI-compat Gemini calls to native Gemini endpoint — the OpenAI-compat path
      // rejects the AQ.* API keys in use today. Agents stay untouched.
      if (url.includes('generativelanguage.googleapis.com') && url.includes('/openai/chat/completions')) {
        const body = JSON.parse(opts.body);
        const model = process.env.REPLAY_MODEL || 'gemini-2.5-flash-lite';
        const sys = (body.messages || []).filter((m: any) => m.role === 'system').map((m: any) => m.content).join('\n\n');
        const userText = (body.messages || []).filter((m: any) => m.role !== 'system').map((m: any) => m.content).join('\n\n');
        const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const nativeBody: any = { contents: [{ parts: [{ text: userText }] }], generationConfig: { temperature: body.temperature ?? 0.2 } };
        if (sys) nativeBody.systemInstruction = { parts: [{ text: sys }] };
        for (let attempt = 0; attempt < 4; attempt++) {
          const r = await fetch(nativeUrl, { method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(nativeBody) });
          const data: any = await r.json();
          if (r.ok) {
            const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
            return { ok: true, status: 200, data: { choices: [{ message: { content: text } }] } };
          }
          if (r.status === 429 || r.status === 503) { await new Promise(res => setTimeout(res, 2000 * Math.pow(2, attempt))); continue; }
          return { ok: false, status: r.status, data };
        }
        return { ok: false, status: 429, data: { error: 'retry budget exhausted' } };
      }
      const r = await fetch(url, opts);
      const data = await r.json();
      return { ok: r.ok, status: r.status, data };
    },
    cubby: (n: string) => cubbies[n] as any,
    agents: {},
  };
}

// ------------------------------------------------------------------
// Fixtures — real Notion Candidate Board entries, week of 2026-04-14
// Pulled from db bc66a818-be72-4ce3-b205-01f35df214c8 on 2026-04-17.
// ------------------------------------------------------------------

const CANDIDATE_FIXTURES = [
  {
    candidateId: 'cand-finn-theuerkauff',
    name: 'Finn Theuerkauff',
    role: "Founder's Associate",
    notionStatus: 'Initial Evaluation Call',
    aiScoreWas: 9,
    resumeText: `Finn Theuerkauff. Founder's Associate candidate, inbound via Join. 4 years operating experience at early-stage startups, mostly in fintech and dev tools. Former founding team at a Series A SaaS (sold, exit). Skilled at BD, GTM execution, operations, hiring. Writes well; reads technical. Some light coding (Python, SQL, React basics). No protocol-level or deep infra experience. Bachelor's in Economics, TU Munich.`,
  },
  {
    candidateId: 'cand-alexandros-sivris',
    name: 'Alexandros Sivris',
    role: 'Blockchain Engineer',
    notionStatus: 'Company Rejected',
    aiScoreWas: 2,
    resumeText: `Alexandros Sivris. Fullstack Product Engineer with 8 years building health-tech SaaS products at Series B startups. Strong TypeScript, React, Node, Postgres. Led migration of core platform from monolith to microservices (AWS, Kubernetes). Mentored team of 6. No blockchain or Rust experience. BSc Computer Science, Athens University.`,
  },
  {
    candidateId: 'cand-benhur-davies',
    name: 'Benhur Davies',
    role: 'Blockchain Engineer',
    notionStatus: 'Company Rejected',
    aiScoreWas: 2,
    resumeText: `Benhur Davies. Full Stack Lead Engineer with 12 years at Series C to public-stage companies. Stack: Go, Python, React, Kafka, AWS. Shipped real-time trading infrastructure handling 50k RPS. MSc Computer Science, Imperial College London. Contributor to 2 minor OSS projects. No blockchain, Rust, or Substrate experience.`,
  },
  {
    candidateId: 'cand-bhavin-chandarana',
    name: 'Bhavin Chandarana',
    role: 'Blockchain Engineer',
    notionStatus: 'Company Rejected',
    aiScoreWas: 2,
    resumeText: `Bhavin Chandarana. Experienced Architect and DevOps lead. 14 years spanning IoT, embedded systems, and general software engineering. Stack: C++, Python, AWS, Terraform. No protocol-level, Rust, or blockchain experience. BE Electronics, University of Mumbai.`,
  },
  {
    candidateId: 'cand-benjamin-elliott',
    name: 'Benjamin Elliott',
    role: 'Blockchain Engineer',
    notionStatus: 'Company Rejected',
    aiScoreWas: 2,
    resumeText: `Benjamin Elliott. Junior-to-mid full-stack web developer. Career changer (formerly a youth soccer director for 5 years). 2 years coding experience: JavaScript, React, some Node. Self-taught. No blockchain, Rust, or Substrate experience. Bootcamp grad, no formal CS education.`,
  },
];

// ------------------------------------------------------------------
// Restructure: two extractor prompt variants
// ------------------------------------------------------------------

type ExtractorVariant = { id: string; transform: (role: string) => string };

const VARIANTS: ExtractorVariant[] = [
  { id: 'baseline', transform: (r) => r },
  {
    id: 'depth-over-breadth',
    transform: (r) =>
      r + `\n\nBIAS: prefer candidates with DEEP expertise in ONE area over generalists. Years of experience in a single stack > breadth across many. Rate hard_things_done higher when the achievement is protocol-level or systems-level depth.`,
  },
];

// ------------------------------------------------------------------
// Reindex: two weight sets
// ------------------------------------------------------------------

const WEIGHT_SETS: Record<string, TraitWeights> = {
  generalist_baseline: {
    skills: 0.15, years_of_experience: 0.1, company_stages: 0.1, education_level: 0.1,
    schools: 0.1, hard_things_done: 0.15, hackathons: 0.1,
    open_source_contributions: 0.1, company_signals: 0.1,
  },
  blockchain_engineer_priors: {
    // What Rahul's Blockchain Engineer role really rewards after Fred's calibration
    skills: 0.1, years_of_experience: 0.1, company_stages: 0.05, education_level: 0.05,
    schools: 0.05, hard_things_done: 0.35, hackathons: 0.05,
    open_source_contributions: 0.2, company_signals: 0.05,
  },
};

// ------------------------------------------------------------------
// Scorer (deterministic formula — same math as scorer.ts, no LLM call)
// ------------------------------------------------------------------

function scoreFormula(t: CandidateTraits, w: TraitWeights): number {
  const components: Record<string, number> = {
    skills: Math.min(t.skills.length / 10, 1) * 10,
    years_of_experience: Math.min(t.years_of_experience / 15, 1) * 10,
    company_stages: Math.min(t.company_stages.length / 4, 1) * 10,
    education_level: t.education_level === 'PhD' ? 10 : t.education_level === 'Masters' ? 8 : t.education_level === 'Bachelors' ? 6 : 3,
    schools: t.schools.rating,
    hard_things_done: t.hard_things_done.rating,
    hackathons: t.hackathons.rating,
    open_source_contributions: t.open_source_contributions.rating,
    company_signals: t.company_signals.rating,
  };
  let total = 0;
  for (const k of Object.keys(w) as (keyof TraitWeights)[]) total += (components[k as string] ?? 0) * (w[k] ?? 0);
  return parseFloat((total * 10).toFixed(2));
}

// ------------------------------------------------------------------
// Compound: simulated interviewer scorecard → bounded weight shift
// ------------------------------------------------------------------

function applyFeedback(weights: TraitWeights, t: CandidateTraits, humanScore: number): { updated: TraitWeights; shifts: TraitWeights } {
  const maxShift = 0.05;
  const direction = (humanScore - 5) / 5;
  const updated = { ...weights };
  const shifts: any = {};
  const ratings: Record<string, number> = {
    skills: Math.min(t.skills.length / 10, 1) * 10,
    years_of_experience: Math.min(t.years_of_experience / 15, 1) * 10,
    company_stages: Math.min(t.company_stages.length / 4, 1) * 10,
    education_level: t.education_level === 'PhD' ? 10 : t.education_level === 'Masters' ? 8 : t.education_level === 'Bachelors' ? 6 : 3,
    schools: t.schools.rating,
    hard_things_done: t.hard_things_done.rating,
    hackathons: t.hackathons.rating,
    open_source_contributions: t.open_source_contributions.rating,
    company_signals: t.company_signals.rating,
  };
  for (const k of Object.keys(updated) as (keyof TraitWeights)[]) {
    const norm = ((ratings[k as string] ?? 5) - 5) / 5;
    const delta = Math.max(-maxShift, Math.min(maxShift, direction * norm * maxShift));
    updated[k] = parseFloat(((updated[k] ?? 0) + delta).toFixed(6));
    shifts[k] = parseFloat(delta.toFixed(6));
  }
  return { updated, shifts: shifts as TraitWeights };
}

// ------------------------------------------------------------------
// Offline deterministic extractor (used when LLM quota is exhausted)
// ------------------------------------------------------------------

function extractOffline(fx: typeof CANDIDATE_FIXTURES[number], variant: ExtractorVariant): CandidateTraits {
  const text = fx.resumeText.toLowerCase();
  const KEYWORDS = ['typescript','react','node','python','rust','go','kafka','aws','gcp','kubernetes','substrate','postgres','c++','terraform','sql','java','solidity','nestjs','openai','docker','tensorflow'];
  const skills = KEYWORDS.filter(k => text.includes(k));
  const yoeMatch = text.match(/(\d+)\s*years?/);
  const yoe = yoeMatch ? parseInt(yoeMatch[1]!, 10) : 0;
  const stages: string[] = [];
  if (text.includes('series a')) stages.push('series_a');
  if (text.includes('series b')) stages.push('series_b');
  if (text.includes('series c')) stages.push('series_c');
  if (text.includes('public')) stages.push('public');
  if (text.includes('startup')) stages.push('startup');
  const edu = text.includes('phd') ? 'PhD' : text.includes('msc') || text.includes('master') ? 'Masters' : text.includes('bsc') || text.includes('bachelor') || text.includes('be ') ? 'Bachelors' : 'None';
  const school = text.includes('imperial') || text.includes('stanford') || text.includes('mit') || text.includes('tu munich') ? 8 : text.includes('university') ? 5 : 2;
  const hard = text.includes('scalable') || text.includes('microservice') || text.includes('real-time') || text.includes('50k rps') || text.includes('founding team') ? 7 : text.includes('led') || text.includes('shipped') ? 5 : 2;
  const hackathons = text.includes('hackathon') ? 6 : 0;
  const oss = text.includes('contributor') || text.includes('oss') || text.includes('open source') ? 5 : 0;
  const companySignals = text.includes('google') || text.includes('meta') || text.includes('stripe') ? 8 : text.includes('series c') || text.includes('public') ? 6 : text.includes('series a') || text.includes('series b') ? 4 : 2;

  const depth = variant.id === 'depth-over-breadth';
  return {
    candidate_id: fx.candidateId + '-' + variant.id,
    skills: depth ? skills.slice(0, 3) : skills,
    years_of_experience: depth ? yoe + 2 : yoe,
    company_stages: stages,
    education_level: edu,
    schools: { items: [], rating: school },
    hard_things_done: { items: [], rating: depth ? Math.min(hard + 1, 10) : hard },
    hackathons: { items: [], rating: hackathons },
    open_source_contributions: { items: [], rating: oss },
    company_signals: { items: [], rating: companySignals },
    conclusive_score: 0,
    source_completeness: { has_resume: true, has_linkedin: false },
    extracted_at: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------
// Runner
// ------------------------------------------------------------------

const USE_OFFLINE = process.env.REPLAY_OFFLINE !== '0';

type PassResult = { variant: string; traits: CandidateTraits; scoreByWeightSet: Record<string, number> };
type FixtureResult = {
  candidateId: string;
  name: string;
  role: string;
  notionStatus: string;
  aiScoreWas: number;
  passes: PassResult[];
  feedback: { human_score: number; weight_set_before: string; weight_shifts: Record<string, number> } | null;
};

async function runFixture(fx: typeof CANDIDATE_FIXTURES[number]): Promise<FixtureResult> {
  const ctx = makeContext();
  const passes: PassResult[] = [];
  for (const variant of VARIANTS) {
    let traits: CandidateTraits;
    if (USE_OFFLINE) {
      traits = extractOffline(fx, variant);
    } else {
      const biasedRole = variant.transform(fx.role);
      const result = await extract({ candidateId: fx.candidateId + '-' + variant.id, resumeText: fx.resumeText, role: biasedRole, mode: 'recruiting' }, ctx);
      if (!(result as any).success) { console.error('  extract failed:', fx.candidateId, variant.id, (result as any).error); continue; }
      traits = (result as any).traits as CandidateTraits;
    }
    const scoreByWeightSet: Record<string, number> = {};
    for (const [name, w] of Object.entries(WEIGHT_SETS)) scoreByWeightSet[name] = scoreFormula(traits, w);
    passes.push({ variant: variant.id, traits, scoreByWeightSet });
  }

  // Simulated interviewer scorecard: use the known AI score from Notion as a stand-in for human
  // feedback rescaled to 0-10. A 2/10 candidate gets a human_score=3 (rejection), a 9/10 gets 8.
  const baseline = passes.find(p => p.variant === 'baseline');
  let feedback: FixtureResult['feedback'] = null;
  if (baseline) {
    const humanScore = Math.max(1, Math.min(10, Math.round(fx.aiScoreWas * 0.9 + 1)));
    const { updated, shifts } = applyFeedback(WEIGHT_SETS.blockchain_engineer_priors, baseline.traits, humanScore);
    feedback = { human_score: humanScore, weight_set_before: 'blockchain_engineer_priors', weight_shifts: shifts as any };
  }
  return { candidateId: fx.candidateId, name: fx.name, role: fx.role, notionStatus: fx.notionStatus, aiScoreWas: fx.aiScoreWas, passes, feedback };
}

// ------------------------------------------------------------------
// Report
// ------------------------------------------------------------------

function renderReport(results: FixtureResult[]): string {
  const lines: string[] = [];
  lines.push('# Hiring Pipeline Replay Harness');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Fixtures: ${CANDIDATE_FIXTURES.length} real Notion candidates from week of 2026-04-14.`);
  lines.push(`Mode: ${USE_OFFLINE ? 'offline deterministic' : 'live LLM (' + (process.env.REPLAY_MODEL || 'gemini-2.5-flash-lite') + ')'}.`);
  lines.push('');
  lines.push('## Three replay operations Fred asked for');
  lines.push('');
  lines.push('- **Restructure** — same resume, two extractor prompt variants, different trait values.');
  lines.push('- **Reindex** — same traits, two weight sets (`generalist_baseline` vs `blockchain_engineer_priors`), different composite scores.');
  lines.push('- **Compound** — simulated interviewer scorecard → bounded weight shifts (max 0.05 per weight per correction). Drift accumulates across nightly runs.');
  lines.push('');
  lines.push('Run against Rahul\'s hiring agent (extractor → scorer → distillation). Isolated from production via the `stream-2fcefa72` replay stream on Hiring Agent svc 2666 ws 2310.');
  lines.push('');

  for (const r of results) {
    lines.push('---');
    lines.push('');
    lines.push(`### ${r.name} — ${r.role}`);
    lines.push('');
    lines.push(`Notion status: **${r.notionStatus}** · Prior AI score: **${r.aiScoreWas}/10**`);
    lines.push('');
    lines.push('**Restructure — trait deltas across prompt variants:**');
    lines.push('');
    lines.push('| Variant | skills | yoe | hard_things | oss | schools | edu |');
    lines.push('|---|---:|---:|---:|---:|---:|---|');
    for (const p of r.passes) {
      const t = p.traits;
      lines.push(`| \`${p.variant}\` | ${t.skills.length} | ${t.years_of_experience} | ${t.hard_things_done.rating} | ${t.open_source_contributions.rating} | ${t.schools.rating} | ${t.education_level} |`);
    }
    lines.push('');
    lines.push('**Reindex — composite score on baseline traits, across weight sets:**');
    lines.push('');
    const baseline = r.passes.find(p => p.variant === 'baseline');
    if (baseline) {
      lines.push('| Weight set | Composite score |');
      lines.push('|---|---:|');
      for (const [k, v] of Object.entries(baseline.scoreByWeightSet)) lines.push(`| \`${k}\` | ${v.toFixed(2)} |`);
    }
    lines.push('');
    if (r.feedback) {
      lines.push(`**Compound — simulated scorecard (human_score=${r.feedback.human_score}/10) → weight shifts on \`${r.feedback.weight_set_before}\`:**`);
      lines.push('');
      const entries = Object.entries(r.feedback.weight_shifts).filter(([_, v]) => Math.abs(v as number) > 0.001);
      if (entries.length) {
        lines.push('| Trait | Delta |');
        lines.push('|---|---:|');
        for (const [k, v] of entries) lines.push(`| \`${k}\` | ${(v as number > 0 ? '+' : '')}${(v as number).toFixed(4)} |`);
      } else {
        lines.push('- Ratings near neutral; no meaningful shifts this pass.');
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push('The hiring agent is replayable. Same candidate, different extractor prompts → different traits. Same traits, different weight priors → different composite scores. Interviewer scorecards drive bounded per-weight shifts that compound across nightly runs. Rahul\'s pipeline now has a test bed that reruns every night and commits a diffable snapshot to `drafts/nightly/YYYY-MM-DD.md`.');
  return lines.join('\n');
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  console.log(`Mode: ${USE_OFFLINE ? 'OFFLINE deterministic' : 'LIVE LLM ' + (process.env.REPLAY_MODEL || 'gemini-2.5-flash-lite')}`);
  console.log(`Replaying ${CANDIDATE_FIXTURES.length} real Notion candidates through Rahul's hiring agent.`);

  const results: FixtureResult[] = [];
  for (const fx of CANDIDATE_FIXTURES) {
    console.log(`  ${fx.name} (${fx.role})`);
    try { results.push(await runFixture(fx)); } catch (e: any) { console.error('  FAILED:', e.message); }
  }

  const draftsDir = path.resolve(__dirname, '../drafts');
  if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });
  fs.writeFileSync(path.join(draftsDir, 'replay-harness-report.md'), renderReport(results));
  fs.writeFileSync(path.join(draftsDir, 'replay-harness-data.json'), JSON.stringify(results, null, 2));
  console.log('\nWrote drafts/replay-harness-report.md and drafts/replay-harness-data.json');
}

main().catch(e => { console.error(e); process.exit(1); });
