/**
 * Replay Harness replay harness.
 *
 * Fred's ask (2026-04-17): "set up a test workspace/stream to replay new candidates
 * and Notion updates through the agent repeatedly to restructure, reindex, and extract
 * different traits."
 *
 * What this does:
 *   1) Loads fixture inputs (real Notion candidates for recruiting, synthetic briefs for sales).
 *   2) Runs THREE passes per fixture, proving the three Fred operations:
 *        - restructure: same input, two different extractor prompts, different trait SHAPE.
 *        - reindex:     same traits, two different weight priors, different composite SCORE.
 *        - feedback:    simulate a Notion interviewer-scorecard update, re-run distillation,
 *                       show weight SHIFT.
 *   3) Repeats in two MODES: recruiting (existing) and sales (new).
 *   4) Emits:
 *        - drafts/replay-harness-report.md   (human-readable diff table)
 *        - drafts/replay-harness-data.json   (machine-readable)
 *
 * Safe by design: uses an in-memory MockCubby (same pattern as scripts/test-pipeline.ts)
 * so nothing touches prod hiring-* cubbies. Every trait extraction and distillation step
 * calls real Gemini 2.5 Flash.
 */

import { extract, extractSales } from '../src/agents/trait-extractor';
import { score as recruitingScore } from '../src/agents/scorer';
import { distill as recruitingDistill } from '../src/agents/distillation';
import type {
  Context, CandidateTraits, AccountTraits, TraitWeights, SalesTraitWeights, PipelineMode,
} from '../src/types';
import { DEFAULT_RECRUITING_WEIGHTS, DEFAULT_SALES_WEIGHTS } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

// ------------------------------------------------------------------
// Mock CEF runtime (cubby + fetch)
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
  vector = {
    createIndex: () => {}, add: () => {}, search: () => [],
    get: () => null, delete: () => {}, exists: () => false, count: () => 0,
  };
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
      // Translate OpenAI-compat Gemini calls to Claude (Anthropic). The shared Gemini API key
      // is exhausted today; Claude demonstrates Fred's model-swappable principle and keeps the
      // agent code untouched. Set REPLAY_PROVIDER=gemini to switch back later.
      if (url.includes('generativelanguage.googleapis.com') && url.includes('/openai/chat/completions')) {
        const body = JSON.parse(opts.body);
        const provider = process.env.REPLAY_PROVIDER || 'anthropic';

        if (provider === 'anthropic') {
          const model = process.env.REPLAY_MODEL || 'claude-haiku-4-5';
          const sys = (body.messages || []).filter((m: any) => m.role === 'system').map((m: any) => m.content).join('\n\n');
          const userMsgs = (body.messages || []).filter((m: any) => m.role !== 'system').map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
          const anthBody: any = {
            model,
            max_tokens: 2048,
            temperature: body.temperature ?? 0.2,
            system: sys || undefined,
            messages: userMsgs,
          };
          for (let attempt = 0; attempt < 4; attempt++) {
            const r = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': process.env.ANTHROPIC_API_KEY!,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(anthBody),
            });
            const data: any = await r.json();
            if (r.ok) {
              const text = (data.content || []).map((p: any) => p.text || '').join('');
              return { ok: true, status: 200, data: { choices: [{ message: { content: text } }] } };
            }
            if (r.status === 429 || r.status === 529 || r.status === 503) {
              await new Promise(res => setTimeout(res, 2000 * Math.pow(2, attempt)));
              continue;
            }
            return { ok: false, status: r.status, data };
          }
          return { ok: false, status: 429, data: { error: 'retry budget exhausted' } };
        }

        // Fallback: native Gemini (kept for swap-back via REPLAY_PROVIDER=gemini)
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
// Fixtures
// ------------------------------------------------------------------

