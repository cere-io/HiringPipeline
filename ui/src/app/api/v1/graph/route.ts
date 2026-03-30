import { NextResponse } from 'next/server';
import { getCI } from '@/lib/compound-intelligence/runtime';
import type { GraphQueryTemplate } from '@/lib/compound-intelligence/types';

const PRESET_QUERIES: GraphQueryTemplate[] = [
  { id: 'tq-strongest-candidates', category: 'talent_intelligence', label: 'Strongest candidates', description: 'Who are the highest-scoring candidates overall?', is_preset: true },
  { id: 'tq-startup-bigtech', category: 'talent_intelligence', label: 'Startup + Big Tech mix', description: 'Which candidates have both startup and big tech experience?', is_preset: true },
  { id: 'tq-role-fit', category: 'talent_intelligence', label: 'Best role fit', description: 'Who are the best candidates for a specific role?', is_preset: true },
  { id: 'pi-winner-traits', category: 'pattern_insights', label: 'Winning traits', description: 'What traits do our hired candidates share?', is_preset: true },
  { id: 'pi-reject-patterns', category: 'pattern_insights', label: 'Rejection patterns', description: 'What is the most common background of rejected candidates?', is_preset: true },
  { id: 'pi-high-scorers', category: 'pattern_insights', label: 'High scorer profile', description: 'What does the typical high-scoring candidate look like?', is_preset: true },
  { id: 'ci-weight-shifts', category: 'compounding', label: 'Weight evolution', description: 'How have our trait weights shifted over time?', is_preset: true },
  { id: 'ci-signal-strength', category: 'compounding', label: 'Strongest signals', description: 'Which signals are getting stronger with more data?', is_preset: true },
  { id: 'ci-learning-rate', category: 'compounding', label: 'Learning velocity', description: 'How fast is the system learning from new outcomes?', is_preset: true },
  { id: 'cd-os-interview', category: 'cross_domain', label: 'Open source vs interviews', description: 'Do candidates with open source contributions score higher in interviews?', is_preset: true },
  { id: 'cd-education-outcome', category: 'cross_domain', label: 'Education vs outcomes', description: 'Does education level correlate with hiring outcomes?', is_preset: true },
  { id: 'cd-company-performance', category: 'cross_domain', label: 'Company caliber vs performance', description: 'Do candidates from top companies perform better?', is_preset: true },
];

export async function GET(req: Request) {
  try {
    const ci = getCI();
    const url = new URL(req.url);
    const schemaId = url.searchParams.get('schema_id');
    const category = url.searchParams.get('category') || undefined;

    let queries = await ci.getGraphQueries(category);
    if (queries.length === 0) {
      queries = category ? PRESET_QUERIES.filter(q => q.category === category) : PRESET_QUERIES;
    }

    if (!schemaId) {
      const stats = await ci.getGraphStats();
      return NextResponse.json({ success: true, queries, stats });
    }

    const [graph, stats] = await Promise.all([
      ci.getGraphData(schemaId),
      ci.getGraphStats(schemaId),
    ]);

    return NextResponse.json({
      success: true,
      nodes: graph.nodes,
      edges: graph.edges,
      stats,
      queries,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ci = getCI();
    const body = await req.json();
    const { schema_id, question, preset_id } = body;

    if (!schema_id) {
      return NextResponse.json({ success: false, error: 'Missing schema_id' }, { status: 400 });
    }

    let result;
    if (preset_id) {
      result = await ci.queryPreset(preset_id, schema_id);
    } else if (question) {
      result = await ci.queryGraph(question, schema_id);
    } else {
      return NextResponse.json({ success: false, error: 'Provide either question or preset_id' }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
