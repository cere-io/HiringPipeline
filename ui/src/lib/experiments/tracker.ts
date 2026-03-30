import type { ExperimentRun } from '../compound-intelligence/types';
import type { CIStorage } from '../compound-intelligence/storage/interface';

function aiRecommendation(score: number): ExperimentRun['ai_recommendation'] {
  if (score >= 80) return 'strong_yes';
  if (score >= 65) return 'yes';
  if (score >= 45) return 'maybe';
  return 'no';
}

export class ExperimentTracker {
  constructor(private storage: CIStorage) {}

  async recordRun(opts: {
    schemaId: string;
    subjectId: string;
    adapterSource: string;
    aiScore: number;
    externalScore?: number;
    humanDecision?: 'hired' | 'rejected' | 'pending';
  }): Promise<ExperimentRun> {
    const rec = aiRecommendation(opts.aiScore);
    let correct: boolean | null = null;

    if (opts.humanDecision && opts.humanDecision !== 'pending') {
      const aiSaysYes = rec === 'strong_yes' || rec === 'yes';
      const humanSaysYes = opts.humanDecision === 'hired';
      correct = aiSaysYes === humanSaysYes;
    }

    const run: ExperimentRun = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      schema_id: opts.schemaId,
      subject_id: opts.subjectId,
      adapter_source: opts.adapterSource,
      ai_score: opts.aiScore,
      external_score: opts.externalScore ?? null,
      human_decision: opts.humanDecision || 'pending',
      ai_recommendation: rec,
      correlation_correct: correct,
      created_at: new Date().toISOString(),
    };

    await this.storage.saveExperiment(run);
    return run;
  }

  async getCorrelationStats(schemaId: string): Promise<{
    total: number;
    agreed: number;
    disagreed: number;
    pending: number;
    agreement_rate: number;
    avg_ai_score_hired: number;
    avg_ai_score_rejected: number;
  }> {
    const experiments = await this.storage.listExperiments(schemaId);
    const decided = experiments.filter(e => e.human_decision !== 'pending');
    const agreed = decided.filter(e => e.correlation_correct === true).length;
    const disagreed = decided.filter(e => e.correlation_correct === false).length;
    const pending = experiments.filter(e => e.human_decision === 'pending').length;

    const hired = decided.filter(e => e.human_decision === 'hired');
    const rejected = decided.filter(e => e.human_decision === 'rejected');

    const avgAiHired = hired.length > 0
      ? parseFloat((hired.reduce((s, e) => s + e.ai_score, 0) / hired.length).toFixed(1))
      : 0;
    const avgAiRejected = rejected.length > 0
      ? parseFloat((rejected.reduce((s, e) => s + e.ai_score, 0) / rejected.length).toFixed(1))
      : 0;

    return {
      total: experiments.length,
      agreed,
      disagreed,
      pending,
      agreement_rate: decided.length > 0 ? parseFloat((agreed / decided.length).toFixed(3)) : 0,
      avg_ai_score_hired: avgAiHired,
      avg_ai_score_rejected: avgAiRejected,
    };
  }
}