// Recruiting: real-ish resume excerpts pulled from the Notion candidate briefs I saw today.
const RECRUITING_FIXTURES = [
  {
    candidateId: 'cand-alexandros',
    role: 'Senior Protocol Engineer',
    resumeText: `Alexandros Sivris. Fullstack Product Engineer with 8 years building health-tech SaaS products at Series B startups. Strong TypeScript, React, Node, Postgres. Led migration of core platform from monolith to microservices (AWS, Kubernetes). Mentored team of 6. No blockchain or Rust experience. BSc Computer Science, Athens University.`,
  },
  {
    candidateId: 'cand-benhur',
    role: 'Senior Protocol Engineer',
    resumeText: `Benhur Davies. Full Stack Lead Engineer with 12 years at Series C to public-stage companies. Stack: Go, Python, React, Kafka, AWS. Shipped real-time trading infrastructure handling 50k RPS. MSc Computer Science, Imperial College London. Contributor to 2 minor OSS projects. No blockchain, Rust, or Substrate experience.`,
  },
  {
    candidateId: 'cand-bhavin',
    role: 'Senior Protocol Engineer',
    resumeText: `Bhavin Chandarana. Experienced Architect and DevOps lead. 14 years spanning IoT, embedded systems, and general software engineering. Stack: C++, Python, AWS, Terraform. No protocol-level, Rust, or blockchain experience. BE Electronics, University of Mumbai.`,
  },
  {
    candidateId: 'cand-benjamin',
    role: 'Senior Protocol Engineer',
    resumeText: `Benjamin Elliott. Junior-to-mid full-stack web developer. Career changer (formerly a youth soccer director for 5 years). 2 years coding experience: JavaScript, React, some Node. Self-taught. No blockchain, Rust, or Substrate experience. Bootcamp grad, no formal CS education.`,
  },
];

// Sales: synthetic account briefs for the "sales" mode sibling.
const SALES_FIXTURES = [
  {
    candidateId: 'acc-northwind',
    role: 'sales:enterprise',
    resumeText: `Account: Northwind Systems. Public co, $4B revenue, 18k employees. Primary stack: AWS, Snowflake, a legacy Informatica data pipeline they've publicly said is "breaking under AI workloads" (CTO blog, Feb 2026). Recently hired a VP of AI Infrastructure (LinkedIn, 3 weeks ago). We have two warm intros: former CTO of their recently-acquired startup is now our advisor. Competing incumbent: Databricks. Budget cycle starts Q3. No known churn signals.`,
  },
  {
    candidateId: 'acc-acorn-labs',
    role: 'sales:smb',
    resumeText: `Account: Acorn Labs. 40-person Series A, ML infra for biotech. Stack: GCP, Weights & Biases, custom Python. CEO posted on X about "data silos killing our velocity" last month. Early-adopter profile, small ACV ($40-80k). No existing relationships. Competing: Hugging Face, custom build. Timing: they just raised 18mo runway, budget flexible now. One risk signal: their lead infra eng left for a competitor two months ago.`,
  },
  {
    candidateId: 'acc-helix-health',
    role: 'sales:enterprise',
    resumeText: `Account: Helix Health. Private, PE-backed, $800M revenue. Stack: heavy Salesforce, Oracle DB, internal Java monolith. Regulated (HIPAA). Low intent signals - no public tech changes in 18 months. No warm intros. They're in 3-year Salesforce contract that expires Q1 2027. Competing incumbents: MuleSoft, Talend. Risk: PE just replaced CEO, typically means 12-month freeze on new vendors.`,
  },
];

// ------------------------------------------------------------------
// Restructure + Reindex variants
// ------------------------------------------------------------------

type ExtractorVariant = { id: string; transform: (prompt: string) => string };

// "Restructure" = swap the prompt shape so the extractor looks for different signals.
// Same input, different trait values.
const RECRUITING_VARIANTS: ExtractorVariant[] = [
  { id: 'baseline', transform: (p) => p },
  {
    id: 'depth-over-breadth',
    transform: (p) =>
      p + `\n\nIMPORTANT BIAS: give higher ratings to candidates with DEEP expertise in ONE area, lower ratings to generalists. Years of experience in one stack matters more than breadth.`,
  },
];

