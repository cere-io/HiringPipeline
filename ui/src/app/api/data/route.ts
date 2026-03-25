import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface DimValueStats {
    value: string;
    total: number;
    winner_count: number;
    reject_count: number;
    avg_outcome: number;
    lift: number;
    winner_rate: number;
    reject_rate: number;
    differential: number;
}

interface DimStats {
    key: string;
    group: string;
    type: 'boolean' | 'category';
    values: DimValueStats[];
}

type CandResult = 'winner' | 'rejected' | 'pending';
type DecidedCandidate = { dims: Record<string, string | boolean>; outcome: number | null; result: CandResult };

function computeDimensionStats(traits: Record<string, any>, outcomes: Record<string, any>, statuses: Record<string, any>): { stats: DimStats[]; decided: DecidedCandidate[]; totalWinners: number; totalRejects: number; overallWinnerRate: number } {
    const candidates: DecidedCandidate[] = [];
    for (const [key, t] of Object.entries(traits)) {
        if (!t?.dimensions) continue;
        const cid = key.replace(/^\//, '');
        const o = outcomes[`/${cid}`];
        const st = statuses[`/${cid}`];
        let result: CandResult = 'pending';
        if (st?.stage === 'rejected') result = 'rejected';
        else if (st?.stage === 'hired' || st?.stage === 'performance_review') result = 'winner';
        else if (o?.outcome != null && o.outcome >= 7) result = 'winner';
        else if (o?.outcome != null && o.outcome < 5) result = 'rejected';
        candidates.push({ dims: t.dimensions, outcome: o?.outcome ?? null, result });
    }

    const decided = candidates.filter(c => c.result !== 'pending');
    if (decided.length === 0) return { stats: [], decided: [], totalWinners: 0, totalRejects: 0, overallWinnerRate: 0 };

    const totalWinners = decided.filter(c => c.result === 'winner').length;
    const totalRejects = decided.filter(c => c.result === 'rejected').length;
    const overallWinnerRate = decided.length > 0 ? totalWinners / decided.length : 0;

    const dimKeys = new Set<string>();
    for (const c of candidates) {
        for (const k of Object.keys(c.dims)) dimKeys.add(k);
    }

    const groupMap: Record<string, string> = {
        education_level: 'education', school_tier: 'education', school_geography: 'education',
        field_of_study: 'education', schools_bucket: 'education',
        yoe_bucket: 'experience', has_startup: 'experience', has_growth_stage: 'experience',
        has_bigtech: 'experience', career_trajectory: 'career', company_tier: 'experience',
        primary_tech_domain: 'technical', has_open_source: 'projects', has_hackathons: 'projects',
        has_hard_things: 'projects', hard_things_bucket: 'projects',
    };

    const redundantKeys = new Set([
        'schools_bucket',
        'has_bigtech',
        'has_hard_things',
        'has_growth_stage',
    ]);

    const stats: DimStats[] = [];

    for (const dimKey of dimKeys) {
        if (dimKey.startsWith('lang_')) continue;
        if (redundantKeys.has(dimKey)) continue;

        const valueMap = new Map<string, { total: number; outcomes: number[]; winners: number; rejects: number }>();
        for (const c of decided) {
            const raw = c.dims[dimKey];
            if (raw === undefined || raw === null) continue;
            const val = String(raw);
            if (!valueMap.has(val)) valueMap.set(val, { total: 0, outcomes: [], winners: 0, rejects: 0 });
            const entry = valueMap.get(val)!;
            entry.total++;
            if (c.outcome != null) entry.outcomes.push(c.outcome);
            if (c.result === 'winner') entry.winners++;
            if (c.result === 'rejected') entry.rejects++;
        }

        const isBool = [...valueMap.keys()].every(v => v === 'true' || v === 'false');

        const values: DimValueStats[] = [...valueMap.entries()].map(([val, d]) => {
            const avgOutcome = d.outcomes.length > 0
                ? parseFloat((d.outcomes.reduce((a, b) => a + b, 0) / d.outcomes.length).toFixed(1))
                : 0;
            const winnerRate = totalWinners > 0 ? d.winners / totalWinners : 0;
            const rejectRate = totalRejects > 0 ? d.rejects / totalRejects : 0;
            const localWinRate = d.total > 0 ? d.winners / d.total : 0;
            return {
                value: val,
                total: d.total,
                winner_count: d.winners,
                reject_count: d.rejects,
                avg_outcome: avgOutcome,
                lift: overallWinnerRate > 0 ? parseFloat((localWinRate / overallWinnerRate).toFixed(2)) : 0,
                winner_rate: parseFloat(winnerRate.toFixed(2)),
                reject_rate: parseFloat(rejectRate.toFixed(2)),
                differential: parseFloat((winnerRate - rejectRate).toFixed(2)),
            };
        }).sort((a, b) => b.differential - a.differential);

        stats.push({
            key: dimKey,
            group: groupMap[dimKey] || (dimKey.startsWith('lang_') ? 'technical' : 'other'),
            type: isBool ? 'boolean' : 'category',
            values,
        });
    }

    const langDims = [...dimKeys].filter(k => k.startsWith('lang_'));
    if (langDims.length > 0) {
        const langValues: DimValueStats[] = langDims.map(lk => {
            const langName = lk.replace('lang_', '').replace(/_/g, ' ');
            const matching = decided.filter(c => c.dims[lk] === true);
            const outs = matching.filter(c => c.outcome != null).map(c => c.outcome!);
            const avgOutcome = outs.length > 0 ? parseFloat((outs.reduce((a, b) => a + b, 0) / outs.length).toFixed(1)) : 0;
            const winners = matching.filter(c => c.result === 'winner').length;
            const rejects = matching.filter(c => c.result === 'rejected').length;
            const localWinRate = matching.length > 0 ? winners / matching.length : 0;
            const wr = totalWinners > 0 ? winners / totalWinners : 0;
            const rr = totalRejects > 0 ? rejects / totalRejects : 0;
            return {
                value: langName,
                total: matching.length,
                winner_count: winners,
                reject_count: rejects,
                avg_outcome: avgOutcome,
                lift: overallWinnerRate > 0 ? parseFloat((localWinRate / overallWinnerRate).toFixed(2)) : 0,
                winner_rate: parseFloat(wr.toFixed(2)),
                reject_rate: parseFloat(rr.toFixed(2)),
                differential: parseFloat((wr - rr).toFixed(2)),
            };
        }).filter(v => v.total > 0).sort((a, b) => b.differential - a.differential);

        if (langValues.length > 0) {
            stats.push({ key: 'languages', group: 'technical', type: 'category', values: langValues });
        }
    }

    const sorted = stats.sort((a, b) => {
        const groupOrder = ['education', 'experience', 'career', 'technical', 'projects', 'other'];
        return groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
    });
    return { stats: sorted, decided, totalWinners, totalRejects, overallWinnerRate };
}

interface MergeGroup {
    label: string;
    human_label: string;
    group: string;
    members: Array<{ key: string; value: string }>;
}

let cachedMergeGroups: MergeGroup[] | null = null;
let mergeGroupsCacheKey = '';

async function discoverMergeGroups(stats: DimStats[]): Promise<MergeGroup[]> {
    const allTraits: string[] = [];
    for (const dim of stats) {
        for (const v of dim.values) {
            if (v.total === 0) continue;
            allTraits.push(`${dim.key}::${v.value} (group: ${dim.group})`);
        }
    }

    const cacheKey = allTraits.sort().join('|');
    if (cachedMergeGroups && mergeGroupsCacheKey === cacheKey) {
        return cachedMergeGroups;
    }

    if (allTraits.length < 4) return [];

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return [];

    try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'gemini-2.5-flash',
                messages: [
                    { role: 'system', content: `You consolidate hiring trait dimensions. Given a list of trait key::value pairs, identify groups of 2+ traits that are semantically equivalent or describe the same underlying candidate characteristic.

For example: "education_level::None" and "school_tier::unknown" both mean "no identifiable formal education" and should be merged.
But "school_tier::tier_1" and "education_level::Masters" are different (school prestige vs degree level) and should NOT be merged.

Return ONLY a JSON array. No markdown.
[
  {
    "label": "<short_snake_case_id>",
    "human_label": "<clear human-readable description of the merged trait>",
    "group": "<education|experience|career|technical|projects>",
    "members": [{"key": "<dim_key>", "value": "<dim_value>"}, ...]
  }
]

Only merge traits that truly mean the same thing. Return an empty array [] if nothing should be merged.` },
                    { role: 'user', content: `Traits to analyze:\n${allTraits.join('\n')}` }
                ],
                temperature: 0
            })
        });

        if (!res.ok) return [];
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || '';
        const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) return [];

        const groups: MergeGroup[] = parsed.filter((g: any) =>
            g.label && g.human_label && g.group && Array.isArray(g.members) && g.members.length >= 2
        );

        cachedMergeGroups = groups;
        mergeGroupsCacheKey = cacheKey;
        return groups;
    } catch {
        return [];
    }
}

