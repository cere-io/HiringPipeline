'use client';

import React, { useState, useEffect, useCallback } from 'react';

const CI_NAME = 'Compound Intelligence';
const CI_SHORT = 'CI';
const ATS_NAME = 'Notion ATS';
const ATS_SHORT = 'ATS';

interface Candidate {
  subject_id: string;
  name: string;
  role: string;
  status: string;
  system_score: number;
  ats_score: number | null;
  human_score: number;
  system_delta: number;
  ats_delta: number | null;
  closer_system: 'system' | 'ats' | 'tie' | 'system_only';
}

interface Stats {
  mae: number | null;
  rmse: number | null;
  correlation: number | null;
  agreement_rate: number | null;
  avg_bias: number | null;
  n: number;
}

interface BenchmarkData {
  success: boolean;
  threshold: number;
  total_candidates: number;
  total_with_ats: number;
  system_stats: Stats;
  ats_stats: Stats;
  system_on_ats_subset: Omit<Stats, 'n'>;
  head_to_head: {
    system_wins: number;
    ats_wins: number;
    ties: number;
    system_only: number;
  };
  candidates: Candidate[];
}

interface Schema {
  id: string;
  name: string;
  domain: string;
}

// ── Hint tooltip ─────────────────────────────────────────────
function Hint({ text }: { text: string }) {
  return (
    <span className="relative group ml-1.5 inline-flex items-center cursor-help">
      <span className="w-4 h-4 rounded-full border border-zinc-600 text-zinc-500 text-[10px] font-bold flex items-center justify-center leading-none hover:border-zinc-400 hover:text-zinc-300 transition">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] text-zinc-300 leading-relaxed shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
        {text}
      </span>
    </span>
  );
}

