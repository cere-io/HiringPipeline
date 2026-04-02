import { NextResponse } from 'next/server';
import { getCI, getStorage, getExperimentTracker } from '@/lib/compound-intelligence/runtime';
import { NotionClient, extractTitle, extractRichText, extractSelect, extractUrl } from '@/lib/adapters/notion/client';
import { parseAllComments, bestEvaluation } from '@/lib/adapters/notion/comment-parser';
import { extractText } from 'unpdf';
import type { ExtractedTraits } from '@/lib/compound-intelligence/types';

async function downloadAndExtractPdf(fileUrl: string): Promise<string> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  const { text } = await extractText(buffer);
  return Array.isArray(text) ? text.join('\n\n') : text;
}

function getFilesUrls(prop: any): string[] {
  if (!prop || prop.type !== 'files') return [];
  return (prop.files || []).map((f: any) => {
    if (f.type === 'file') return f.file?.url;
    if (f.type === 'external') return f.external?.url;
    return null;
  }).filter(Boolean);
}

function getStatus(prop: any): string {
  if (!prop) return '';
  if (prop.type === 'status') return prop.status?.name || '';
  if (prop.type === 'select') return prop.select?.name || '';
  return '';
}

function statusToDecision(status: string): 'hired' | 'rejected' | 'pending' {
  const lower = status.toLowerCase();
  if (lower.includes('hired') || lower.includes('offer')) return 'hired';
  if (lower.includes('reject') || lower.includes('archived') || lower.includes('declined') || lower.includes('withdrawn')) return 'rejected';
  return 'pending';
}