function applyMergeGroups(
    stats: DimStats[],
    mergeGroups: MergeGroup[],
    decided: Array<{ dims: Record<string, string | boolean>; outcome: number | null; result: 'winner' | 'rejected' | 'pending' }>,
    totalWinners: number,
    totalRejects: number,
    overallWinnerRate: number
): DimStats[] {
    if (mergeGroups.length === 0) return stats;

    const absorbed = new Set<string>();

    for (const mg of mergeGroups) {
        let foundAny = false;
        for (const m of mg.members) {
            const dimStat = stats.find(s => s.key === m.key);
            if (!dimStat) continue;
            const valStat = dimStat.values.find(v => v.value === m.value);
            if (valStat && valStat.total > 0) foundAny = true;
            absorbed.add(`${m.key}::${m.value}`);
        }
        if (!foundAny) continue;

        const matching = decided.filter(c =>
            mg.members.some(m => { const raw = c.dims[m.key]; return raw !== undefined && String(raw) === m.value; })
        );
        if (matching.length === 0) continue;

        const outs = matching.filter(c => c.outcome != null).map(c => c.outcome!);
        const winners = matching.filter(c => c.result === 'winner').length;
        const rejects = matching.filter(c => c.result === 'rejected').length;
        const avgOutcome = outs.length > 0 ? parseFloat((outs.reduce((a, b) => a + b, 0) / outs.length).toFixed(1)) : 0;
        const localWinRate = matching.length > 0 ? winners / matching.length : 0;

        const merged: DimValueStats = {
            value: mg.human_label || mg.label,
            total: matching.length,
            winner_count: winners,
            reject_count: rejects,
            avg_outcome: avgOutcome,
            lift: overallWinnerRate > 0 ? parseFloat((localWinRate / overallWinnerRate).toFixed(2)) : 0,
            winner_rate: totalWinners > 0 ? parseFloat((winners / totalWinners).toFixed(2)) : 0,
            reject_rate: totalRejects > 0 ? parseFloat((rejects / totalRejects).toFixed(2)) : 0,
            differential: parseFloat(((totalWinners > 0 ? winners / totalWinners : 0) - (totalRejects > 0 ? rejects / totalRejects : 0)).toFixed(2)),
        };

        const existing = stats.find(s => s.key === `merged_${mg.group}`);
        if (existing) { existing.values.push(merged); }
        else { stats.push({ key: `merged_${mg.group}`, group: mg.group, type: 'category', values: [merged] }); }
    }

    for (const s of stats) {
        if (s.key.startsWith('merged_')) continue;
        s.values = s.values.filter(v => !absorbed.has(`${s.key}::${v.value}`));
    }

    return stats.filter(s => s.values.length > 0);
}

