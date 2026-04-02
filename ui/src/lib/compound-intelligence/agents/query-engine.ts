import type { GraphNode, GraphEdge, GraphQueryResult } from '../types';
import type { LLMProvider } from '../llm/interface';
import { extractJsonFromLLM } from '../llm/interface';
import type { CIStorage } from '../storage/interface';

/**
 * GraphQueryEngine — takes a natural language question about hiring data
 * and returns relevant graph nodes, edges, and a synthesized answer.
 *
 * Two modes:
 * 1. LLM-powered: converts NL → SQL, executes, then synthesizes answer
 * 2. Graph traversal: directly queries nodes/edges by type and relationship
 */
export class GraphQueryEngine {
  constructor(private llm: LLMProvider, private storage: CIStorage) {}

  async query(opts: {
    question: string;
    schemaId: string;
  }): Promise<GraphQueryResult> {
    const { question, schemaId } = opts;

    const { nodes, edges } = await this.storage.getGraphForSchema(schemaId);
    if (nodes.length === 0) {
      return {
        nodes: [],
        edges: [],
        answer: 'No data indexed yet. Run the indexer first to populate the knowledge graph.',
      };
    }

    const graphSummary = this._buildGraphSummary(nodes, edges);

    const systemPrompt = `You are a hiring intelligence query engine. You have access to a knowledge graph of candidates, skills, companies, traits, outcomes, and interview sessions.

GRAPH SUMMARY:
${graphSummary}

Given a natural language question, analyze the graph data and return a JSON response:
{
  "answer": "<concise, data-backed answer to the question>",
  "relevant_node_ids": ["<ids of nodes most relevant to the answer>"],
  "relevant_edge_ids": ["<ids of edges most relevant>"],
  "reasoning": "<brief explanation of how you derived the answer>"
}

Rules:
- Base answers on actual data, never hallucinate
- Include specific names, scores, and numbers
- If insufficient data, say so clearly
- Keep answers concise but specific

Return ONLY JSON. No markdown.`;

    const response = await this.llm.complete({
      system: systemPrompt,
      user: `Question: ${question}`,
      temperature: 0.2,
    });

    try {
      const parsed = extractJsonFromLLM(response.content);
      const relevantNodeIds = new Set(parsed.relevant_node_ids || []);
      const relevantEdgeIds = new Set(parsed.relevant_edge_ids || []);

      let matchedNodes = nodes.filter(n => relevantNodeIds.has(n.id));
      let matchedEdges = edges.filter(e => relevantEdgeIds.has(e.id));

      // If LLM didn't pick specific edges, find edges connecting matched nodes
      if (matchedEdges.length === 0 && matchedNodes.length > 0) {
        const nodeIdSet = new Set(matchedNodes.map(n => n.id));
        matchedEdges = edges.filter(e => nodeIdSet.has(e.source_id) || nodeIdSet.has(e.target_id));
      }

      // Always include neighbor nodes of matched edges for graph completeness
      const neighborIds = new Set<string>();
      for (const e of matchedEdges) {
        neighborIds.add(e.source_id);
        neighborIds.add(e.target_id);
      }
      const existingIds = new Set(matchedNodes.map(n => n.id));
      for (const nid of neighborIds) {
        if (!existingIds.has(nid)) {
          const neighbor = nodes.find(n => n.id === nid);
          if (neighbor) matchedNodes.push(neighbor);
        }
      }

      return {
        nodes: matchedNodes.slice(0, 50),
        edges: matchedEdges.slice(0, 100),
        answer: parsed.answer || 'No answer generated.',
        metadata: { reasoning: parsed.reasoning },
      };
    } catch {
      return this._fallbackQuery(question, nodes, edges);
    }
  }