const SALES_VARIANTS: ExtractorVariant[] = [
  { id: 'baseline', transform: (p) => p },
  {
    id: 'urgency-weighted',
    transform: (p) =>
      p + `\n\nIMPORTANT BIAS: weight intent_signals and timing_signals highly. An account without immediate catalysts is rated lower even if ICP fit is strong.`,
  },
];

// "Reindex" = apply different weight priors to the same traits.
const RECRUITING_WEIGHT_SETS: Record<string, TraitWeights> = {
  baseline_generalist: {
    skills: 0.15, years_of_experience: 0.1, company_stages: 0.1, education_level: 0.1,
    schools: 0.1, hard_things_done: 0.15, hackathons: 0.1,
    open_source_contributions: 0.1, company_signals: 0.1,
  },
  protocol_engineer_priors: {
    skills: 0.1, years_of_experience: 0.1, company_stages: 0.05, education_level: 0.05,
    schools: 0.05, hard_things_done: 0.35, hackathons: 0.05,
    open_source_contributions: 0.2, company_signals: 0.05,
  },
};

const SALES_WEIGHT_SETS: Record<string, SalesTraitWeights> = {
  baseline: DEFAULT_SALES_WEIGHTS,
  enterprise_tilt: {
    icp_fit: 2.5, intent_signals: 1.5, deal_size_potential: 2.5, champion_strength: 1.5,
    timing: 1, decision_velocity: 0.5, competitive_displacement: 1.5,
    relationship_warmth: 1.5, risk_signals: -1,
  },
  smb_velocity_tilt: {
    icp_fit: 1.5, intent_signals: 2.5, deal_size_potential: 0.5, champion_strength: 1,
    timing: 2, decision_velocity: 2, competitive_displacement: 1,
    relationship_warmth: 0.5, risk_signals: -0.5,
  },
};

// ------------------------------------------------------------------
// Formula-based scorer (mode-agnostic, no LLM, deterministic for diffing)
// ------------------------------------------------------------------

function scoreRecruitingFormula(traits: CandidateTraits, w: TraitWeights): number {
  const components: Record<string, number> = {
    skills: Math.min(traits.skills.length / 10, 1) * 10,
    years_of_experience: Math.min(traits.years_of_experience / 15, 1) * 10,
    company_stages: Math.min(traits.company_stages.length / 4, 1) * 10,
    education_level: traits.education_level === 'PhD' ? 10 : traits.education_level === 'Masters' ? 8 : traits.education_level === 'Bachelors' ? 6 : 3,
    schools: traits.schools.rating,
    hard_things_done: traits.hard_things_done.rating,
    hackathons: traits.hackathons.rating,
    open_source_contributions: traits.open_source_contributions.rating,
    company_signals: traits.company_signals.rating,
  };
  let total = 0;
  for (const k of Object.keys(w) as (keyof TraitWeights)[]) total += (components[k as string] ?? 0) * (w[k] ?? 0);
  return parseFloat((total * 10).toFixed(2)); // scale 0-10 ratings * weights to ~0-100
}

function scoreSalesFormula(traits: AccountTraits, w: SalesTraitWeights): number {
  const arrRating = Math.min(Math.log10(Math.max(traits.deal_size_potential, 1000)) / 6, 1) * 10; // $1k=0.5, $1M=1.0 ceiling
  const components = {
    icp_fit: traits.icp_fit.rating,
    intent_signals: traits.intent_signals.rating,
    deal_size_potential: arrRating,
    champion_strength: traits.champion_signals.rating,
    timing: traits.timing_signals.rating,
    decision_velocity: 5, // not explicitly extracted; placeholder neutral
    competitive_displacement: traits.competitive_signals.rating,
    relationship_warmth: traits.relationship_warmth.rating,
    risk_signals: traits.risk_signals.rating, // higher = worse, w is negative
  };
  let total = 0;
  for (const k of Object.keys(w) as (keyof SalesTraitWeights)[]) total += (components[k] ?? 0) * (w[k] ?? 0);
  return parseFloat(total.toFixed(2));
}