export async function POST(req: Request) {
  try {
    const ci = getCI();
    const storage = getStorage();
    const tracker = getExperimentTracker();
    const { adapter_id, limit } = await req.json();

    if (!adapter_id) {
      return NextResponse.json({ success: false, error: 'Missing adapter_id' }, { status: 400 });
    }

    const conn = await storage.getAdapterConnection(adapter_id);
    if (!conn) {
      return NextResponse.json({ success: false, error: 'Adapter not found' }, { status: 404 });
    }

    const schema = await ci.schemas.get(conn.schema_id);
    if (!schema) {
      return NextResponse.json({ success: false, error: 'Schema not found' }, { status: 404 });
    }

    const token = conn.config?.token || process.env.NOTION_API_KEY;
    const dbId = conn.config?.database_id;
    const client = new NotionClient(token);
    const maxProcess = Math.min(limit || 5, 10);

    const dbResult = await client.queryDatabase(dbId);
    const pages = dbResult.results || [];

    if (pages.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: 'No pages in database' });
    }

    const results: any[] = [];
    const skipped: any[] = [];
    let processed = 0;

    for (const page of pages) {
      if (processed >= maxProcess) break;

      const props = page.properties;
      const subjectId = `notion-${page.id.replace(/-/g, '')}`;

      // DEDUP: skip if already processed
      const existing = await storage.getTraits(schema.id, subjectId);
      if (existing) {
        skipped.push({ name: existing.subject_name || subjectId, reason: 'already processed' });
        continue;
      }

      // Extract name from title property
      let name = 'Unknown';
      for (const [, val] of Object.entries(props) as [string, any][]) {
        if (val.type === 'title') { name = extractTitle(val) || 'Unknown'; break; }
      }

      // Extract role
      const roleProp = Object.entries(props).find(([k]) => k.toLowerCase() === 'role');
      const role = roleProp ? (extractSelect(roleProp[1]) || extractRichText(roleProp[1]) || 'general') : 'general';

      // Extract status
      const statusProp = Object.entries(props).find(([k]) => k.toLowerCase() === 'status');
      const notionStatus = statusProp ? getStatus(statusProp[1]) : '';

      // Extract linkedin
      const linkedinProp = Object.entries(props).find(([k]) => k.toLowerCase().includes('linkedin'));
      const linkedin = linkedinProp ? (extractUrl(linkedinProp[1]) || extractRichText(linkedinProp[1]) || '') : '';

      // Build text from ALL text-containing properties
      const textParts: string[] = [`Candidate: ${name}`, `Role: ${role}`];
      for (const [key, val] of Object.entries(props) as [string, any][]) {
        if (val.type === 'rich_text') {
          const txt = extractRichText(val);
          if (txt.trim()) textParts.push(`${key}: ${txt}`);
        }
        if (val.type === 'select' && val.select?.name) textParts.push(`${key}: ${val.select.name}`);
        if (val.type === 'status' && val.status?.name) textParts.push(`${key}: ${val.status.name}`);
        if (val.type === 'url' && val.url) textParts.push(`${key}: ${val.url}`);
      }

      // Download and extract PDF resume
      let hasResume = false;
      const resumeProp = Object.entries(props).find(([k]) => k.toLowerCase() === 'resume');
      if (resumeProp) {
        const fileUrls = getFilesUrls(resumeProp[1]);
        if (fileUrls.length > 0) {
          try {
            const pdfText = await downloadAndExtractPdf(fileUrls[0]);
            if (pdfText.trim().length > 20) {
              textParts.push(`\nResume Content:\n${pdfText}`);
              hasResume = true;
            }
          } catch {
            skipped.push({ name, role, reason: 'PDF download failed' });
            continue;
          }
        }
      }

      // Extract Gemini Notes from Meeting if available
      let geminiNotes = '';
      const geminiNotesProp = Object.entries(props).find(([k]) => k.toLowerCase().includes('gemini notes'));
      if (geminiNotesProp) {
        geminiNotes = extractRichText(geminiNotesProp[1]) || '';
        if (geminiNotes.trim()) textParts.push(`\nGemini Meeting Notes:\n${geminiNotes}`);
      }

      // Extract Human Score if available
      let humanScore: number | null = null;
      const humanScoreProp = Object.entries(props).find(([k]) => k.toLowerCase() === 'human score');
      if (humanScoreProp) {
        const val = (humanScoreProp[1] as any);
        if (val.type === 'number' && val.number != null) humanScore = val.number;
      }

      // Extract AI Score if available
      let aiScore: number | null = null;
      const aiScoreProp = Object.entries(props).find(([k]) => k.toLowerCase() === 'ai score');
      if (aiScoreProp) {
        const val = (aiScoreProp[1] as any);
        if (val.type === 'number' && val.number != null) aiScore = val.number;
      }

      const fullText = textParts.join('\n');

      if (!hasResume && fullText.trim().length < 100) {
        skipped.push({ name, role, reason: `No resume, only ${fullText.trim().length} chars` });
        continue;
      }

      // Extract traits + score
      try {
        const traits = await ci.extract({ schema, subjectId, text: fullText, role });

        // Fetch and parse Notion comments as human evaluator feedback
        let commentEvaluations: { author: string; score: number | null; verdict: 'positive' | 'negative' | 'neutral'; reasoning: string; strengths: string[]; risks: string[] }[] = [];
        try {
          const rawComments = await client.getPageComments(page.id);
          if (rawComments.length > 0) {
            const parsed = parseAllComments(rawComments);
            commentEvaluations = parsed.map(e => ({
              author: e.author,
              score: e.score,
              verdict: e.verdict,
              reasoning: e.reasoning,
              strengths: e.strengths,
              risks: e.risks,
            }));
          }
        } catch {}

        const enrichedTraits: ExtractedTraits = {
          ...traits,
          subject_name: name,
          subject_meta: {
            notionStatus, linkedin, notionPageId: page.id, source: 'notion',
            humanScore, aiScore,
            evaluations: commentEvaluations.length > 0 ? commentEvaluations : undefined,
          },
        };
        await storage.saveTraits(enrichedTraits);

        const score = await ci.score({ schema, subjectId, role, traits: enrichedTraits });

        // If Gemini Notes exist, auto-analyze them as interview data
        if (geminiNotes.trim().length > 50) {
          try {
            await ci.analyze({ schema, subjectId, text: geminiNotes, role });
          } catch {}
        }

        // Distill from Notion comments (each evaluator's feedback feeds the learning loop)
        let commentDistilled = 0;
        for (const ev of commentEvaluations) {
          if (ev.score != null && ev.score > 0) {
            try {
              const reasons = [
                ...ev.strengths,
                ...ev.risks.map(r => `RISK: ${r}`),
              ];
              await ci.distill({
                schema, subjectId, role,
                outcome: ev.score,
                feedback: ev.reasoning,
                reasons: reasons.length > 0 ? reasons : undefined,
                source: 'notion',
              });
              commentDistilled++;
            } catch {}
          }
        }

        // Fallback: if no comment had a score but humanScore property exists, use that
        if (commentDistilled === 0 && humanScore != null && humanScore > 0) {
          try {
            const best = commentEvaluations.length > 0 ? commentEvaluations[commentEvaluations.length - 1] : null;
            const reasons = best ? [...best.strengths, ...best.risks.map(r => `RISK: ${r}`)] : undefined;
            await ci.distill({
              schema, subjectId, role,
              outcome: humanScore,
              feedback: best?.reasoning,
              reasons: reasons && reasons.length > 0 ? reasons : undefined,
              source: 'notion',
            });
          } catch {}
        }

        // Auto-record experiment
        const decision = statusToDecision(notionStatus);
        await tracker.recordRun({
          schemaId: schema.id,
          subjectId,
          adapterSource: 'notion',
          aiScore: score.composite_score,
          humanDecision: decision,
        });

        results.push({
          subjectId, name, role,
          score: score.composite_score,
          reasoning: score.reasoning,
          status: notionStatus,
          decision,
          commentsFound: commentEvaluations.length,
          commentDistilled,
        });
        processed++;
      } catch (e: any) {
        skipped.push({ name, role, reason: e.message?.slice(0, 100) });
      }
    }

    // Run pattern discovery after batch
    let patternCount = 0;
    let patternError = '';
    if (processed > 0) {
      try {
        const patterns = await ci.discoverPatterns(schema);
        patternCount = patterns.length;
      } catch (e: any) {
        patternError = e.message?.slice(0, 200) || 'unknown';
        console.error('[PATTERN] Discovery failed:', patternError);
      }
    }

    await storage.updateAdapterConnection(conn.id, {
      last_poll_at: new Date().toISOString(),
      subjects_processed: (conn.subjects_processed || 0) + processed,
    });

    return NextResponse.json({
      success: true,
      processed,
      skipped_count: skipped.length,
      total_in_source: pages.length,
      patterns_discovered: patternCount,
      pattern_error: patternError || undefined,
      results,
      skipped: skipped.slice(0, 10),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const storage = getStorage();
    const connections = await storage.listAdapterConnections();
    const activeNotion = connections.filter(c => c.is_active && c.adapter_type === 'notion');

    if (activeNotion.length === 0) {
      return NextResponse.json({ success: true, message: 'No active adapters to poll', processed: 0 });
    }

    let totalProcessed = 0;
    for (const conn of activeNotion) {
      const res = await fetch(`${req.url.split('/api/')[0]}/api/v1/adapters/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapter_id: conn.id, limit: 5 }),
      });
      const data = await res.json();
      totalProcessed += data.processed || 0;
    }

    return NextResponse.json({ success: true, processed: totalProcessed });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