  /**
   * Preset query execution — structured queries that don't need LLM interpretation.
   */
  async executePreset(opts: {
    presetId: string;
    schemaId: string;
    params?: Record<string, string>;
  }): Promise<GraphQueryResult> {
    const { presetId, schemaId } = opts;
    const { nodes, edges } = await this.storage.getGraphForSchema(schemaId);

    switch (presetId) {
      case 'tq-strongest-candidates':
        return this._queryStrongestCandidates(nodes, edges);
      case 'tq-startup-bigtech':
        return this._queryStartupBigTech(nodes, edges);
      case 'tq-role-fit':
        return this._queryStrongestCandidates(nodes, edges);
      case 'pi-winner-traits':
        return this._queryWinnerTraits(nodes, edges);
      case 'pi-reject-patterns':
        return this._queryRejectPatterns(nodes, edges);
      case 'pi-high-scorers':
        return this._queryHighScorers(nodes, edges);
      case 'ci-weight-shifts':
        return this._queryWeightEvolution(schemaId, nodes, edges);
      case 'ci-signal-strength':
        return this._queryStrongestSignals(schemaId, nodes, edges);
      case 'ci-learning-rate':
        return this._queryLearningVelocity(schemaId, nodes, edges);
      case 'cd-os-interview':
        return this._queryOSvInterview(nodes, edges);
      case 'cd-education-outcome':
        return this._queryEducationOutcome(nodes, edges);
      case 'cd-company-performance':
        return this._queryCompanyPerformance(nodes, edges);
      default:
        return this.query({ question: presetId, schemaId });
    }
  }

  private _queryStrongestCandidates(nodes: GraphNode[], edges: GraphEdge[]): GraphQueryResult {
    const candidates = nodes
      .filter(n => n.node_type === 'candidate' && n.properties.composite_score)
      .sort((a, b) => (b.properties.composite_score || 0) - (a.properties.composite_score || 0))
      .slice(0, 10);

    const candidateIds = new Set(candidates.map(c => c.id));
    const relEdges = edges.filter(e => candidateIds.has(e.source_id) || candidateIds.has(e.target_id));
    const neighborIds = new Set<string>();
    for (const e of relEdges) { neighborIds.add(e.source_id); neighborIds.add(e.target_id); }
    const allNodes = [...candidates, ...nodes.filter(n => neighborIds.has(n.id) && !candidateIds.has(n.id))];

    const top3 = candidates.slice(0, 3).map(c => `${c.label} (${c.properties.composite_score})`).join(', ');
    return {
      nodes: allNodes.slice(0, 50),
      edges: relEdges.slice(0, 100),
      answer: `Top candidates by score: ${top3}. ${candidates.length} candidates ranked.`,
    };
  }

  private _queryStartupBigTech(nodes: GraphNode[], edges: GraphEdge[]): GraphQueryResult {
    const companyNodes = nodes.filter(n => n.node_type === 'company');
    const candidateEdges = edges.filter(e => e.relationship === 'worked_at');
    const candidateCompanies = new Map<string, string[]>();
    for (const e of candidateEdges) {
      const companies = candidateCompanies.get(e.source_id) || [];
      const companyNode = companyNodes.find(n => n.id === e.target_id);
      if (companyNode) companies.push(companyNode.label);
      candidateCompanies.set(e.source_id, companies);
    }

    const matchedCandidateIds: string[] = [];
    for (const [cid, companies] of candidateCompanies) {
      const lower = companies.map(c => c.toLowerCase());
      const hasStartup = lower.some(c => c.includes('startup') || c.includes('seed') || c.includes('series'));
      const hasBigTech = lower.some(c => ['google', 'meta', 'amazon', 'apple', 'microsoft', 'netflix', 'stripe', 'uber'].some(bt => c.includes(bt)));
      if (hasStartup || hasBigTech) matchedCandidateIds.push(cid);
    }

    const matchedNodes = nodes.filter(n => matchedCandidateIds.includes(n.id) || n.node_type === 'company');
    const matchedEdges = edges.filter(e => matchedCandidateIds.includes(e.source_id) && e.relationship === 'worked_at');
    return {
      nodes: matchedNodes.slice(0, 50),
      edges: matchedEdges.slice(0, 100),
      answer: `Found ${matchedCandidateIds.length} candidates with startup or big tech experience.`,
    };
  }