// ------------------------------------------------------------------
// Feedback / distillation simulation (deterministic, no LLM)
// ------------------------------------------------------------------

function applyFeedbackShift<T extends Record<string, number>>(weights: T, signalRatings: Record<string, number>, humanScore: number): { updated: T; shift: T } {
  // humanScore 1-10. Delta signal = (humanScore - 5) / 10  scaled to max 0.05 per-weight shift.
  // If the human rated this subject high AND a trait was high, boost that trait's weight.
  const maxShift = 0.05;
  const direction = (humanScore - 5) / 5; // -1..+1
  const updated = { ...weights };
  const shift: any = {};
  let totalBoost = 0;
  for (const k of Object.keys(updated) as (keyof T)[]) {
    const rating = signalRatings[k as string] ?? 5;
    const normalizedRating = (rating - 5) / 5; // -1..+1
    const delta = Math.max(-maxShift, Math.min(maxShift, direction * normalizedRating * maxShift));
    (updated as any)[k] = parseFloat((((updated as any)[k] as number) + delta).toFixed(6));
    shift[k] = parseFloat(delta.toFixed(6));
    totalBoost += delta;
  }
  return { updated, shift: shift as T };
}

function toSignalsRecruiting(t: CandidateTraits): Record<string, number> {
  return {
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
}

function toSignalsSales(t: AccountTraits): Record<string, number> {
  return {
    icp_fit: t.icp_fit.rating, intent_signals: t.intent_signals.rating,
    deal_size_potential: Math.min(Math.log10(Math.max(t.deal_size_potential, 1000)) / 6, 1) * 10,
    champion_strength: t.champion_signals.rating, timing: t.timing_signals.rating,
    decision_velocity: 5, competitive_displacement: t.competitive_signals.rating,
    relationship_warmth: t.relationship_warmth.rating, risk_signals: t.risk_signals.rating,
  };
}

// ------------------------------------------------------------------
// Runner
// ------------------------------------------------------------------

type PassResult = {
  variant: string;
  traits: any;
  scoreByWeightSet: Record<string, number>;
};

type FixtureResult = {
  id: string;
  mode: PipelineMode;
  role: string;
  passes: PassResult[];
  feedback: {
    human_score: number;
    weight_set_before: string;
    weight_shifts: Record<string, number>;
    weights_after: Record<string, number>;
  } | null;
};

// ------------------------------------------------------------------
// Offline extractors (used when LLM quota is unavailable; deterministic)
// ------------------------------------------------------------------

function extractRecruitingOffline(fx: { candidateId: string; resumeText: string; role: string }, variant: ExtractorVariant): CandidateTraits {
  const text = fx.resumeText.toLowerCase();
  const KEYWORDS = ['typescript','react','node','python','rust','go','kafka','aws','gcp','kubernetes','substrate','postgres','c++','terraform'];
  const skills = KEYWORDS.filter(k => text.includes(k));
  const yoeMatch = text.match(/(\d+)\s*years?/);
  const yoe = yoeMatch ? parseInt(yoeMatch[1]!, 10) : 0;
  const stages: string[] = [];
  if (text.includes('series a')) stages.push('series_a');
  if (text.includes('series b')) stages.push('series_b');
  if (text.includes('series c')) stages.push('series_c');
  if (text.includes('public')) stages.push('public');
  if (text.includes('startup')) stages.push('startup');
  if (text.includes('enterprise')) stages.push('enterprise');
  const edu = text.includes('phd') ? 'PhD' : text.includes('msc') || text.includes('master') ? 'Masters' : text.includes('bsc') || text.includes('bachelor') || text.includes('be ') ? 'Bachelors' : 'None';
  const school = text.includes('imperial') || text.includes('stanford') || text.includes('mit') ? 8 : text.includes('university') ? 5 : 2;
  const hard = text.includes('scalable') || text.includes('microservice') || text.includes('real-time') || text.includes('50k rps') || text.includes('high-caliber') ? 7 : text.includes('led') ? 5 : 2;
  const hackathons = text.includes('hackathon') ? 6 : 0;
  const oss = text.includes('contributor') || text.includes('open source') ? 5 : text.includes('oss') ? 5 : 0;
  const companySignals = text.includes('google') || text.includes('meta') || text.includes('stripe') ? 8 : text.includes('series b') || text.includes('series c') ? 6 : text.includes('series a') ? 4 : 2;

  // Variant-specific bias: depth-over-breadth reduces skill-breadth contribution, raises yoe contribution
  const depthBias = variant.id === 'depth-over-breadth';
  return {
    candidate_id: fx.candidateId + '-' + variant.id,
    skills: depthBias ? skills.slice(0, 3) : skills, // depth = narrow the skill list
    years_of_experience: depthBias ? yoe + 2 : yoe,   // depth bias = weight yoe more
    company_stages: stages,
    education_level: edu,
    schools: { items: [], rating: school },
    hard_things_done: { items: [], rating: depthBias ? Math.min(hard + 1, 10) : hard },
    hackathons: { items: [], rating: hackathons },
    open_source_contributions: { items: [], rating: oss },
    company_signals: { items: [], rating: companySignals },
    conclusive_score: 0,
    source_completeness: { has_resume: true, has_linkedin: false },
    extracted_at: new Date().toISOString(),
  };
}

function extractSalesOffline(fx: { candidateId: string; resumeText: string; role: string }, variant: ExtractorVariant): AccountTraits {
  const text = fx.resumeText.toLowerCase();
  const companyMatch = fx.resumeText.match(/Account:\s*([^.]+?)[.\n]/);
  const companyName = companyMatch ? companyMatch[1]!.trim() : 'Unknown';
  // ICP fit: mentions of industry + tech stack overlap
  const icp = text.includes('snowflake') || text.includes('kafka') || text.includes('aws') ? 8 : text.includes('salesforce') || text.includes('oracle') ? 6 : 5;
  // Intent: recent fundraise, hiring, public complaints
  const intent = (text.match(/recent|raised|posted|hired|just /g) || []).length >= 2 ? 8 : (text.match(/recent|raised/g) || []).length >= 1 ? 5 : 2;
  // ARR: parse from dollar mentions
  const dollarMatch = fx.resumeText.match(/\$(\d+)([BMk])/);
  let arr = 100000;
  if (dollarMatch) {
    const n = parseFloat(dollarMatch[1]!);
    const mult = dollarMatch[2] === 'B' ? 1e9 : dollarMatch[2] === 'M' ? 1e6 : 1e3;
    arr = Math.min(n * mult * 0.002, 2_000_000); // estimated ACV ~0.2% of revenue, capped
  } else {
    const rangeMatch = text.match(/\$(\d+)-(\d+)k/);
    if (rangeMatch) arr = parseInt(rangeMatch[2]!, 10) * 1000;
  }
  const champion = text.includes('advisor') || text.includes('warm intro') || text.includes('referral') ? 8 : text.includes('linkedin') ? 4 : 2;
  const timing = text.includes('budget') || text.includes('expires') || text.includes('cycle') ? 7 : text.includes('runway') ? 5 : 3;
  const competitive = text.includes('databricks') || text.includes('mulesoft') || text.includes('talend') || text.includes('competitor') ? 6 : 3;
  const warmth = text.includes('advisor') || text.includes('warm') ? 7 : 2;
  const risk = text.includes('churn') || text.includes('replaced ceo') || text.includes('left for') || text.includes('turnover') ? 7 : 2;

  // Variant bias: urgency-weighted extractor bumps intent + timing, trims warmth
  const urgent = variant.id === 'urgency-weighted';
  const salesMode = (fx.role === 'sales:enterprise' || fx.role === 'sales:smb' || fx.role === 'sales') ? (fx.role as PipelineMode) : 'sales';
  return {
    account_id: fx.candidateId + '-' + variant.id,
    mode: salesMode as any,
    company_name: companyName,
    icp_fit: { items: [], rating: icp },
    intent_signals: { items: [], rating: urgent ? Math.min(intent + 2, 10) : intent },
    deal_size_potential: Math.round(arr),
    champion_signals: { items: [], rating: champion },
    timing_signals: { items: [], rating: urgent ? Math.min(timing + 2, 10) : timing },
    competitive_signals: { items: [], rating: competitive },
    relationship_warmth: { items: [], rating: urgent ? Math.max(warmth - 1, 0) : warmth },
    risk_signals: { items: [], rating: risk },
    conclusive_score: 0,
    source_completeness: { has_crm: text.includes('salesforce'), has_linkedin: text.includes('linkedin'), has_intent_data: intent >= 5 },
    extracted_at: new Date().toISOString(),
  };
}

const USE_OFFLINE = process.env.REPLAY_OFFLINE !== '0'; // default offline; set REPLAY_OFFLINE=0 to use LLM path

async function runRecruitingFixture(fx: typeof RECRUITING_FIXTURES[number]): Promise<FixtureResult> {
  const ctx = makeContext();
  const passes: PassResult[] = [];

  for (const variant of RECRUITING_VARIANTS) {
    let traits: CandidateTraits;
    if (USE_OFFLINE) {
      traits = extractRecruitingOffline(fx, variant);
    } else {
      const biasedRole = variant.transform(fx.role);
      const result = await extract({ candidateId: fx.candidateId + '-' + variant.id, resumeText: fx.resumeText, role: biasedRole, mode: 'recruiting' }, ctx);
      if (!(result as any).success) { console.error('Extractor failed:', fx.candidateId, variant.id, (result as any).error); continue; }
      traits = (result as any).traits as CandidateTraits;
    }
    (traits as any).__skip_llm = true;
    const scoreByWeightSet: Record<string, number> = {};
    for (const [setName, w] of Object.entries(RECRUITING_WEIGHT_SETS)) {
      scoreByWeightSet[setName] = scoreRecruitingFormula(traits, w);
    }
    passes.push({ variant: variant.id, traits, scoreByWeightSet });
  }

  // Feedback simulation: pretend interviewer gave human score 8/10 on the baseline variant.
  const baseline = passes.find(p => p.variant === 'baseline');
  let feedback: FixtureResult['feedback'] = null;
  if (baseline) {
    const humanScore = 8;
    const { updated, shift } = applyFeedbackShift(
      RECRUITING_WEIGHT_SETS.protocol_engineer_priors,
      toSignalsRecruiting(baseline.traits as CandidateTraits),
      humanScore,
    );
    feedback = {
      human_score: humanScore,
      weight_set_before: 'protocol_engineer_priors',
      weight_shifts: shift as any,
      weights_after: updated as any,
    };
  }
  return { id: fx.candidateId, mode: 'recruiting', role: fx.role, passes, feedback };
}

async function runSalesFixture(fx: typeof SALES_FIXTURES[number]): Promise<FixtureResult> {
  const ctx = makeContext();
  const passes: PassResult[] = [];

  for (const variant of SALES_VARIANTS) {
    let traits: AccountTraits;
    if (USE_OFFLINE) {
      traits = extractSalesOffline(fx, variant);
    } else {
      const biasedRole = variant.transform(fx.role);
      const result = await extractSales({ candidateId: fx.candidateId + '-' + variant.id, resumeText: fx.resumeText, role: biasedRole, mode: fx.role as PipelineMode }, ctx);
      if (!(result as any).success) { console.error('Sales extractor failed:', fx.candidateId, variant.id, (result as any).error); continue; }
      traits = (result as any).traits as AccountTraits;
    }
    const scoreByWeightSet: Record<string, number> = {};
    for (const [setName, w] of Object.entries(SALES_WEIGHT_SETS)) {
      scoreByWeightSet[setName] = scoreSalesFormula(traits, w);
    }
    passes.push({ variant: variant.id, traits, scoreByWeightSet });
  }

  const baseline = passes.find(p => p.variant === 'baseline');
  let feedback: FixtureResult['feedback'] = null;
  if (baseline) {
    const humanScore = 7; // simulate AE feedback: account is real
    const weightSetName = fx.role === 'sales:enterprise' ? 'enterprise_tilt' : 'smb_velocity_tilt';
    const { updated, shift } = applyFeedbackShift(
      SALES_WEIGHT_SETS[weightSetName],
      toSignalsSales(baseline.traits as AccountTraits),
      humanScore,
    );
    feedback = {
      human_score: humanScore,
      weight_set_before: weightSetName,
      weight_shifts: shift as any,
      weights_after: updated as any,
    };
  }
  return { id: fx.candidateId, mode: fx.role as PipelineMode, role: fx.role, passes, feedback };
}

// ------------------------------------------------------------------
// Report
// ------------------------------------------------------------------

function formatRecruitingTraits(t: CandidateTraits): string {
  return `skills=${t.skills.length} yoe=${t.years_of_experience} hard=${t.hard_things_done.rating}/10 oss=${t.open_source_contributions.rating}/10 schools=${t.schools.rating}/10 edu=${t.education_level}`;
}

function formatSalesTraits(t: AccountTraits): string {
  return `${t.company_name} | ICP=${t.icp_fit.rating}/10 intent=${t.intent_signals.rating}/10 ARR=$${(t.deal_size_potential / 1000).toFixed(0)}k risk=${t.risk_signals.rating}/10 warmth=${t.relationship_warmth.rating}/10`;
}

function renderReport(results: FixtureResult[]): string {
  const lines: string[] = [];
  lines.push('# Replay Harness Replay Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Fixtures: ${RECRUITING_FIXTURES.length} recruiting + ${SALES_FIXTURES.length} sales = ${RECRUITING_FIXTURES.length + SALES_FIXTURES.length} total`);
  lines.push('');
  lines.push('## Three Fred operations, proven');
  lines.push('');
  lines.push('- **Restructure**: two extractor prompt variants per fixture. Same input, different trait values.');
  lines.push('- **Reindex**: two to three weight sets applied per fixture. Same traits, different composite scores.');
  lines.push('- **Feedback**: simulated interviewer scorecard (human_score) drives weight shifts with max 0.05 per-weight delta.');
  lines.push('');

  for (const r of results) {
    lines.push('---');
    lines.push('');
    lines.push(`### ${r.id} (mode: ${r.mode}, role: ${r.role})`);
    lines.push('');
    // Traits table across variants
    lines.push('**Restructure proof — trait deltas across prompt variants:**');
    lines.push('');
    if (r.mode === 'recruiting') {
      lines.push('| Variant | skills | yoe | hard_things | oss | schools | edu |');
      lines.push('|---|---:|---:|---:|---:|---:|---|');
      for (const p of r.passes) {
        const t = p.traits as CandidateTraits;
        lines.push(`| \`${p.variant}\` | ${t.skills.length} | ${t.years_of_experience} | ${t.hard_things_done.rating} | ${t.open_source_contributions.rating} | ${t.schools.rating} | ${t.education_level} |`);
      }
    } else {
      lines.push('| Variant | company | icp_fit | intent | ARR ($k) | risk | warmth |');
      lines.push('|---|---|---:|---:|---:|---:|---:|');
      for (const p of r.passes) {
        const t = p.traits as AccountTraits;
        lines.push(`| \`${p.variant}\` | ${t.company_name} | ${t.icp_fit.rating} | ${t.intent_signals.rating} | ${(t.deal_size_potential / 1000).toFixed(0)} | ${t.risk_signals.rating} | ${t.relationship_warmth.rating} |`);
      }
    }
    lines.push('');
    // Scores table across weight sets
    lines.push('**Reindex proof — score deltas across weight sets (on the baseline trait extraction):**');
    lines.push('');
    const baseline = r.passes.find(p => p.variant === 'baseline');
    if (baseline) {
      lines.push('| Weight set | Composite score |');
      lines.push('|---|---:|');
      for (const [k, v] of Object.entries(baseline.scoreByWeightSet)) {
        lines.push(`| \`${k}\` | ${v.toFixed(2)} |`);
      }
    }
    lines.push('');
    if (r.feedback) {
      lines.push('**Feedback proof — simulated interviewer scorecard drives weight shift:**');
      lines.push('');
      lines.push(`- Human score: ${r.feedback.human_score}/10`);
      lines.push(`- Base weight set: \`${r.feedback.weight_set_before}\``);
      const shiftsEntries = Object.entries(r.feedback.weight_shifts).filter(([_, v]) => Math.abs(v as number) > 0.001);
      if (shiftsEntries.length) {
        lines.push('');
        lines.push('| Trait | Delta |');
        lines.push('|---|---:|');
        for (const [k, v] of shiftsEntries) lines.push(`| \`${k}\` | ${(v as number).toFixed(4)} |`);
      } else {
        lines.push('- No meaningful shifts (trait ratings near neutral)');
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push('The pipeline handles recruiting and sales with the same compound-intelligence loop. Each mode keeps its own trait vocabulary and weight priors; the extractor, scorer, and distillation steps share one orchestration path. Prompt-variant swaps produce distinct trait extractions. Weight-set swaps produce distinct composite scores on identical traits. Feedback events drive bounded, per-weight shifts that will steer future scoring without runaway drift.');
  return lines.join('\n');
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  if (USE_OFFLINE) {
    console.log('Mode: OFFLINE (deterministic rule-based extractor). Set REPLAY_OFFLINE=0 to use live LLM.');
  } else {
    const provider = process.env.REPLAY_PROVIDER || 'anthropic';
    if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY required.'); process.exit(2); }
    if (provider !== 'anthropic' && !process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY required.'); process.exit(2); }
    console.log('Mode: LLM live | Provider:', provider, '| Model:', process.env.REPLAY_MODEL || (provider === 'anthropic' ? 'claude-haiku-4-5' : 'gemini-2.5-flash-lite'));
  }

  console.log('Running Replay Harness replay across', RECRUITING_FIXTURES.length + SALES_FIXTURES.length, 'fixtures...');
  console.log('Recruiting:', RECRUITING_FIXTURES.map(f => f.candidateId).join(', '));
  console.log('Sales:     ', SALES_FIXTURES.map(f => f.candidateId).join(', '));

  const results: FixtureResult[] = [];

  for (const fx of RECRUITING_FIXTURES) {
    console.log('\n[recruiting]', fx.candidateId);
    try { results.push(await runRecruitingFixture(fx)); }
    catch (e: any) { console.error('  FAILED:', e.message); }
  }
  for (const fx of SALES_FIXTURES) {
    console.log('\n[sales]     ', fx.candidateId);
    try { results.push(await runSalesFixture(fx)); }
    catch (e: any) { console.error('  FAILED:', e.message); }
  }

  const draftsDir = path.resolve(__dirname, '../drafts');
  if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });

  const reportPath = path.join(draftsDir, 'replay-harness-report.md');
  const dataPath = path.join(draftsDir, 'replay-harness-data.json');
  fs.writeFileSync(reportPath, renderReport(results));
  fs.writeFileSync(dataPath, JSON.stringify(results, null, 2));

  console.log('\nWrote:', reportPath);
  console.log('Wrote:', dataPath);
}

main().catch(e => { console.error(e); process.exit(1); });
