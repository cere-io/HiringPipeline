import { NextResponse } from 'next/server';
import { getCI, getExperimentTracker } from '@/lib/compound-intelligence/runtime';

export async function GET(req: Request) {
  try {
    const ci = getCI();
    const tracker = getExperimentTracker();
    const url = new URL(req.url);
    const schemaId = url.searchParams.get('schema_id');

    if (!schemaId) {
      return NextResponse.json({ success: false, error: 'Missing schema_id query param' }, { status: 400 });
    }

    const schema = await ci.schemas.get(schemaId);
    if (!schema) {
      return NextResponse.json({ success: false, error: `Schema "${schemaId}" not found` }, { status: 404 });
    }

    const [analytics, experimentStats, patterns] = await Promise.all([
      ci.getAnalytics(schemaId),
      tracker.getCorrelationStats(schemaId),
      ci.getPatterns(schemaId),
    ]);

    const subjectsList = analytics.scores.map(s => {
      const trait = analytics.traits.find(t => t.subject_id === s.subject_id);
      const analysis = analytics.analyses.find(a => a.subject_id === s.subject_id);
      const outcome = Object.values(analytics.outcomes).find((o: any) => o.subject_id === s.subject_id || o.candidate_id === s.subject_id);
      const status = trait?.subject_meta?.notionStatus || '';
      const lower = status.toLowerCase();
      let result: 'winner' | 'rejected' | 'pending' = 'pending';
      if (lower.includes('hired') || lower.includes('offer')) result = 'winner';
      if (lower.includes('reject') || lower.includes('archived') || lower.includes('declined') || lower.includes('company rejected')) result = 'rejected';

      return {
        subject_id: s.subject_id,
        name: trait?.subject_name || s.subject_id,
        role: s.role,
        score: s.composite_score,
        reasoning: s.reasoning,
        status,
        result,
        profile_scores: trait?.profile_scores || null,
        traits: trait?.traits || null,
        soft_skills: analysis?.scores || null,
        soft_summary: analysis?.summary || null,
        soft_flags: analysis?.flags || null,
        human_score: (outcome as any)?.outcome || null,
        human_feedback: (outcome as any)?.feedback || null,
        reviewed: !!(outcome as any)?.outcome,
      };
    });

    const hasWinners = subjectsList.some(s => s.result === 'winner');
    const hasRejects = subjectsList.some(s => s.result === 'rejected');

    // Profile DNA radar
    const radarAxes: Record<string, { winner: number[]; reject: number[]; pending: number[]; all: number[] }> = {};
    for (const sub of subjectsList) {
      if (!sub.profile_scores) continue;
      for (const [axis, val] of Object.entries(sub.profile_scores)) {
        if (!radarAxes[axis]) radarAxes[axis] = { winner: [], reject: [], pending: [], all: [] };
        radarAxes[axis].all.push(val * 10);
        if (sub.result === 'winner') radarAxes[axis].winner.push(val * 10);
        else if (sub.result === 'rejected') radarAxes[axis].reject.push(val * 10);
        else radarAxes[axis].pending.push(val * 10);
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : 0;

    const radar = Object.entries(radarAxes).map(([axis, data]) => ({
      axis: axis.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      winner_avg: hasWinners ? avg(data.winner) : 0,
      reject_avg: hasRejects ? avg(data.reject) : 0,
      pending_avg: avg(data.pending),
      all_avg: avg(data.all),
    }));

    // Soft skills radar (from transcript analyses)
    const softAxes: Record<string, number[]> = {};
    for (const sub of subjectsList) {
      if (!sub.soft_skills) continue;
      for (const [k, v] of Object.entries(sub.soft_skills)) {
        if (!softAxes[k]) softAxes[k] = [];
        softAxes[k].push((v as number) * 10);
      }
    }
    const softRadar = Object.entries(softAxes).map(([axis, vals]) => ({
      axis: axis.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      winner_avg: avg(vals),
      reject_avg: 0,
      pending_avg: 0,
      all_avg: avg(vals),
    }));

    return NextResponse.json({
      success: true,
      schema,
      subjects: subjectsList,
      radar,
      soft_radar: softRadar,
      has_winners: hasWinners,
      has_rejects: hasRejects,
      weights: analytics.weights,
      signals: analytics.signals,
      sourcingStats: analytics.sourcingStats,
      patterns,
      experiments: experimentStats,
      counts: {
        total: subjectsList.length,
        winners: subjectsList.filter(s => s.result === 'winner').length,
        rejects: subjectsList.filter(s => s.result === 'rejected').length,
        pending: subjectsList.filter(s => s.result === 'pending').length,
        reviewed: subjectsList.filter(s => s.reviewed).length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