  private _queryWinnerTraits(nodes: GraphNode[], edges: GraphEdge[]): GraphQueryResult {
    const winners = nodes.filter(n => n.node_type === 'candidate' && n.properties.status === 'hired');
    const winnerIds = new Set(winners.map(w => w.id));
    const traitEdges = edges.filter(e => winnerIds.has(e.source_id) && ['has_trait', 'has_skill', 'scored_on'].includes(e.relationship));
    const traitNodeIds = new Set(traitEdges.map(e => e.target_id));
    const traitNodes = nodes.filter(n => traitNodeIds.has(n.id));

    const traitCounts: Record<string, number> = {};
    for (const tn of traitNodes) {
      traitCounts[tn.label] = (traitCounts[tn.label] || 0) + 1;
    }
    const topTraits = Object.entries(traitCounts).sort(([, a], [, b]) => b - a).slice(0, 5);
    const answer = topTraits.length > 0
      ? `Common traits among ${winners.length} hired candidates: ${topTraits.map(([t, c]) => `${t} (${c}x)`).join(', ')}`
      : 'No hired candidates with traits data yet.';

    return {
      nodes: [...winners, ...traitNodes].slice(0, 50),
      edges: traitEdges.slice(0, 100),
      answer,
    };
  }

  private _queryRejectPatterns(nodes: GraphNode[], edges: GraphEdge[]): GraphQueryResult {
    const rejected = nodes.filter(n => n.node_type === 'candidate' && n.properties.status === 'rejected');
    const rejectedIds = new Set(rejected.map(r => r.id));
    const traitEdges = edges.filter(e => rejectedIds.has(e.source_id) && ['has_trait', 'has_skill'].includes(e.relationship));
    const traitNodeIds = new Set(traitEdges.map(e => e.target_id));
    const traitNodes = nodes.filter(n => traitNodeIds.has(n.id));

    const traitCounts: Record<string, number> = {};
    for (const tn of traitNodes) {
      traitCounts[tn.label] = (traitCounts[tn.label] || 0) + 1;
    }
    const topTraits = Object.entries(traitCounts).sort(([, a], [, b]) => b - a).slice(0, 5);
    return {
      nodes: [...rejected, ...traitNodes].slice(0, 50),
      edges: traitEdges.slice(0, 100),
      answer: topTraits.length > 0
        ? `Common patterns among ${rejected.length} rejected candidates: ${topTraits.map(([t, c]) => `${t} (${c}x)`).join(', ')}`
        : 'No rejected candidates with traits data yet.',
    };
  }

  private _queryHighScorers(nodes: GraphNode[], edges: GraphEdge[]): GraphQueryResult {
    const highScorers = nodes
      .filter(n => n.node_type === 'candidate' && (n.properties.composite_score || 0) >= 7)
      .sort((a, b) => (b.properties.composite_score || 0) - (a.properties.composite_score || 0));

    const hsIds = new Set(highScorers.map(h => h.id));
    const relEdges = edges.filter(e => hsIds.has(e.source_id));
    const neighborIds = new Set(relEdges.map(e => e.target_id));
    const neighbors = nodes.filter(n => neighborIds.has(n.id));

    return {
      nodes: [...highScorers, ...neighbors].slice(0, 50),
      edges: relEdges.slice(0, 100),
      answer: `${highScorers.length} candidates scored 7.0+/10. Average: ${highScorers.length > 0 ? (highScorers.reduce((s, n) => s + (n.properties.composite_score || 0), 0) / highScorers.length).toFixed(1) : 0}/10.`,
    };
  }

