'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────
interface GraphNode {
  id: string;
  node_type: string;
  label: string;
  properties: Record<string, any>;
  schema_id?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship: string;
  weight: number;
  properties: Record<string, any>;
}

interface GraphQuery {
  id: string;
  category: string;
  label: string;
  description: string;
  is_preset: boolean;
}

interface GraphStats {
  total_nodes: number;
  total_edges: number;
  nodes_by_type: Record<string, number>;
  edges_by_relationship: Record<string, number>;
}

interface IndexJob {
  id: string;
  job_type: string;
  schema_id?: string;
  status: string;
  subjects_processed: number;
  nodes_created: number;
  edges_created: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

interface AdapterConnection {
  id: string;
  adapter_type: string;
  schema_id: string;
  is_active: boolean;
  last_poll_at: string | null;
  subjects_processed: number;
  created_at: string;
}

interface Schema {
  id: string;
  name: string;
  domain: string;
}

// ── Constants ──────────────────────────────────────────────────
const NODE_COLORS: Record<string, string> = {
  candidate: '#3b82f6',
  skill: '#8b5cf6',
  company: '#f59e0b',
  trait: '#10b981',
  role: '#ec4899',
  outcome: '#ef4444',
  session: '#06b6d4',
  feedback: '#6366f1',
};

const NODE_RADIUS: Record<string, number> = {
  candidate: 12,
  skill: 7,
  company: 9,
  trait: 6,
  role: 10,
  outcome: 10,
  session: 8,
  feedback: 6,
};

const CATEGORY_LABELS: Record<string, string> = {
  talent_intelligence: 'Talent Intelligence',
  pattern_insights: 'Pattern Insights',
  compounding: 'Compounding Intelligence',
  cross_domain: 'Cross-Domain',
};

const CATEGORY_ORDER = ['talent_intelligence', 'pattern_insights', 'compounding', 'cross_domain'];

const AGENT_PIPELINE = [
  { id: 'ingest', label: 'Data Ingestion', icon: '↓', desc: 'ATS adapters pull candidate data' },
  { id: 'extract', label: 'Extractor', icon: '◈', desc: 'Extract traits from CVs and documents' },
  { id: 'score', label: 'Scorer', icon: '★', desc: 'Score candidates against role weights' },
  { id: 'analyze', label: 'Analyzer', icon: '◎', desc: 'Analyze interviews and work samples' },
  { id: 'distill', label: 'Distiller', icon: '⚗', desc: 'Learn from outcomes, adjust weights' },
  { id: 'index', label: 'Indexer', icon: '⬡', desc: 'Build knowledge graph nodes and edges' },
  { id: 'graph', label: 'Knowledge Graph', icon: '⊛', desc: 'Query and visualize relationships' },
];

// ── Force Graph Component ──────────────────────────────────────
function ForceGraph({
  nodes,
  edges,
  highlightIds,
  onNodeClick,
  width,
  height,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlightIds: Set<string>;
  onNodeClick: (node: GraphNode) => void;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<any>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<{ source: GraphNode; target: GraphNode; relationship: string; weight: number }[]>([]);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ node: GraphNode | null; active: boolean }>({ node: null, active: false });
  const panRef = useRef<{ active: boolean; startX: number; startY: number; startTx: number; startTy: number }>({
    active: false, startX: 0, startY: 0, startTx: 0, startTy: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    import('d3-force').then(d3 => {
      const spread = Math.max(width, height) * 0.4;

      // Build a set of node IDs that have at least one edge
      const connectedIds = new Set<string>();
      for (const e of edges) {
        connectedIds.add(e.source_id);
        connectedIds.add(e.target_id);
      }

      // Only include nodes that participate in at least one edge
      const connectedNodes = nodes.filter(n => connectedIds.has(n.id));

      const simNodes = connectedNodes.map(n => ({
        ...n,
        x: n.x ?? width / 2 + (Math.random() - 0.5) * spread,
        y: n.y ?? height / 2 + (Math.random() - 0.5) * spread,
      }));
      nodesRef.current = simNodes;

      const nodeMap = new Map(simNodes.map(n => [n.id, n]));
      const simEdges = edges
        .filter(e => nodeMap.has(e.source_id) && nodeMap.has(e.target_id))
        .map(e => ({
          source: nodeMap.get(e.source_id)!,
          target: nodeMap.get(e.target_id)!,
          relationship: e.relationship,
          weight: e.weight,
        }));
      edgesRef.current = simEdges;

      if (simRef.current) simRef.current.stop();

      const chargeStrength = Math.min(-120, -30000 / Math.max(connectedNodes.length, 1));
      simRef.current = d3.forceSimulation(simNodes as any)
        .force('link', d3.forceLink(simEdges as any).id((d: any) => d.id).distance(60).strength(0.4))
        .force('charge', d3.forceManyBody().strength(chargeStrength))
        .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
        .force('collision', d3.forceCollide().radius((d: any) => (NODE_RADIUS[d.node_type] || 8) + 4))
        .force('x', d3.forceX(width / 2).strength(0.03))
        .force('y', d3.forceY(height / 2).strength(0.03))
        .alphaDecay(0.015)
        .on('tick', draw);
    });

    return () => { if (simRef.current) simRef.current.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, width, height]);

  useEffect(() => { draw(); }, [highlightIds]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x: tx, y: ty, k } = transformRef.current;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    // Edges
    for (const e of edgesRef.current) {
      const src = e.source;
      const tgt = e.target;
      if (src.x == null || tgt.x == null) continue;

      const isHighlighted = highlightIds.size > 0 && (highlightIds.has(src.id) || highlightIds.has(tgt.id));
      ctx.beginPath();
      ctx.moveTo(src.x, src.y!);
      ctx.lineTo(tgt.x, tgt.y!);
      ctx.strokeStyle = isHighlighted ? 'rgba(129,140,248,0.8)' : 'rgba(148,163,184,0.35)';
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.stroke();
    }

    // Nodes
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue;
      const r = NODE_RADIUS[n.node_type] || 7;
      const color = NODE_COLORS[n.node_type] || '#6b7280';
      const isHighlighted = highlightIds.size === 0 || highlightIds.has(n.id);
      const alpha = isHighlighted ? 1 : 0.2;

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      if (isHighlighted && highlightIds.size > 0) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Labels for larger nodes
      if (r >= 8 && k >= 0.5) {
        ctx.fillStyle = '#e5e7eb';
        ctx.globalAlpha = alpha;
        ctx.font = `${Math.max(8, 10 / k)}px system-ui`;
        ctx.textAlign = 'center';
        const label = n.label.length > 18 ? n.label.slice(0, 16) + '...' : n.label;
        ctx.fillText(label, n.x, n.y + r + 12);
      }

      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function screenToWorld(sx: number, sy: number): [number, number] {
    const { x: tx, y: ty, k } = transformRef.current;
    return [(sx - tx) / k, (sy - ty) / k];
  }

  function findNodeAt(wx: number, wy: number): GraphNode | null {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (n.x == null || n.y == null) continue;
      const r = NODE_RADIUS[n.node_type] || 7;
      const dx = n.x - wx;
      const dy = n.y! - wy;
      if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return n;
    }
    return null;
  }

  function handleMouseDown(e: React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = screenToWorld(sx, sy);
    const node = findNodeAt(wx, wy);

    if (node) {
      dragRef.current = { node, active: true };
      node.fx = node.x;
      node.fy = node.y;
      simRef.current?.alphaTarget(0.3).restart();
    } else {
      panRef.current = { active: true, startX: sx, startY: sy, startTx: transformRef.current.x, startTy: transformRef.current.y };
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragRef.current.active && dragRef.current.node) {
      const [wx, wy] = screenToWorld(sx, sy);
      dragRef.current.node.fx = wx;
      dragRef.current.node.fy = wy;
    } else if (panRef.current.active) {
      transformRef.current.x = panRef.current.startTx + (sx - panRef.current.startX);
      transformRef.current.y = panRef.current.startTy + (sy - panRef.current.startY);
      draw();
    }
  }

  function handleMouseUp() {
    if (dragRef.current.active && dragRef.current.node) {
      dragRef.current.node.fx = null;
      dragRef.current.node.fy = null;
      simRef.current?.alphaTarget(0);
    }
    dragRef.current = { node: null, active: false };
    panRef.current.active = false;
  }

  function handleClick(e: React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const [wx, wy] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const node = findNodeAt(wx, wy);
    if (node) onNodeClick(node);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const t = transformRef.current;
    t.x = mx - (mx - t.x) * factor;
    t.y = my - (my - t.y) * factor;
    t.k *= factor;
    draw();
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-lg bg-gray-950 cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      onWheel={handleWheel}
    />
  );
}

// ── Main App ───────────────────────────────────────────────────
export default function GraphRAGDashboard() {
  const [activeTab, setActiveTab] = useState<'queries' | 'agents' | 'indexing' | 'candidates'>('queries');
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string>('');
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null);
  const [queries, setQueries] = useState<GraphQuery[]>([]);
  const [queryAnswer, setQueryAnswer] = useState<string>('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [queryLoading, setQueryLoading] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [indexJobs, setIndexJobs] = useState<IndexJob[]>([]);
  const [adapters, setAdapters] = useState<AdapterConnection[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [graphContainerSize, setGraphContainerSize] = useState({ width: 600, height: 500 });
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [connectType, setConnectType] = useState<'notion' | 'webhook' | 'api' | null>(null);
  const [connectConfig, setConnectConfig] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string>('');
  const [transcriptText, setTranscriptText] = useState('');
  const [feedbackScore, setFeedbackScore] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [pasteResume, setPasteResume] = useState('');
  const [pasteRole, setPasteRole] = useState('');
  const [pasteName, setPasteName] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Load schemas
  useEffect(() => {
    fetch('/api/v1/schemas')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.schemas?.length > 0) {
          setSchemas(d.schemas);
          setSelectedSchema(d.schemas[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Load graph data when schema changes
  const loadGraphData = useCallback(async () => {
    if (!selectedSchema) return;
    try {
      const res = await fetch(`/api/v1/graph?schema_id=${selectedSchema}`);
      const data = await res.json();
      if (data.success) {
        setGraphNodes(data.nodes || []);
        setGraphEdges(data.edges || []);
        setGraphStats(data.stats || null);
        setQueries(data.queries || []);
      }
    } catch {}
  }, [selectedSchema]);

  useEffect(() => { loadGraphData(); }, [loadGraphData]);

  // Load indexing data
  const loadIndexData = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/index-graph?schema_id=${selectedSchema || ''}`);
      const data = await res.json();
      if (data.success) {
        setIndexJobs(data.jobs || []);
        setAdapters(data.adapters || []);
        if (data.stats) setGraphStats(data.stats);
      }
    } catch {}
  }, [selectedSchema]);

  useEffect(() => {
    if (activeTab === 'indexing') loadIndexData();
  }, [activeTab, loadIndexData]);

  // Measure graph container
  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setGraphContainerSize({
          width: Math.max(400, entry.contentRect.width),
          height: Math.max(400, entry.contentRect.height),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Execute a query
  async function runQuery(presetId?: string, question?: string) {
    if (!selectedSchema) return;
    const key = presetId || question || '';
    setQueryLoading(key);
    setQueryAnswer('');
    try {
      const res = await fetch('/api/v1/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema_id: selectedSchema,
          ...(presetId ? { preset_id: presetId } : { question }),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setQueryAnswer(data.answer || '');
        if (data.nodes?.length > 0) {
          const ids = new Set<string>(data.nodes.map((n: GraphNode) => n.id));
          setHighlightIds(ids);
        }
      } else {
        setQueryAnswer(data.error || 'Query failed');
      }
    } catch (e: any) {
      setQueryAnswer(`Error: ${e.message}`);
    } finally {
      setQueryLoading(null);
    }
  }

  // Run indexing with timeout protection
  async function runIndex() {
    if (!selectedSchema) return;
    setIndexing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000);
      const res = await fetch('/api/v1/index-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema_id: selectedSchema }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.success) {
        await Promise.all([loadGraphData(), loadIndexData()]);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        await Promise.all([loadGraphData(), loadIndexData()]);
      }
    } finally {
      setIndexing(false);
    }
  }

  async function connectSource() {
    if (!selectedSchema || !connectType) return;
    setConnecting(true);
    setConnectResult(null);
    try {
      if (connectType === 'notion') {
        const res = await fetch('/api/v1/adapters/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adapter_type: 'notion',
            schema_id: selectedSchema,
            config: {
              database_id: connectConfig.notion_db_id || '',
              api_key: connectConfig.notion_api_key || '',
              name_field: connectConfig.notion_name_field || 'Name',
              status_field: connectConfig.notion_status_field || 'Status',
            },
          }),
        });
        const data = await res.json();
        if (data.success) {
          setConnectResult({ ok: true, message: `Notion connected. Connection ID: ${data.connection?.id || 'created'}` });
          setConnectType(null);
          setConnectConfig({});
          await loadIndexData();
        } else {
          setConnectResult({ ok: false, message: data.error || 'Connection failed' });
        }
      } else if (connectType === 'webhook') {
        const res = await fetch('/api/v1/adapters/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adapter_type: 'generic-webhook',
            schema_id: selectedSchema,
            config: {
              field_map: {
                name: connectConfig.wh_name_field || 'name',
                text: connectConfig.wh_text_field || 'resume_text',
                role: connectConfig.wh_role_field || 'role',
              },
              webhook_secret: connectConfig.wh_secret || '',
            },
          }),
        });
        const data = await res.json();
        if (data.success) {
          setConnectResult({ ok: true, message: `Webhook endpoint ready. POST candidate data to /api/webhooks/join` });
          setConnectType(null);
          setConnectConfig({});
          await loadIndexData();
        } else {
          setConnectResult({ ok: false, message: data.error || 'Connection failed' });
        }
      }
    } catch (e: any) {
      setConnectResult({ ok: false, message: e.message });
    } finally {
      setConnecting(false);
    }
  }

  // Sync candidates from Notion — processes 1 at a time with live progress
  async function syncCandidates() {
    setSyncing(true);
    setSyncResult('Connecting to Notion...');
    try {
      const connRes = await fetch(`/api/v1/index-graph?schema_id=${selectedSchema || ''}`);
      const connData = await connRes.json();
      const allNotion = (connData.adapters || []).filter((a: any) => a.is_active && a.adapter_type === 'notion');
      const seen = new Set<string>();
      const notionAdapters = allNotion.filter((a: any) => {
        const key = `${a.schema_id}:${a.config?.database_id || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (notionAdapters.length === 0) {
        setSyncResult('No Notion adapter connected. Go to Indexing tab to connect.');
        setSyncing(false);
        setTimeout(() => setSyncResult(''), 5000);
        return;
      }

      let totalProcessed = 0;
      let totalSkipped = 0;
      let batchDone = false;

      for (const adapter of notionAdapters) {
        // Process in small batches of 1, looping until no more new candidates
        while (!batchDone) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 300000);
            const res = await fetch('/api/v1/adapters/poll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ adapter_id: adapter.id, limit: 1 }),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await res.json();
            totalProcessed += data.processed || 0;
            totalSkipped += data.skipped_count || 0;

            if (data.processed > 0) {
              setSyncResult(`Synced ${totalProcessed} candidate${totalProcessed > 1 ? 's' : ''}... (${data.results?.[0]?.name || 'processing'})`);
              await loadIndexData();
            } else {
              batchDone = true;
            }
          } catch (e: any) {
            if (e.name === 'AbortError') {
              setSyncResult('Sync timed out on a candidate, continuing...');
            } else {
              throw e;
            }
            batchDone = true;
          }
        }
      }

      await loadIndexData();
      if (totalProcessed > 0) {
        setSyncResult(`Done — synced ${totalProcessed} new candidate${totalProcessed > 1 ? 's' : ''}`);
        await loadCandidates();
        await loadGraphData();
      } else {
        setSyncResult(`No new candidates to sync (${totalSkipped} already processed)`);
      }
    } catch (e: any) {
      setSyncResult(`Error: ${e.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(''), 10000);
    }
  }

  // Load candidate list
  const loadCandidates = useCallback(async () => {
    if (!selectedSchema) return;
    try {
      const res = await fetch(`/api/v1/analytics?schema_id=${selectedSchema}`);
      const data = await res.json();
      if (data.success && data.subjects) {
        setCandidates(data.subjects);
      }
    } catch {}
  }, [selectedSchema]);

  useEffect(() => {
    if (activeTab === 'candidates') loadCandidates();
  }, [activeTab, loadCandidates]);

  // Submit pasted resume
  async function submitResume() {
    if (!selectedSchema || !pasteResume || !pasteRole) return;
    setSubmitting('resume');
    setActionResult(null);
    try {
      const subjectId = `manual-${(pasteName || 'candidate').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
      const res = await fetch('/api/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema_id: selectedSchema, subject_id: subjectId, text: pasteResume, role: pasteRole }),
      });
      const data = await res.json();
      if (data.success) {
        await fetch('/api/v1/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schema_id: selectedSchema, subject_id: subjectId, role: pasteRole }),
        });
        setActionResult({ ok: true, message: `Processed "${pasteName || subjectId}". Traits extracted and scored.` });
        setPasteResume(''); setPasteRole(''); setPasteName('');
        await loadCandidates();
      } else {
        setActionResult({ ok: false, message: data.error || 'Extraction failed' });
      }
    } catch (e: any) {
      setActionResult({ ok: false, message: e.message });
    } finally {
      setSubmitting(null);
    }
  }

  // Submit interview transcript
  async function submitTranscript() {
    if (!selectedSchema || !selectedCandidate || !transcriptText) return;
    setSubmitting('transcript');
    setActionResult(null);
    try {
      const res = await fetch('/api/v1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema_id: selectedSchema,
          subject_id: selectedCandidate,
          text: transcriptText,
          role: candidates.find(c => c.subject_id === selectedCandidate)?.role || 'general',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionResult({ ok: true, message: `Transcript analyzed for ${candidates.find(c => c.subject_id === selectedCandidate)?.name || selectedCandidate}` });
        setTranscriptText('');
        await loadCandidates();
      } else {
        setActionResult({ ok: false, message: data.error || 'Analysis failed' });
      }
    } catch (e: any) {
      setActionResult({ ok: false, message: e.message });
    } finally {
      setSubmitting(null);
    }
  }

  // Submit human feedback (distill)
  async function submitFeedback() {
    if (!selectedSchema || !selectedCandidate || !feedbackScore) return;
    setSubmitting('feedback');
    setActionResult(null);
    try {
      const res = await fetch('/api/v1/distill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema_id: selectedSchema,
          subject_id: selectedCandidate,
          role: candidates.find(c => c.subject_id === selectedCandidate)?.role || 'general',
          outcome: Number(feedbackScore),
          feedback: feedbackText || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionResult({ ok: true, message: `Feedback recorded. Weights updated.` });
        setFeedbackScore(''); setFeedbackText('');
        await loadCandidates();
      } else {
        setActionResult({ ok: false, message: data.error || 'Distillation failed' });
      }
    } catch (e: any) {
      setActionResult({ ok: false, message: e.message });
    } finally {
      setSubmitting(null);
    }
  }

  function resetView() {
    setHighlightIds(new Set());
    setSelectedNode(null);
    setQueryAnswer('');
  }

  function handleNodeClick(node: GraphNode) {
    setSelectedNode(node);
    const connectedIds = new Set<string>([node.id]);
    for (const e of graphEdges) {
      if (e.source_id === node.id) connectedIds.add(e.target_id);
      if (e.target_id === node.id) connectedIds.add(e.source_id);
    }
    setHighlightIds(connectedIds);
  }

  // Group queries by category
  const queryGroups: Record<string, GraphQuery[]> = {};
  for (const q of queries) {
    (queryGroups[q.category] ||= []).push(q);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-[family-name:var(--font-geist-sans)]">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Compound Intelligence</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              GraphRAG Explorer — candidates, traits, patterns, compounding intelligence
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={syncCandidates}
              disabled={syncing}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 text-white text-xs rounded-md font-medium"
            >
              {syncing ? 'Syncing...' : 'Sync Candidates'}
            </button>
            {syncResult && <span className="text-xs text-emerald-400">{syncResult}</span>}
            {schemas.length > 0 && (
              <select
                className="bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                value={selectedSchema}
                onChange={e => setSelectedSchema(e.target.value)}
              >
                {schemas.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            {graphStats && (
              <span className="text-xs text-gray-500">
                {(() => {
                  const connIds = new Set<string>();
                  for (const e of graphEdges) { connIds.add(e.source_id); connIds.add(e.target_id); }
                  const connected = graphNodes.filter(n => connIds.has(n.id)).length;
                  return `${connected} connected · ${graphNodes.length - connected} orphan · ${graphStats.total_edges} edges`;
                })()}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 mt-4">
          {[
            { key: 'queries' as const, label: 'Graph Queries' },
            { key: 'candidates' as const, label: 'Candidates' },
            { key: 'agents' as const, label: 'Agent Flows' },
            { key: 'indexing' as const, label: 'Indexing' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm rounded-t-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-gray-900 text-white border-t border-x border-gray-700'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Tab: Graph Queries ─────────────────────────────── */}
      {activeTab === 'queries' && (
        <div className="flex h-[calc(100vh-130px)]">
          {/* Left: Query Panel */}
          <div className="w-[420px] border-r border-gray-800 overflow-y-auto p-4 flex-shrink-0">
            {/* Custom question */}
            <div className="mb-5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customQuestion}
                  onChange={e => setCustomQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && customQuestion && runQuery(undefined, customQuestion)}
                  placeholder="Ask anything about candidates..."
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600"
                />
                <button
                  onClick={() => customQuestion && runQuery(undefined, customQuestion)}
                  disabled={!customQuestion || !!queryLoading}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm rounded-md"
                >
                  Ask
                </button>
              </div>
            </div>

            {/* Answer display */}
            {queryAnswer && (
              <div className="mb-5 p-3 bg-gray-900 border border-gray-700 rounded-lg">
                <div className="text-xs text-indigo-400 mb-1 font-medium">Answer</div>
                <p className="text-sm text-gray-200 leading-relaxed">{queryAnswer}</p>
              </div>
            )}

            {/* Preset queries by category */}
            {CATEGORY_ORDER.map(cat => {
              const group = queryGroups[cat];
              if (!group?.length) return null;
              return (
                <div key={cat} className="mb-5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    {CATEGORY_LABELS[cat] || cat}
                  </div>
                  <div className="space-y-1.5">
                    {group.map(q => (
                      <button
                        key={q.id}
                        onClick={() => runQuery(q.id)}
                        disabled={!!queryLoading}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          queryLoading === q.id
                            ? 'border-indigo-500 bg-indigo-950/50'
                            : 'border-gray-800 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-900'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            cat === 'talent_intelligence' ? 'bg-blue-900/50 text-blue-400' :
                            cat === 'pattern_insights' ? 'bg-amber-900/50 text-amber-400' :
                            cat === 'compounding' ? 'bg-emerald-900/50 text-emerald-400' :
                            'bg-purple-900/50 text-purple-400'
                          }`}>
                            {cat === 'talent_intelligence' ? 'TALENT' :
                             cat === 'pattern_insights' ? 'PATTERN' :
                             cat === 'compounding' ? 'COMPOUND' : 'CROSS'}
                          </span>
                          <span className="text-sm font-medium text-gray-200">{q.label}</span>
                          {queryLoading === q.id && <span className="ml-auto text-xs text-indigo-400 animate-pulse">Loading...</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 ml-0.5">{q.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {Object.keys(queryGroups).length === 0 && (
              <div className="text-center text-gray-500 py-10">
                <p className="text-sm">No queries available.</p>
                <p className="text-xs mt-1">Run indexing first to populate the graph.</p>
              </div>
            )}
          </div>

          {/* Right: Graph Visualization */}
          <div className="flex-1 relative" ref={graphContainerRef}>
            {/* Graph controls */}
            <div className="absolute top-3 right-3 z-10 flex gap-2">
              <button
                onClick={resetView}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 rounded-md border border-gray-700"
              >
                Reset View
              </button>
              <button
                onClick={() => setHighlightIds(new Set())}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 rounded-md border border-gray-700"
              >
                Clear Highlight
              </button>
            </div>

            {/* Node type legend */}
            <div className="absolute bottom-3 left-3 z-10 flex gap-3 bg-gray-900/90 px-3 py-2 rounded-md border border-gray-800">
              {Object.entries(NODE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-gray-400 capitalize">{type}</span>
                </div>
              ))}
            </div>

            {graphNodes.length > 0 ? (
              <ForceGraph
                nodes={graphNodes}
                edges={graphEdges}
                highlightIds={highlightIds}
                onNodeClick={handleNodeClick}
                width={graphContainerSize.width}
                height={graphContainerSize.height}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-3">⊛</div>
                  <p className="text-sm font-medium">Knowledge graph is empty</p>
                  <p className="text-xs mt-1">Go to Indexing tab and run a full reindex</p>
                </div>
              </div>
            )}

            {/* Selected node detail */}
            {selectedNode && (
              <div className="absolute top-3 left-3 z-10 w-72 bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS[selectedNode.node_type] }} />
                    <span className="text-xs text-gray-400 uppercase">{selectedNode.node_type}</span>
                  </div>
                  <button
                    onClick={() => { setSelectedNode(null); setHighlightIds(new Set()); }}
                    className="text-gray-500 hover:text-gray-300 text-xs"
                  >
                    ✕
                  </button>
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">{selectedNode.label}</h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {Object.entries(selectedNode.properties).map(([k, v]) => {
                    if (v == null || (typeof v === 'object' && Object.keys(v).length === 0)) return null;
                    return (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-gray-500">{k.replace(/_/g, ' ')}</span>
                        <span className="text-gray-300 text-right max-w-[160px] truncate">
                          {typeof v === 'object' ? JSON.stringify(v).slice(0, 50) : String(v)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-[10px] text-gray-600">
                  {graphEdges.filter(e => e.source_id === selectedNode.id || e.target_id === selectedNode.id).length} connections
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Candidates ─────────────────────────────── */}
      {activeTab === 'candidates' && (
        <div className="p-6 max-w-6xl mx-auto">
          <h2 className="text-lg font-semibold text-white mb-4">Candidates</h2>

          {/* Action result banner */}
          {actionResult && (
            <div className={`mb-4 p-3 rounded-lg border text-sm ${
              actionResult.ok ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300' : 'bg-red-950/30 border-red-800 text-red-300'
            }`}>
              {actionResult.message}
              <button onClick={() => setActionResult(null)} className="ml-3 text-xs opacity-60 hover:opacity-100">Dismiss</button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6">
            {/* Left column: Candidate list */}
            <div className="col-span-1 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Processed ({candidates.length})</h3>
              <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
                {candidates.length > 0 ? candidates.map(c => (
                  <button
                    key={c.subject_id}
                    onClick={() => setSelectedCandidate(c.subject_id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                      selectedCandidate === c.subject_id
                        ? 'border-indigo-500 bg-indigo-950/30'
                        : 'border-gray-800 bg-gray-900/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-200 truncate">{c.name}</span>
                      <span className="text-xs font-mono text-gray-400">{c.score > 10 ? (c.score / 10).toFixed(1) : Number(c.score).toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-500">{c.role}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded ${
                        c.result === 'winner' ? 'bg-emerald-900/30 text-emerald-400' :
                        c.result === 'rejected' ? 'bg-red-900/30 text-red-400' :
                        'bg-gray-800 text-gray-500'
                      }`}>{c.status || c.result}</span>
                    </div>
                    {c.reviewed && <div className="text-[9px] text-indigo-400 mt-0.5">Feedback given</div>}
                  </button>
                )) : (
                  <p className="text-xs text-gray-600 py-4 text-center">No candidates yet. Click "Sync Candidates" or add a resume below.</p>
                )}
              </div>
            </div>

            {/* Right column: Actions */}
            <div className="col-span-2 space-y-5">
              {/* Paste Resume */}
              <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                <h3 className="text-sm font-semibold text-white mb-3">Add New Candidate</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Candidate Name</label>
                    <input type="text" placeholder="John Doe" value={pasteName} onChange={e => setPasteName(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Role</label>
                    <input type="text" placeholder="AI Engineer" value={pasteRole} onChange={e => setPasteRole(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-xs text-gray-400 mb-1">Resume / CV Text</label>
                  <textarea rows={4} placeholder="Paste the full resume or CV text here..." value={pasteResume} onChange={e => setPasteResume(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600 resize-y" />
                </div>
                <button onClick={submitResume} disabled={submitting === 'resume' || !pasteResume || !pasteRole}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm rounded-md font-medium">
                  {submitting === 'resume' ? 'Processing...' : 'Extract & Score'}
                </button>
              </div>

              {/* Selected candidate actions */}
              {selectedCandidate && (
                <>
                  {/* Candidate detail */}
                  {(() => {
                    const c = candidates.find(x => x.subject_id === selectedCandidate);
                    if (!c) return null;
                    return (
                      <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-white">{c.name}</h3>
                          <span className="text-lg font-mono text-indigo-400">{c.score > 10 ? (c.score / 10).toFixed(1) : Number(c.score).toFixed(1)}</span>
                        </div>
                        <div className="flex gap-3 text-xs text-gray-500 mb-2">
                          <span>{c.role}</span>
                          <span>{c.status || c.result}</span>
                          {c.human_score && <span>Human: {c.human_score}/10</span>}
                        </div>
                        {c.reasoning && <p className="text-xs text-gray-400 mb-2">{c.reasoning}</p>}
                        {c.soft_summary && (
                          <div className="mt-2 p-2 bg-gray-950 rounded text-xs text-gray-400">
                            <span className="text-gray-500 font-medium">Interview Summary: </span>{c.soft_summary}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Add Transcript */}
                  <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                    <h3 className="text-sm font-semibold text-white mb-3">Add Interview Transcript</h3>
                    <p className="text-[11px] text-gray-500 mb-2">
                      Paste a call transcript, meeting notes, or Gemini notes. The Analyzer agent will score communication, technical depth, problem solving, and cultural fit.
                    </p>
                    <textarea rows={5} placeholder="Paste interview transcript or meeting notes here..." value={transcriptText} onChange={e => setTranscriptText(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600 resize-y mb-3" />
                    <button onClick={submitTranscript} disabled={submitting === 'transcript' || !transcriptText}
                      className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 text-white text-sm rounded-md font-medium">
                      {submitting === 'transcript' ? 'Analyzing...' : 'Analyze Transcript'}
                    </button>
                  </div>

                  {/* Add Feedback (Distill) */}
                  <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                    <h3 className="text-sm font-semibold text-white mb-3">Add Human Feedback</h3>
                    <p className="text-[11px] text-gray-500 mb-2">
                      Your feedback teaches the system. The Distiller agent adjusts trait weights based on your score and reasoning, making future scores more accurate.
                    </p>
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Your Score (1-10)</label>
                        <input type="number" min="1" max="10" placeholder="8" value={feedbackScore} onChange={e => setFeedbackScore(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-400 mb-1">Reasoning (optional)</label>
                        <input type="text" placeholder="Strong systems thinker, lacks leadership experience..." value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                      </div>
                    </div>
                    <button onClick={submitFeedback} disabled={submitting === 'feedback' || !feedbackScore}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 text-white text-sm rounded-md font-medium">
                      {submitting === 'feedback' ? 'Saving...' : 'Submit Feedback'}
                    </button>
                  </div>
                </>
              )}

              {!selectedCandidate && candidates.length > 0 && (
                <div className="p-8 bg-gray-900 border border-gray-800 rounded-lg text-center text-gray-500 text-sm">
                  Select a candidate from the list to add transcript or feedback.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Agent Flows ──────────────────────────────── */}
      {activeTab === 'agents' && (
        <div className="p-6 max-w-5xl mx-auto">
          <h2 className="text-lg font-semibold text-white mb-6">Agent Processing Pipeline</h2>

          <div className="relative">
            {/* Pipeline visualization */}
            <div className="flex flex-col gap-1">
              {AGENT_PIPELINE.map((agent, i) => (
                <React.Fragment key={agent.id}>
                  <div className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-600 transition-colors">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl ${
                      agent.id === 'index' || agent.id === 'graph'
                        ? 'bg-indigo-900/50 border border-indigo-700'
                        : 'bg-gray-800 border border-gray-700'
                    }`}>
                      {agent.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">{agent.label}</h3>
                        {(agent.id === 'index' || agent.id === 'graph') && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-400 border border-indigo-800">
                            GraphRAG
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{agent.desc}</p>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs px-2 py-1 rounded ${
                        agent.id === 'graph' && graphStats && graphStats.total_nodes > 0
                          ? 'bg-emerald-900/30 text-emerald-400'
                          : 'bg-gray-800 text-gray-500'
                      }`}>
                        {agent.id === 'graph' && graphStats
                          ? `${graphStats.total_nodes} nodes`
                          : 'Ready'}
                      </div>
                    </div>
                  </div>
                  {i < AGENT_PIPELINE.length - 1 && (
                    <div className="flex justify-center">
                      <div className="w-px h-4 bg-gray-700" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Data flow description */}
            <div className="mt-8 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
              <h3 className="text-sm font-semibold text-white mb-3">How Data Flows</h3>
              <div className="grid grid-cols-3 gap-4 text-xs text-gray-400">
                <div>
                  <div className="text-amber-400 font-medium mb-1">1. Ingest</div>
                  <p>ATS adapters (Join.com, Notion, Webhooks) pull candidate data into the pipeline.</p>
                </div>
                <div>
                  <div className="text-blue-400 font-medium mb-1">2. Process</div>
                  <p>Extractor → Scorer → Analyzer agents extract traits, score candidates, and analyze interviews.</p>
                </div>
                <div>
                  <div className="text-indigo-400 font-medium mb-1">3. Graph</div>
                  <p>Indexer builds knowledge graph. Distiller learns from outcomes. Intelligence compounds over time.</p>
                </div>
              </div>
            </div>

            {/* Schema-level stats */}
            {graphStats && (
              <div className="mt-6 grid grid-cols-4 gap-3">
                <StatCard label="Total Nodes" value={graphStats.total_nodes} />
                <StatCard label="Total Edges" value={graphStats.total_edges} />
                <StatCard label="Node Types" value={Object.keys(graphStats.nodes_by_type).length} />
                <StatCard label="Relationship Types" value={Object.keys(graphStats.edges_by_relationship).length} />
              </div>
            )}

            {graphStats && Object.keys(graphStats.nodes_by_type).length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <h4 className="text-xs font-semibold text-gray-400 mb-2">Nodes by Type</h4>
                  <div className="space-y-1">
                    {Object.entries(graphStats.nodes_by_type).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_COLORS[type] || '#6b7280' }} />
                          <span className="text-gray-300 capitalize">{type}</span>
                        </div>
                        <span className="text-gray-500 font-mono">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <h4 className="text-xs font-semibold text-gray-400 mb-2">Edges by Relationship</h4>
                  <div className="space-y-1">
                    {Object.entries(graphStats.edges_by_relationship).sort(([, a], [, b]) => b - a).map(([rel, count]) => (
                      <div key={rel} className="flex justify-between text-xs">
                        <span className="text-gray-300">{rel.replace(/_/g, ' ')}</span>
                        <span className="text-gray-500 font-mono">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Indexing ─────────────────────────────────── */}
      {activeTab === 'indexing' && (
        <div className="p-6 max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Data Indexing</h2>
            <button
              onClick={runIndex}
              disabled={indexing || !selectedSchema}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm rounded-md font-medium"
            >
              {indexing ? 'Indexing... (please wait)' : 'Run Full Reindex'}
            </button>
          </div>

          {/* Stats cards */}
          {graphStats && (
            <div className="grid grid-cols-4 gap-3 mb-6">
              <StatCard label="Graph Nodes" value={graphStats.total_nodes} />
              <StatCard label="Graph Edges" value={graphStats.total_edges} />
              <StatCard label="Entity Types" value={Object.keys(graphStats.nodes_by_type).length} />
              <StatCard label="Connected Adapters" value={adapters.filter(a => a.is_active).length} />
            </div>
          )}

          {/* Connect Data Source */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Connect Data Source</h3>

            {connectResult && (
              <div className={`mb-3 p-3 rounded-lg border text-sm ${
                connectResult.ok
                  ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                  : 'bg-red-950/30 border-red-800 text-red-300'
              }`}>
                {connectResult.message}
              </div>
            )}

            {!connectType ? (
              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => setConnectType('notion')} className="p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-indigo-600 transition-colors text-left group">
                  <div className="text-lg mb-1">&#x1F4D3;</div>
                  <div className="text-sm font-semibold text-white group-hover:text-indigo-300">Notion</div>
                  <p className="text-[11px] text-gray-500 mt-1">Connect a Notion database of candidates. Auto-syncs on poll.</p>
                </button>
                <button onClick={() => setConnectType('webhook')} className="p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-indigo-600 transition-colors text-left group">
                  <div className="text-lg mb-1">&#x1F517;</div>
                  <div className="text-sm font-semibold text-white group-hover:text-indigo-300">Webhook</div>
                  <p className="text-[11px] text-gray-500 mt-1">Receive candidate data via HTTP POST from any ATS or system.</p>
                </button>
                <button onClick={() => setConnectType('api')} className="p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-indigo-600 transition-colors text-left group">
                  <div className="text-lg mb-1">&#x2699;&#xFE0F;</div>
                  <div className="text-sm font-semibold text-white group-hover:text-indigo-300">Direct API</div>
                  <p className="text-[11px] text-gray-500 mt-1">Send candidate CVs directly via the Extract API endpoint.</p>
                </button>
              </div>
            ) : connectType === 'notion' ? (
              <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-white">Connect Notion Database</h4>
                  <button onClick={() => { setConnectType(null); setConnectConfig({}); }} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Notion API Key</label>
                    <input type="password" placeholder="ntn_..." value={connectConfig.notion_api_key || ''} onChange={e => setConnectConfig(c => ({ ...c, notion_api_key: e.target.value }))}
                      className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Database ID</label>
                    <input type="text" placeholder="abc123..." value={connectConfig.notion_db_id || ''} onChange={e => setConnectConfig(c => ({ ...c, notion_db_id: e.target.value }))}
                      className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                    <p className="text-[10px] text-gray-600 mt-1">Found in the Notion database URL after the workspace name</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Name Field</label>
                      <input type="text" placeholder="Name" value={connectConfig.notion_name_field || ''} onChange={e => setConnectConfig(c => ({ ...c, notion_name_field: e.target.value }))}
                        className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Status Field</label>
                      <input type="text" placeholder="Status" value={connectConfig.notion_status_field || ''} onChange={e => setConnectConfig(c => ({ ...c, notion_status_field: e.target.value }))}
                        className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                    </div>
                  </div>
                  <button onClick={connectSource} disabled={connecting || !connectConfig.notion_db_id}
                    className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm rounded-md font-medium">
                    {connecting ? 'Connecting...' : 'Connect Notion'}
                  </button>
                </div>
              </div>
            ) : connectType === 'webhook' ? (
              <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-white">Set Up Webhook</h4>
                  <button onClick={() => { setConnectType(null); setConnectConfig({}); }} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-gray-950 border border-gray-700 rounded-md">
                    <div className="text-[10px] text-gray-500 mb-1">Webhook URL (POST candidates here)</div>
                    <code className="text-sm text-indigo-400 select-all">{typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/join</code>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Name Field</label>
                      <input type="text" placeholder="name" value={connectConfig.wh_name_field || ''} onChange={e => setConnectConfig(c => ({ ...c, wh_name_field: e.target.value }))}
                        className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Resume Text Field</label>
                      <input type="text" placeholder="resume_text" value={connectConfig.wh_text_field || ''} onChange={e => setConnectConfig(c => ({ ...c, wh_text_field: e.target.value }))}
                        className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Role Field</label>
                      <input type="text" placeholder="role" value={connectConfig.wh_role_field || ''} onChange={e => setConnectConfig(c => ({ ...c, wh_role_field: e.target.value }))}
                        className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Webhook Secret (optional)</label>
                    <input type="password" placeholder="Optional secret for HMAC verification" value={connectConfig.wh_secret || ''} onChange={e => setConnectConfig(c => ({ ...c, wh_secret: e.target.value }))}
                      className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                  </div>
                  <button onClick={connectSource} disabled={connecting}
                    className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm rounded-md font-medium">
                    {connecting ? 'Setting up...' : 'Create Webhook Endpoint'}
                  </button>
                </div>
              </div>
            ) : connectType === 'api' ? (
              <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-white">Direct API Integration</h4>
                  <button onClick={() => setConnectType(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                </div>
                <div className="space-y-4">
                  <p className="text-xs text-gray-400">Send candidate data directly via REST API. Each call extracts traits, scores the candidate, and indexes into the knowledge graph automatically.</p>
                  <div className="p-3 bg-gray-950 border border-gray-700 rounded-md">
                    <div className="text-[10px] text-gray-500 mb-2">Extract + Score + Index a Candidate</div>
                    <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre"><code>{`POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/extract
Content-Type: application/json

{
  "schema_id": "${selectedSchema}",
  "subject_id": "candidate-unique-id",
  "role": "AI Engineer",
  "text": "Paste CV or resume text here..."
}`}</code></pre>
                  </div>
                  <div className="p-3 bg-gray-950 border border-gray-700 rounded-md">
                    <div className="text-[10px] text-gray-500 mb-2">Score After Extraction</div>
                    <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre"><code>{`POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/score
Content-Type: application/json

{
  "schema_id": "${selectedSchema}",
  "subject_id": "candidate-unique-id",
  "role": "AI Engineer"
}`}</code></pre>
                  </div>
                  <div className="p-3 bg-gray-950 border border-gray-700 rounded-md">
                    <div className="text-[10px] text-gray-500 mb-2">Submit Interview Transcript + Feedback</div>
                    <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre"><code>{`POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/analyze
Content-Type: application/json

{
  "schema_id": "${selectedSchema}",
  "subject_id": "candidate-unique-id",
  "role": "AI Engineer",
  "text": "Interview transcript text..."
}`}</code></pre>
                  </div>
                  <p className="text-[10px] text-gray-600">All endpoints auto-index into the knowledge graph. No separate indexing step needed.</p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Connected Sources */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Active Connections</h3>
            {adapters.filter(a => a.is_active).length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {adapters.filter(a => a.is_active).map(a => (
                  <div key={a.id} className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${a.is_active ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                        <span className="text-sm font-medium text-gray-200 capitalize">{a.adapter_type}</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        a.is_active ? 'bg-emerald-900/30 text-emerald-400' : 'bg-gray-800 text-gray-500'
                      }`}>
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p>Schema: {a.schema_id}</p>
                      <p>Processed: {a.subjects_processed} subjects</p>
                      {a.last_poll_at && <p>Last poll: {new Date(a.last_poll_at).toLocaleString()}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No active connections yet. Use the cards above to connect a data source.</p>
            )}
          </div>

          {/* Index Jobs History */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Indexing History</h3>
            {indexJobs.length > 0 ? (
              <div className="space-y-2">
                {indexJobs.map(job => (
                  <div key={job.id} className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          job.status === 'completed' ? 'bg-emerald-900/30 text-emerald-400' :
                          job.status === 'running' ? 'bg-blue-900/30 text-blue-400 animate-pulse' :
                          job.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                          'bg-gray-800 text-gray-500'
                        }`}>
                          {job.status}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">{job.job_type.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="text-[10px] text-gray-600">
                        {new Date(job.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 mt-1">
                      <span>{job.subjects_processed} subjects</span>
                      <span>{job.nodes_created} nodes</span>
                      <span>{job.edges_created} edges</span>
                    </div>
                    {job.error_message && (
                      <p className="text-xs text-red-400 mt-1">{job.error_message}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg text-center text-gray-500 text-sm">
                No indexing jobs yet. Click "Run Full Reindex" to build the knowledge graph.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
      <div className="text-2xl font-semibold text-white font-mono">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
