import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/compound-intelligence/runtime';

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : parseFloat((num / den).toFixed(4));
}

function mae(predicted: number[], actual: number[]): number {
  const n = predicted.length;
  if (n === 0) return 0;
  return parseFloat((predicted.reduce((s, v, i) => s + Math.abs(v - actual[i]), 0) / n).toFixed(3));
}

function rmse(predicted: number[], actual: number[]): number {
  const n = predicted.length;
  if (n === 0) return 0;
  return parseFloat(Math.sqrt(predicted.reduce((s, v, i) => s + (v - actual[i]) ** 2, 0) / n).toFixed(3));
}

function avgSignedError(predicted: number[], actual: number[]): number {
  const n = predicted.length;
  if (n === 0) return 0;
  return parseFloat((predicted.reduce((s, v, i) => s + (v - actual[i]), 0) / n).toFixed(3));
}

function agreementRate(predicted: number[], actual: number[], threshold: number): number {
  const n = predicted.length;
  if (n === 0) return 0;
  const agreed = predicted.filter((v, i) => Math.abs(v - actual[i]) <= threshold).length;
  return parseFloat((agreed / n).toFixed(4));
}

export async function GET(req: Request) {
  try {
    const storage = getStorage();
    const url = new URL(req.url);
    const schemaId = url.searchParams.get('schema_id');

    if (!schemaId) {
      return NextResponse.json({ success: false, error: 'Missing schema_id query param' }, { status: 400 });
    }

    const [allTraits, allScores] = await Promise.all([
      storage.listTraits(schemaId),
      storage.listScores(schemaId),
    ]);

    const scoreMap = new Map(allScores.map(s => [s.subject_id, s]));

    const candidates: Array<{
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
    }> = [];

    for (const trait of allTraits) {
      const humanScore = trait.subject_meta?.humanScore;
      if (humanScore == null || humanScore <= 0) continue;

      const score = scoreMap.get(trait.subject_id);
      if (!score) continue;

      const systemScore = score.composite_score;
      const atsScore: number | null = trait.subject_meta?.aiScore ?? null;
      const systemDelta = systemScore - humanScore;
      const atsDelta = atsScore != null ? atsScore - humanScore : null;

      let closer: 'system' | 'ats' | 'tie' | 'system_only' = 'system_only';
      if (atsScore != null) {
        const sAbs = Math.abs(systemDelta);
        const aAbs = Math.abs(atsDelta!);
        if (Math.abs(sAbs - aAbs) < 0.05) closer = 'tie';
        else if (sAbs < aAbs) closer = 'system';
        else closer = 'ats';
      }

      candidates.push({
        subject_id: trait.subject_id,
        name: trait.subject_name || trait.subject_id,
        role: score.role,
        status: trait.subject_meta?.notionStatus || '',
        system_score: systemScore,
        ats_score: atsScore,
        human_score: humanScore,
        system_delta: parseFloat(systemDelta.toFixed(2)),
        ats_delta: atsDelta != null ? parseFloat(atsDelta.toFixed(2)) : null,
        closer_system: closer,
      });
    }

    candidates.sort((a, b) => b.human_score - a.human_score);

    const humanScores = candidates.map(c => c.human_score);
    const systemScores = candidates.map(c => c.system_score);

    const withAts = candidates.filter(c => c.ats_score != null);
    const atsScoresArr = withAts.map(c => c.ats_score!);
    const atsHumanArr = withAts.map(c => c.human_score);
    const atsSystemArr = withAts.map(c => c.system_score);

    const THRESHOLD = 1.0;

    const systemStats = {
      mae: mae(systemScores, humanScores),
      rmse: rmse(systemScores, humanScores),
      correlation: pearsonCorrelation(systemScores, humanScores),
      agreement_rate: agreementRate(systemScores, humanScores, THRESHOLD),
      avg_bias: avgSignedError(systemScores, humanScores),
      n: candidates.length,
    };

    const atsStats = {
      mae: withAts.length > 0 ? mae(atsScoresArr, atsHumanArr) : null,
      rmse: withAts.length > 0 ? rmse(atsScoresArr, atsHumanArr) : null,
      correlation: withAts.length > 0 ? pearsonCorrelation(atsScoresArr, atsHumanArr) : null,
      agreement_rate: withAts.length > 0 ? agreementRate(atsScoresArr, atsHumanArr, THRESHOLD) : null,
      avg_bias: withAts.length > 0 ? avgSignedError(atsScoresArr, atsHumanArr) : null,
      n: withAts.length,
    };

    // Also compute system stats on the ATS-overlapping subset for fair comparison
    const systemOnAtsSubset = {
      mae: withAts.length > 0 ? mae(atsSystemArr, atsHumanArr) : null,
      rmse: withAts.length > 0 ? rmse(atsSystemArr, atsHumanArr) : null,
      correlation: withAts.length > 0 ? pearsonCorrelation(atsSystemArr, atsHumanArr) : null,
      agreement_rate: withAts.length > 0 ? agreementRate(atsSystemArr, atsHumanArr, THRESHOLD) : null,
      avg_bias: withAts.length > 0 ? avgSignedError(atsSystemArr, atsHumanArr) : null,
    };

    const headToHead = {
      system_wins: candidates.filter(c => c.closer_system === 'system').length,
      ats_wins: candidates.filter(c => c.closer_system === 'ats').length,
      ties: candidates.filter(c => c.closer_system === 'tie').length,
      system_only: candidates.filter(c => c.closer_system === 'system_only').length,
    };

    return NextResponse.json({
      success: true,
      threshold: THRESHOLD,
      total_candidates: candidates.length,
      total_with_ats: withAts.length,
      system_stats: systemStats,
      ats_stats: atsStats,
      system_on_ats_subset: systemOnAtsSubset,
      head_to_head: headToHead,
      candidates,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