  private _queryOSvInterview(nodes: GraphNode[], edges: GraphEdge[]): GraphQueryResult {
    const candidates = nodes.filter(n => n.node_type === 'candidate');
    const osEdges = edges.filter(e => e.relationship === 'scored_on');
    const sessionEdges = edges.filter(e => e.relationship === 'interviewed_for');

    const withOS = new Set(osEdges.filter(e => {
      const target = nodes.find(n => n.id === e.target_id);
      return target?.properties.trait_key === 'open_source_contributions' && (target?.properties.rating || 0) >= 5;
    }).map(e => e.source_id));

    const withInterview = new Set(candidates.filter(c => c.properties.interview_scores).map(c => c.id));

    const both = candidates.filter(c => withOS.has(c.id) && withInterview.has(c.id));
    const osOnly = candidates.filter(c => withOS.has(c.id));

    return {
      nodes: [...both].slice(0, 50),
      edges: osEdges.slice(0, 100),
      answer: `${osOnly.length} candidates have strong open source contributions. ${both.length} of them also have interview data recorded.`,
    };
  }

  private async _queryWeightEvolution(schemaId: string, nodes: GraphNode[], edges: GraphEdge[]): Promise<GraphQueryResult> {
    const weights = await this.storage.listWeights(schemaId);
    const entries = Object.entries(weights);
    if (entries.length === 0) {
      return { nodes: [], edges: [], answer: 'No weight data yet. Add human feedback via the Distiller to start adjusting weights.' };
    }

    const lines: string[] = [];
    for (const [role, w] of entries) {
      const sorted = Object.entries(w).sort(([, a], [, b]) => b - a);
      const topTraits = sorted.slice(0, 5).map(([k, v]) => `${k.replace(/_/g, ' ')} (${(v * 100).toFixed(1)}%)`);
      lines.push(`${role === '__default__' ? 'Default' : role}: ${topTraits.join(', ')}`);
    }

    const candidates = nodes.filter(n => n.node_type === 'candidate');
    return {
      nodes: candidates.slice(0, 20),
      edges: edges.filter(e => e.relationship === 'scored_on').slice(0, 50),
      answer: `Weight distribution across ${entries.length} role(s):\n${lines.join('\n')}\n\nWeights shift as you add human feedback. More feedback = more accurate scoring.`,
    };
  }

  private async _queryStrongestSignals(schemaId: string, nodes: GraphNode[], edges: GraphEdge[]): Promise<GraphQueryResult> {
    const signals = await this.storage.getSignalCatalog(schemaId);
    const signalEntries = Object.values(signals);

    if (signalEntries.length === 0) {
      return { nodes: [], edges: [], answer: 'No signals indexed yet. Signals are created when you submit human feedback through the Distiller.' };
    }

    const sorted = signalEntries.sort((a, b) => b.strength - a.strength);
    const top = sorted.slice(0, 8);
    const lines = top.map(s =>
      `${s.signal} (${s.trait_key.replace(/_/g, ' ')}) — strength: ${s.strength.toFixed(2)}, seen ${s.occurrence_count}x, avg outcome: ${s.avg_outcome.toFixed(1)}`
    );

    const candidates = nodes.filter(n => n.node_type === 'candidate');
    return {
      nodes: candidates.slice(0, 20),
      edges: [],
      answer: `Top ${top.length} signals from ${signalEntries.length} total:\n${lines.join('\n')}`,
    };
  }