// ── Scatter Plot ──────────────────────────────────────────────
function ScatterPlot({ data, xLabel, yLabel, title }: {
  data: Array<{ x: number; y: number; name: string }>;
  xLabel: string;
  yLabel: string;
  title: string;
}) {
  const W = 320, H = 280, PAD = 44, PLOT = W - PAD * 2;
  const max = 10;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border border-zinc-800 rounded-lg bg-zinc-900/50">
        <span className="text-zinc-500 text-sm">No data with both scores</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <h4 className="text-sm font-medium text-zinc-300 mb-2">{title}</h4>
      <svg width={W} height={H} className="overflow-visible">
        {[0, 2, 4, 6, 8, 10].map(v => {
          const pos = PAD + (v / max) * PLOT;
          return (
            <g key={v}>
              <line x1={PAD} y1={H - pos + PAD} x2={W - PAD} y2={H - pos + PAD} stroke="#27272a" strokeWidth={1} />
              <line x1={pos} y1={PAD} x2={pos} y2={H - PAD} stroke="#27272a" strokeWidth={1} />
              <text x={PAD - 6} y={H - pos + PAD + 4} textAnchor="end" fill="#71717a" fontSize={10}>{v}</text>
              <text x={pos} y={H - PAD + 16} textAnchor="middle" fill="#71717a" fontSize={10}>{v}</text>
            </g>
          );
        })}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={PAD} stroke="#3f3f46" strokeWidth={1.5} strokeDasharray="6 4" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#52525b" strokeWidth={1.5} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#52525b" strokeWidth={1.5} />
        <text x={W / 2} y={H - 4} textAnchor="middle" fill="#a1a1aa" fontSize={11}>{xLabel}</text>
        <text x={12} y={H / 2} textAnchor="middle" fill="#a1a1aa" fontSize={11} transform={`rotate(-90, 12, ${H / 2})`}>{yLabel}</text>
        {data.map((d, i) => {
          const cx = PAD + (d.x / max) * PLOT;
          const cy = H - PAD - (d.y / max) * PLOT;
          const dist = Math.abs(d.x - d.y);
          const color = dist <= 1 ? '#22c55e' : dist <= 2 ? '#eab308' : '#ef4444';
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={5} fill={color} opacity={0.8} stroke="#18181b" strokeWidth={1} />
              <title>{`${d.name}: ${xLabel}=${d.x}, ${yLabel}=${d.y}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 mt-1 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-500" />{'<'}1 diff</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />1-2 diff</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500" />{'>'}2 diff</span>
      </div>
    </div>
  );
}

// ── Error Histogram ──────────────────────────────────────────
function ErrorHistogram({ deltas, label, color }: { deltas: number[]; label: string; color: string }) {
  const W = 320, H = 180, PAD = 36;
  const bins: Record<string, number> = {};
  const binLabels = ['-5+', '-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '+4', '+5+'];
  binLabels.forEach(l => (bins[l] = 0));

  for (const d of deltas) {
    const rounded = Math.round(d);
    if (rounded <= -5) bins['-5+']++;
    else if (rounded >= 5) bins['+5+']++;
    else {
      const key = rounded >= 0 ? `+${rounded}` : `${rounded}`;
      const matchKey = rounded === 0 ? '0' : key;
      if (bins[matchKey] !== undefined) bins[matchKey]++;
    }
  }

  const maxCount = Math.max(...Object.values(bins), 1);
  const barW = (W - PAD * 2) / binLabels.length - 2;

  if (deltas.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 border border-zinc-800 rounded-lg bg-zinc-900/50">
        <span className="text-zinc-500 text-sm">No data</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <h4 className="text-sm font-medium text-zinc-300 mb-2">{label} Error Distribution</h4>
      <svg width={W} height={H}>
        {binLabels.map((bl, i) => {
          const x = PAD + i * ((W - PAD * 2) / binLabels.length) + 1;
          const h = (bins[bl] / maxCount) * (H - PAD * 2);
          return (
            <g key={bl}>
              <rect x={x} y={H - PAD - h} width={barW} height={h} fill={color} opacity={0.7} rx={2} />
              <text x={x + barW / 2} y={H - PAD + 14} textAnchor="middle" fill="#71717a" fontSize={9}>{bl}</text>
              {bins[bl] > 0 && (
                <text x={x + barW / 2} y={H - PAD - h - 4} textAnchor="middle" fill="#a1a1aa" fontSize={9}>{bins[bl]}</text>
              )}
            </g>
          );
        })}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#52525b" strokeWidth={1} />
      </svg>
      <span className="text-[10px] text-zinc-500 mt-0">Score difference (AI - Human)</span>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────
function StatCard({ label, systemVal, atsVal, lowerIsBetter, suffix, hint }: {
  label: string;
  systemVal: number | null;
  atsVal: number | null;
  lowerIsBetter?: boolean;
  suffix?: string;
  hint?: string;
}) {
  const suf = suffix || '';
  let systemWins = false;
  let atsWins = false;
  if (systemVal != null && atsVal != null) {
    if (lowerIsBetter) {
      systemWins = systemVal < atsVal;
      atsWins = atsVal < systemVal;
    } else {
      systemWins = systemVal > atsVal;
      atsWins = atsVal > systemVal;
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
        {hint && <Hint text={hint} />}
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500">{CI_SHORT}</span>
          <span className={`text-xl font-semibold ${systemWins ? 'text-emerald-400' : 'text-zinc-200'}`}>
            {systemVal != null ? `${systemVal}${suf}` : '—'}
          </span>
        </div>
        <span className="text-zinc-600 text-lg mb-0.5">vs</span>
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-zinc-500">{ATS_SHORT}</span>
          <span className={`text-xl font-semibold ${atsWins ? 'text-emerald-400' : 'text-zinc-200'}`}>
            {atsVal != null ? `${atsVal}${suf}` : '—'}
          </span>
        </div>
      </div>
      {systemWins && <span className="text-[10px] text-emerald-500 font-medium mt-1">{CI_SHORT} better</span>}
      {atsWins && <span className="text-[10px] text-amber-500 font-medium mt-1">{ATS_SHORT} better</span>}
    </div>
  );
}

// ── Delta badge ──────────────────────────────────────────────
function DeltaBadge({ val }: { val: number | null }) {
  if (val == null) return <span className="text-zinc-600">—</span>;
  const abs = Math.abs(val);
  const color = abs <= 1 ? 'text-emerald-400' : abs <= 2 ? 'text-yellow-400' : 'text-red-400';
  const sign = val > 0 ? '+' : '';
  return <span className={`font-mono text-sm ${color}`}>{sign}{val.toFixed(1)}</span>;
}

function WinnerBadge({ winner }: { winner: Candidate['closer_system'] }) {
  if (winner === 'system') return <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs">{CI_SHORT}</span>;
  if (winner === 'ats') return <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs">{ATS_SHORT}</span>;
  if (winner === 'tie') return <span className="px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-400 text-xs">Tie</span>;
  return <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 text-xs">N/A</span>;
}

// ── Main Page ────────────────────────────────────────────────
export default function BenchmarkPage() {
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [schemaId, setSchemaId] = useState<string>('');
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>('human_score');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetch('/api/v1/schemas')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.schemas?.length) {
          setSchemas(d.schemas);
          setSchemaId(d.schemas[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const fetchBenchmark = useCallback(async (sid: string) => {
    if (!sid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/benchmark?schema_id=${encodeURIComponent(sid)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (schemaId) fetchBenchmark(schemaId);
  }, [schemaId, fetchBenchmark]);

  const sorted = data ? [...data.candidates].sort((a, b) => {
    const aVal = (a as any)[sortKey] ?? -999;
    const bVal = (b as any)[sortKey] ?? -999;
    return sortAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  }) : [];

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sysStats = data?.system_on_ats_subset;
  const atsStats = data?.ats_stats;
  const h2h = data?.head_to_head;
  const h2hTotal = h2h ? h2h.system_wins + h2h.ats_wins + h2h.ties : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <a href="/" className="text-zinc-500 text-sm hover:text-zinc-300 transition mb-1 inline-block">&larr; Back to Dashboard</a>
            <h1 className="text-2xl font-bold text-zinc-100">Score Benchmark</h1>
            <p className="text-sm text-zinc-500 mt-1">{CI_NAME} vs {ATS_NAME} — measured against human scores</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-400">Schema:</label>
            <select
              value={schemaId}
              onChange={e => setSchemaId(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {schemas.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={() => fetchBenchmark(schemaId)}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition disabled:opacity-40"
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400 text-sm">{error}</div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center h-64">
            <div className="text-zinc-500">Loading benchmark data...</div>
          </div>
        )}

        {data && data.total_candidates === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="text-zinc-400 text-lg">No candidates with human scores found</div>
            <p className="text-zinc-600 text-sm max-w-md text-center">
              Candidates need to be processed by the system and have a &quot;Human Score&quot; property set in Notion.
            </p>
          </div>
        )}

        {data && data.total_candidates > 0 && (
          <>
            {/* Summary strip */}
            <div className="flex flex-wrap gap-3 mb-6 text-sm">
              <span className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300">
                {data.total_candidates} candidates with human scores
              </span>
              <span className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300">
                {data.total_with_ats} also have {ATS_NAME} scores
              </span>
              <span className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300">
                Agreement threshold: &plusmn;{data.threshold} pts
              </span>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Mean Abs Error"
                systemVal={sysStats?.mae ?? data.system_stats.mae}
                atsVal={atsStats?.mae ?? null}
                lowerIsBetter
                hint="Average distance between AI score and human score. Lower = AI is closer to how humans rate candidates."
              />
              <StatCard
                label="RMSE"
                systemVal={sysStats?.rmse ?? data.system_stats.rmse}
                atsVal={atsStats?.rmse ?? null}
                lowerIsBetter
                hint="Like MAE but penalizes big misses more heavily. Lower = fewer large scoring errors."
              />
              <StatCard
                label="Correlation"
                systemVal={sysStats?.correlation ?? data.system_stats.correlation}
                atsVal={atsStats?.correlation ?? null}
                hint="How well the AI ranking order matches human ranking. 1.0 = perfect match, 0 = no relationship."
              />
              <StatCard
                label="Agreement Rate"
                systemVal={sysStats?.agreement_rate != null ? Math.round(sysStats.agreement_rate * 100) : (data.system_stats.agreement_rate != null ? Math.round(data.system_stats.agreement_rate * 100) : null)}
                atsVal={atsStats?.agreement_rate != null ? Math.round(atsStats.agreement_rate * 100) : null}
                suffix="%"
                hint={`% of candidates where AI score was within ${data.threshold} point of the human score. Higher = more often agreeing with humans.`}
              />
            </div>

            {/* Head-to-head bar */}
            {h2hTotal > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8">
                <div className="flex items-center mb-3">
                  <h3 className="text-sm font-medium text-zinc-400">Head-to-Head: Which AI scored closer to the human score?</h3>
                  <Hint text="For each candidate, we check which AI gave a score closer to the human score. The bar shows how many candidates each system won." />
                </div>
                <div className="flex rounded-lg overflow-hidden h-10">
                  {h2h!.system_wins > 0 && (
                    <div
                      className="bg-blue-500 flex items-center justify-center text-white text-xs font-semibold transition-all"
                      style={{ width: `${(h2h!.system_wins / h2hTotal) * 100}%` }}
                    >
                      {CI_SHORT} {h2h!.system_wins}
                    </div>
                  )}
                  {h2h!.ties > 0 && (
                    <div
                      className="bg-zinc-600 flex items-center justify-center text-white text-xs font-semibold transition-all"
                      style={{ width: `${(h2h!.ties / h2hTotal) * 100}%` }}
                    >
                      Tie {h2h!.ties}
                    </div>
                  )}
                  {h2h!.ats_wins > 0 && (
                    <div
                      className="bg-amber-500 flex items-center justify-center text-white text-xs font-semibold transition-all"
                      style={{ width: `${(h2h!.ats_wins / h2hTotal) * 100}%` }}
                    >
                      {ATS_SHORT} {h2h!.ats_wins}
                    </div>
                  )}
                </div>
                <div className="flex justify-between mt-2 text-xs text-zinc-500">
                  <span>{CI_NAME} closer</span>
                  <span>{ATS_NAME} closer</span>
                </div>
                {data.head_to_head.system_only > 0 && (
                  <p className="text-xs text-zinc-600 mt-2">
                    {data.head_to_head.system_only} candidate{data.head_to_head.system_only > 1 ? 's' : ''} had no {ATS_NAME} score (excluded from head-to-head)
                  </p>
                )}
              </div>
            )}

            {/* Bias indicator */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">{CI_NAME} Bias</span>
                  <Hint text="Average signed difference (AI minus Human). Positive = this AI tends to give higher scores than humans. Negative = tends to score lower." />
                </div>
                <p className="text-lg font-semibold mt-1">
                  {data.system_stats.avg_bias != null && data.system_stats.avg_bias > 0 ? (
                    <span className="text-amber-400">+{data.system_stats.avg_bias} (over-rates)</span>
                  ) : data.system_stats.avg_bias != null && data.system_stats.avg_bias < 0 ? (
                    <span className="text-blue-400">{data.system_stats.avg_bias} (under-rates)</span>
                  ) : (
                    <span className="text-emerald-400">0 (unbiased)</span>
                  )}
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">{ATS_NAME} Bias</span>
                  <Hint text="Average signed difference (AI minus Human). Positive = this AI tends to give higher scores than humans. Negative = tends to score lower." />
                </div>
                <p className="text-lg font-semibold mt-1">
                  {atsStats?.avg_bias != null ? (
                    atsStats.avg_bias > 0 ? (
                      <span className="text-amber-400">+{atsStats.avg_bias} (over-rates)</span>
                    ) : atsStats.avg_bias < 0 ? (
                      <span className="text-blue-400">{atsStats.avg_bias} (under-rates)</span>
                    ) : (
                      <span className="text-emerald-400">0 (unbiased)</span>
                    )
                  ) : (
                    <span className="text-zinc-600">No {ATS_NAME} data</span>
                  )}
                </p>
              </div>
            </div>

            {/* Scatter plots */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-center mb-2">
                  <Hint text="Each dot is a candidate. The dashed line = perfect agreement. Dots on the line mean AI and Human gave the same score. Dots far from the line = disagreement." />
                </div>
                <div className="flex justify-center">
                  <ScatterPlot
                    data={data.candidates.map(c => ({ x: c.human_score, y: c.system_score, name: c.name }))}
                    xLabel="Human Score"
                    yLabel={`${CI_SHORT} Score`}
                    title={`${CI_NAME} vs Human`}
                  />
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-center mb-2">
                  <Hint text="Each dot is a candidate. The dashed line = perfect agreement. Dots on the line mean AI and Human gave the same score. Dots far from the line = disagreement." />
                </div>
                <div className="flex justify-center">
                  <ScatterPlot
                    data={data.candidates.filter(c => c.ats_score != null).map(c => ({ x: c.human_score, y: c.ats_score!, name: c.name }))}
                    xLabel="Human Score"
                    yLabel={`${ATS_SHORT} Score`}
                    title={`${ATS_NAME} vs Human`}
                  />
                </div>
              </div>
            </div>

            {/* Error distribution */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-center mb-2">
                  <Hint text="How often this AI misses by each amount. 0 = perfect match. Negative = AI scored lower than human. A tall bar at 0 is ideal." />
                </div>
                <div className="flex justify-center">
                  <ErrorHistogram
                    deltas={data.candidates.map(c => c.system_delta)}
                    label={CI_NAME}
                    color="#3b82f6"
                  />
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-center mb-2">
                  <Hint text="How often this AI misses by each amount. 0 = perfect match. Negative = AI scored lower than human. A tall bar at 0 is ideal." />
                </div>
                <div className="flex justify-center">
                  <ErrorHistogram
                    deltas={data.candidates.filter(c => c.ats_delta != null).map(c => c.ats_delta!)}
                    label={ATS_NAME}
                    color="#f59e0b"
                  />
                </div>
              </div>
            </div>

            {/* Candidate table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-8">
              <div className="p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-zinc-300">Candidate Scores</h3>
                  <Hint text={`Each row shows one candidate. Delta columns show the difference from the human score (green = close, red = far). The Closer column shows which AI was nearer to the human score for that candidate.`} />
                </div>
                <p className="text-xs text-zinc-600 mt-1">Click column headers to sort. {CI_SHORT} = {CI_NAME}. {ATS_SHORT} = {ATS_NAME}.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                      {[
                        { key: 'name', label: 'Candidate' },
                        { key: 'role', label: 'Role' },
                        { key: 'status', label: 'Status' },
                        { key: 'human_score', label: 'Human' },
                        { key: 'system_score', label: CI_SHORT },
                        { key: 'system_delta', label: `${CI_SHORT} \u0394` },
                        { key: 'ats_score', label: ATS_SHORT },
                        { key: 'ats_delta', label: `${ATS_SHORT} \u0394` },
                        { key: 'closer_system', label: 'Closer' },
                      ].map(col => (
                        <th
                          key={col.key}
                          className="px-4 py-3 text-left cursor-pointer hover:text-zinc-300 transition select-none"
                          onClick={() => handleSort(col.key)}
                        >
                          {col.label}
                          {sortKey === col.key && (
                            <span className="ml-1">{sortAsc ? '\u2191' : '\u2193'}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(c => (
                      <tr key={c.subject_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition">
                        <td className="px-4 py-3 text-zinc-200 font-medium max-w-[200px] truncate">{c.name}</td>
                        <td className="px-4 py-3 text-zinc-400">{c.role}</td>
                        <td className="px-4 py-3">
                          <span className="text-zinc-400 text-xs">{c.status || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-zinc-100 font-semibold">{c.human_score.toFixed(1)}</td>
                        <td className="px-4 py-3 text-blue-400 font-mono">{c.system_score.toFixed(1)}</td>
                        <td className="px-4 py-3"><DeltaBadge val={c.system_delta} /></td>
                        <td className="px-4 py-3 text-amber-400 font-mono">{c.ats_score != null ? c.ats_score.toFixed(1) : '—'}</td>
                        <td className="px-4 py-3"><DeltaBadge val={c.ats_delta} /></td>
                        <td className="px-4 py-3"><WinnerBadge winner={c.closer_system} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Methodology note */}
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-4 text-xs text-zinc-600">
              <strong className="text-zinc-500">How to read this dashboard:</strong>{' '}
              All scores are on a 0-10 scale. The human score is the ground truth.
              We compare how close each AI system ({CI_NAME} and {ATS_NAME}) gets to the human score.
              Green highlights = that system is winning on that metric.
              When comparing the two systems, only candidates with both scores are used for a fair comparison.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