interface RadarAxis {
    key: string;
    label: string;
    winner_score: number;
    reject_score: number;
    all_score: number;
}

interface DualRadar {
    profile_dna: RadarAxis[];
    startup_fit: RadarAxis[];
}

const PROFILE_DNA_KEYS = ['education', 'company_caliber', 'career_arc', 'technical_depth', 'proof_of_work', 'public_signal'] as const;
const STARTUP_FIT_KEYS = ['action_speed', 'autonomy', 'judgment', 'communication', 'coachability', 'drive_grit'] as const;
const PROFILE_DNA_LABELS: Record<string, string> = { education: 'Education', company_caliber: 'Company Caliber', career_arc: 'Career Arc', technical_depth: 'Technical Depth', proof_of_work: 'Proof of Work', public_signal: 'Public Signal' };
const STARTUP_FIT_LABELS: Record<string, string> = { action_speed: 'Action & Speed', autonomy: 'Autonomy', judgment: 'Judgment', communication: 'Communication', coachability: 'Coachability', drive_grit: 'Drive & Grit' };

function computeDualRadar(traits: Record<string, any>, interviews: Record<string, any>, statuses: Record<string, any>, outcomes: Record<string, any>): DualRadar {
    type CandResult = 'winner' | 'rejected' | 'pending';
    const candidates: Array<{ cid: string; profileDna: Record<string, number> | null; startupFit: Record<string, number> | null; result: CandResult }> = [];

    for (const [key, t] of Object.entries(traits)) {
        const cid = key.replace(/^\//, '');
        const st = statuses[`/${cid}`];
        const o = outcomes[`/${cid}`];
        let result: CandResult = 'pending';
        if (st?.stage === 'rejected') result = 'rejected';
        else if (st?.stage === 'hired' || st?.stage === 'performance_review') result = 'winner';
        else if (o?.outcome != null && o.outcome >= 7) result = 'winner';
        else if (o?.outcome != null && o.outcome < 5) result = 'rejected';

        const iv = interviews[`/${cid}`];
        candidates.push({
            cid,
            profileDna: t?.profile_dna || null,
            startupFit: iv?.analysis?.startup_fit || iv?.startup_fit || null,
            result,
        });
    }

    function computeAxes(keys: readonly string[], labels: Record<string, string>, getter: (c: typeof candidates[0]) => Record<string, number> | null): RadarAxis[] {
        return keys.map(k => {
            const vals = { winner: [] as number[], rejected: [] as number[], all: [] as number[] };
            for (const c of candidates) {
                const src = getter(c);
                if (!src || typeof src[k] !== 'number') continue;
                vals.all.push(src[k]);
                if (c.result === 'winner') vals.winner.push(src[k]);
                if (c.result === 'rejected') vals.rejected.push(src[k]);
            }
            const avg = (arr: number[]) => arr.length > 0 ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : 0;
            return { key: k, label: labels[k] || k, winner_score: avg(vals.winner), reject_score: avg(vals.rejected), all_score: avg(vals.all) };
        });
    }

    return {
        profile_dna: computeAxes(PROFILE_DNA_KEYS, PROFILE_DNA_LABELS, c => c.profileDna),
        startup_fit: computeAxes(STARTUP_FIT_KEYS, STARTUP_FIT_LABELS, c => c.startupFit),
    };
}

export async function GET() {
    // Try cubbies first (works locally), fall back to Supabase (works on Vercel)
    let traits: Record<string, any> = {};
    let scores: Record<string, any> = {};
    let outcomes: Record<string, any> = {};
    let interviews: Record<string, any> = {};
    let meta: Record<string, any> = {};
    let signals: Record<string, any> = {};
    let statuses: Record<string, any> = {};

    try {
        const { mockCubbies } = await import('@/lib/runtime');
        const [ct, cs, co, ci, cm, csi, cst] = await Promise.all([
            mockCubbies['hiring-traits']?.getAll(),
            mockCubbies['hiring-scores']?.getAll(),
            mockCubbies['hiring-outcomes']?.getAll(),
            mockCubbies['hiring-interviews']?.getAll(),
            mockCubbies['hiring-meta']?.getAll(),
            mockCubbies['hiring-signals']?.getAll(),
            mockCubbies['hiring-status']?.getAll(),
        ]);
        traits = ct || {};
        scores = cs || {};
        outcomes = co || {};
        interviews = ci || {};
        meta = cm || {};
        signals = csi || {};
        statuses = cst || {};
    } catch {}

    const cubbyEmpty = !traits || Object.keys(traits).length === 0;

    if (cubbyEmpty) {
        try {
            const [dbTraits, dbScores, dbOutcomes, dbInterviews, dbEvents, dbWeights] = await Promise.all([
                supabase.from('candidate_traits').select('*'),
                supabase.from('candidate_scores').select('*'),
                supabase.from('candidate_outcomes').select('*'),
                supabase.from('interview_analyses').select('*'),
                supabase.from('pipeline_events').select('candidate_id, event_type, payload, created_at')
                    .in('event_type', ['NEW_APPLICATION', 'STAGE_CHANGE', 'SIGNALS_INDEXED'])
                    .order('created_at', { ascending: true }),
                supabase.from('role_weights').select('*'),
            ]);

            if (dbTraits.data && dbTraits.data.length > 0) {
                traits = {};
                for (const row of dbTraits.data) {
                    // Compute profile_dna on-the-fly if missing (Join-synced candidates)
                    if (!row.profile_dna && row.skills) {
                        const yoe = row.years_of_experience || 0;
                        row.profile_dna = {
                            education: Math.min(10, Math.max(0, row.schools?.rating || 0)),
                            company_caliber: Math.min(10, Math.max(0, row.company_signals?.rating || 0)),
                            career_arc: Math.min(10, Math.max(0, Math.round(yoe * 0.8))),
                            technical_depth: Math.min(10, Math.max(0, Math.round((row.skills?.length || 0) * 0.4))),
                            proof_of_work: Math.min(10, Math.max(0, row.hard_things_done?.rating || 0)),
                            public_signal: Math.min(10, Math.max(0, row.open_source_contributions?.rating || 0)),
                        };
                    }
                    if (!row.dimensions || Object.keys(row.dimensions).length === 0) {
                        const yoe = row.years_of_experience || 0;
                        const stages = row.company_stages || [];
                        row.dimensions = {
                            education_level: row.education_level || 'None',
                            yoe_bucket: yoe <= 2 ? '0-2' : yoe <= 5 ? '3-5' : yoe <= 10 ? '6-10' : '10+',
                            has_startup: stages.includes('startup'),
                            has_growth_stage: stages.includes('growth') || stages.includes('series_b'),
                            has_open_source: (row.open_source_contributions?.items?.length || 0) > 0,
                            has_hackathons: (row.hackathons?.items?.length || 0) > 0,
                            has_hard_things: (row.hard_things_done?.rating || 0) >= 6,
                            hard_things_bucket: (row.hard_things_done?.rating || 0) >= 7 ? 'high' : (row.hard_things_done?.rating || 0) >= 4 ? 'mid' : 'low',
                            schools_bucket: (row.schools?.rating || 0) >= 7 ? 'high' : (row.schools?.rating || 0) >= 4 ? 'mid' : 'low',
                        };
                    }
                    traits[`/${row.candidate_id}`] = row;
                }
            }
            if (dbScores.data && dbScores.data.length > 0) {
                scores = {};
                for (const row of dbScores.data) {
                    scores[`/${row.candidate_id}`] = { id: row.candidate_id, composite_score: row.composite_score, reasoning: row.reasoning, weights_used: row.weights_used, timestamp: row.scored_at };
                }
            }
            if (dbOutcomes.data && dbOutcomes.data.length > 0) {
                outcomes = {};
                for (const row of dbOutcomes.data) {
                    outcomes[`/${row.candidate_id}`] = row;
                }
            }
            if (dbInterviews.data && dbInterviews.data.length > 0) {
                interviews = {};
                for (const row of dbInterviews.data) {
                    interviews[`/${row.candidate_id}`] = row;
                }
            }

            // Reconstruct statuses from pipeline_events
            if (dbEvents.data && dbEvents.data.length > 0) {
                statuses = {};
                for (const evt of dbEvents.data) {
                    if (!evt.candidate_id) continue;
                    const key = `/${evt.candidate_id}`;
                    if (evt.event_type === 'NEW_APPLICATION') {
                        statuses[key] = {
                            candidate_id: evt.candidate_id,
                            role: evt.payload?.role || '',
                            stage: 'ai_scored',
                            created_at: evt.created_at,
                            updated_at: evt.created_at,
                        };
                    }
                    if (evt.event_type === 'STAGE_CHANGE' && statuses[key]) {
                        statuses[key].stage = evt.payload?.newStage || statuses[key].stage;
                        statuses[key].updated_at = evt.created_at;
                        if (evt.payload?.newStage === 'rejected') {
                            statuses[key].rejected_at_stage = evt.payload?.previousStage;
                            statuses[key].rejection_reasons = evt.payload?.reasons;
                        }
                    }
                }
            }

            // Reconstruct signals from SIGNALS_INDEXED events
            if (dbEvents.data) {
                const sigEvents = dbEvents.data.filter((e: any) => e.event_type === 'SIGNALS_INDEXED');
                if (sigEvents.length > 0 && Object.keys(signals).length === 0) {
                    signals = {};
                    for (const evt of sigEvents) {
                        const reasons = evt.payload?.reasons || [];
                        const outcome = evt.payload?.outcome || 5;
                        const cid = evt.candidate_id;
                        for (const reason of reasons) {
                            const sigId = reason.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60);
                            if (signals[sigId]) {
                                signals[sigId].occurrence_count += 1;
                                signals[sigId].strength = Math.min(1, signals[sigId].strength + 0.1);
                                if (!signals[sigId].candidate_ids.includes(cid)) signals[sigId].candidate_ids.push(cid);
                                signals[sigId].outcome_entries.push({ candidate_id: cid, outcome, timestamp: evt.created_at });
                                signals[sigId].avg_outcome = signals[sigId].outcome_entries.reduce((s: number, e: any) => s + e.outcome, 0) / signals[sigId].outcome_entries.length;
                                signals[sigId].last_seen = evt.created_at;
                            } else {
                                signals[sigId] = {
                                    id: sigId, signal: reason, category: 'hard_things_done',
                                    direction: outcome >= 7 ? 'positive' : 'negative',
                                    strength: 0.5, occurrence_count: 1,
                                    candidate_ids: [cid],
                                    avg_outcome: outcome,
                                    outcome_entries: [{ candidate_id: cid, outcome, timestamp: evt.created_at }],
                                    first_seen: evt.created_at, last_seen: evt.created_at,
                                };
                            }
                        }
                    }
                }
            }

            // Load role weights into meta
            if (dbWeights.data && dbWeights.data.length > 0) {
                meta = meta || {};
                for (const row of dbWeights.data) {
                    const { role: roleName, updated_at, ...weights } = row;
                    meta[`/trait_weights/${roleName}`] = weights;
                }
            }
        } catch (e: any) {
            console.error('[data] Supabase fallback error:', e.message);
        }
    }

    const signalCorrelations: Record<string, { avg_ai_score: number; avg_human_score: number; candidate_count: number }> = {};
    if (signals && scores && outcomes) {
        for (const [key, sig] of Object.entries(signals) as [string, any][]) {
            const cids: string[] = sig.candidate_ids || [];
            if (cids.length === 0) continue;
            let aiTotal = 0, aiCount = 0, humanTotal = 0, humanCount = 0;
            for (const cid of cids) {
                const s = scores[`/${cid}`];
                const o = outcomes[`/${cid}`];
                if (s?.composite_score != null) { aiTotal += s.composite_score; aiCount++; }
                if (o?.outcome != null) { humanTotal += o.outcome; humanCount++; }
            }
            signalCorrelations[key] = {
                avg_ai_score: aiCount > 0 ? parseFloat((aiTotal / aiCount).toFixed(1)) : 0,
                avg_human_score: humanCount > 0 ? parseFloat((humanTotal / humanCount).toFixed(1)) : 0,
                candidate_count: cids.length,
            };
        }
    }

    const { stats: rawDimStats, decided, totalWinners, totalRejects, overallWinnerRate } = computeDimensionStats(traits || {}, outcomes || {}, statuses || {});

    let dimensionStats = rawDimStats;
    if (rawDimStats.length > 0) {
        const mergeGroups = await discoverMergeGroups(rawDimStats);
        if (mergeGroups.length > 0) {
            dimensionStats = applyMergeGroups([...rawDimStats.map(s => ({ ...s, values: [...s.values] }))], mergeGroups, decided, totalWinners, totalRejects, overallWinnerRate);
        }
    }

    const compoundPatterns = meta?.['/compound_patterns'] || [];
    const dualRadar = computeDualRadar(traits || {}, interviews || {}, statuses || {}, outcomes || {});

    return NextResponse.json({ traits, scores, outcomes, interviews, meta, signals, signalCorrelations, dimensionStats, compoundPatterns, statuses, dualRadar });
}