  private async _queryLearningVelocity(schemaId: string, nodes: GraphNode[], edges: GraphEdge[]): Promise<GraphQueryResult> {
    const [outcomes, signals, weights] = await Promise.all([
      this.storage.listOutcomes(schemaId),
      this.storage.getSignalCatalog(schemaId),
      this.storage.listWeights(schemaId),
    ]);

    const outcomeCount = Object.keys(outcomes).length;
    const signalCount = Object.keys(signals).length;
    const roleCount = Object.keys(weights).length;
    const candidates = nodes.filter(n => n.node_type === 'candidate');
    const withInterview = candidates.filter(c => c.properties.interview_scores);
    const withFeedback = candidates.filter(c => c.properties.feedback_text || c.properties.outcome_score != null);
    const evaluators = nodes.filter(n => n.node_type === 'evaluator');
    const evalEdges = edges.filter(e => e.relationship === 'evaluated_by');

    const answer = [
      `Learning Status:`,
      `  Outcomes recorded: ${outcomeCount}`,
      `  Signals indexed: ${signalCount}`,
      `  Interview analyses: ${withInterview.length}`,
      `  Candidates with feedback: ${withFeedback.length}`,
      `  Evaluators: ${evaluators.length}`,
      `  Evaluator reviews: ${evalEdges.length}`,
      `  Weight profiles: ${roleCount}`,
      ``,
      outcomeCount === 0
        ? 'The system has not received any human feedback yet. Submit feedback via the Candidates tab or add comments in Notion to start the learning loop.'
        : `The system is learning from ${outcomeCount} outcomes and ${evalEdges.length} evaluator reviews. Each new feedback adjusts weights and strengthens signals.`,
    ].join('\n');

    return {
      nodes: [...evaluators, ...withFeedback].slice(0, 30),
      edges: evalEdges.slice(0, 50),
      answer,
    };
  }

  private _queryEducationOutcome(nodes: GraphNode[], edges: GraphEdge[]): GraphQueryResult {
    const candidates = nodes.filter(n => n.node_type === 'candidate');
    const educationEdges = edges.filter(e => e.relationship === 'has_education');
    const eduNodes = nodes.filter(n => educationEdges.some(e => e.target_id === n.id));

    const byEdu: Record<string, { scores: number[]; count: number }> = {};
    for (const e of educationEdges) {
      const candidate = candidates.find(c => c.id === e.source_id);
      const edu = nodes.find(n => n.id === e.target_id);
      if (candidate && edu) {
        const label = edu.label;
        if (!byEdu[label]) byEdu[label] = { scores: [], count: 0 };
        byEdu[label].scores.push(candidate.properties.composite_score || 0);
        byEdu[label].count++;
      }
    }

    const lines = Object.entries(byEdu)
      .sort(([, a], [, b]) => (b.scores.reduce((s, v) => s + v, 0) / b.count) - (a.scores.reduce((s, v) => s + v, 0) / a.count))
      .map(([edu, d]) => `${edu}: avg score ${Math.round(d.scores.reduce((s, v) => s + v, 0) / d.count)}, ${d.count} candidates`);

    return {
      nodes: [...candidates.slice(0, 20), ...eduNodes].slice(0, 50),
      edges: educationEdges.slice(0, 100),
      answer: lines.length > 0
        ? `Education vs performance:\n${lines.join('\n')}`
        : 'No education data available in the graph yet.',
    };
  }

  private _queryCompanyPerformance(nodes: GraphNode[], edges: GraphEdge[]): GraphQueryResult {
    const candidates = nodes.filter(n => n.node_type === 'candidate');
    const companyEdges = edges.filter(e => e.relationship === 'worked_at');
    const companyNodes = nodes.filter(n => n.node_type === 'company');

    const byCompany: Record<string, { scores: number[]; label: string }> = {};
    for (const e of companyEdges) {
      const candidate = candidates.find(c => c.id === e.source_id);
      const company = companyNodes.find(n => n.id === e.target_id);
      if (candidate && company && candidate.properties.composite_score) {
        const key = company.id;
        if (!byCompany[key]) byCompany[key] = { scores: [], label: company.label };
        byCompany[key].scores.push(candidate.properties.composite_score);
      }
    }

    const sorted = Object.values(byCompany)
      .filter(c => c.scores.length >= 1)
      .sort((a, b) => (b.scores.reduce((s, v) => s + v, 0) / b.scores.length) - (a.scores.reduce((s, v) => s + v, 0) / a.scores.length))
      .slice(0, 10);

    const lines = sorted.map(c =>
      `${c.label}: avg score ${Math.round(c.scores.reduce((s, v) => s + v, 0) / c.scores.length)}, ${c.scores.length} candidate(s)`
    );

    return {
      nodes: [...candidates.slice(0, 15), ...companyNodes.slice(0, 20)].slice(0, 50),
      edges: companyEdges.slice(0, 100),
      answer: lines.length > 0
        ? `Company caliber vs candidate performance (top 10):\n${lines.join('\n')}`
        : 'No company data available in the graph yet.',
    };
  }

  private _fallbackQuery(question: string, nodes: GraphNode[], edges: GraphEdge[]): GraphQueryResult {
    const lower = question.toLowerCase();
    let filtered = nodes;

    if (lower.includes('candidate') || lower.includes('who')) {
      filtered = nodes.filter(n => n.node_type === 'candidate');
    } else if (lower.includes('skill') || lower.includes('technical')) {
      filtered = nodes.filter(n => n.node_type === 'skill');
    } else if (lower.includes('company') || lower.includes('work')) {
      filtered = nodes.filter(n => n.node_type === 'company');
    } else if (lower.includes('interview') || lower.includes('session')) {
      filtered = nodes.filter(n => n.node_type === 'candidate' && n.properties.interview_scores);
    } else if (lower.includes('evaluator') || lower.includes('reviewer') || lower.includes('feedback')) {
      filtered = nodes.filter(n => n.node_type === 'evaluator');
    }

    const nodeIds = new Set(filtered.map(n => n.id));
    const relEdges = edges.filter(e => nodeIds.has(e.source_id) || nodeIds.has(e.target_id));

    return {
      nodes: filtered.slice(0, 30),
      edges: relEdges.slice(0, 60),
      answer: `Found ${filtered.length} matching entities. Showing top results.`,
    };
  }

  private _buildGraphSummary(nodes: GraphNode[], edges: GraphEdge[]): string {
    const byType: Record<string, GraphNode[]> = {};
    for (const n of nodes) {
      (byType[n.node_type] ||= []).push(n);
    }

    const lines: string[] = [];
    lines.push(`Total: ${nodes.length} nodes, ${edges.length} edges`);

    for (const [type, group] of Object.entries(byType)) {
      if (type === 'candidate') {
        const candidates = group.sort((a, b) => (b.properties.composite_score || 0) - (a.properties.composite_score || 0));
        const evalEdgeMap = new Map<string, { score: number | null; verdict: string; author: string }[]>();
        for (const e of edges) {
          if (e.relationship === 'evaluated_by') {
            const list = evalEdgeMap.get(e.source_id) || [];
            const evaluator = nodes.find(n => n.id === e.target_id);
            list.push({ score: e.properties.score ?? null, verdict: e.properties.verdict ?? '', author: evaluator?.label || '' });
            evalEdgeMap.set(e.source_id, list);
          }
        }
        const summaries = candidates.slice(0, 20).map(c => {
          let line = `  - ${c.id}: "${c.label}" score=${c.properties.composite_score ?? '?'} status=${c.properties.status ?? '?'} role=${c.properties.role ?? '?'}`;
          const evals = evalEdgeMap.get(c.id);
          if (evals && evals.length > 0) {
            const evalStr = evals.map(ev => `${ev.author}:${ev.score ?? ev.verdict}`).join(', ');
            line += ` evaluations=[${evalStr}]`;
          }
          return line;
        });
        lines.push(`\nCandidates (${group.length}):\n${summaries.join('\n')}`);
      } else {
        const labels = group.slice(0, 15).map(n => n.label);
        lines.push(`${type} (${group.length}): ${labels.join(', ')}${group.length > 15 ? '...' : ''}`);
      }
    }

    const relCounts: Record<string, number> = {};
    for (const e of edges) relCounts[e.relationship] = (relCounts[e.relationship] || 0) + 1;
    lines.push(`\nRelationships: ${Object.entries(relCounts).map(([r, c]) => `${r}=${c}`).join(', ')}`);

    return lines.join('\n');
  }
}
