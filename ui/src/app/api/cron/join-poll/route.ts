import { NextResponse } from 'next/server';
import { getJoinClient } from '@/lib/join-client';
import { conciergeHandle, createContext, logPipelineEvent, mockCubbies } from '@/lib/runtime';
import { supabase } from '@/lib/supabase';
import { extractText } from 'unpdf';
import type { Event, JoinApplication, CandidateStatus } from '@/lib/agents/types';

/**
 * Gets the initialization timestamp. On first run, writes one and returns it.
 * Only applications created AFTER this timestamp will ever be processed.
 */
async function getInitTimestamp(): Promise<{ ts: string; justInitialized: boolean }> {
    const { data } = await supabase
        .from('pipeline_events')
        .select('payload')
        .eq('event_type', 'JOIN_POLL_INIT')
        .limit(1);

    if (data && data.length > 0) {
        return { ts: data[0].payload.initialized_at, justInitialized: false };
    }

    // First run — set watermark to NOW so all existing apps are skipped
    const now = new Date().toISOString();
    await logPipelineEvent(
        `evt-join-init-${Date.now()}`,
        'JOIN_POLL_INIT',
        null,
        { initialized_at: now },
        'join-poll-init'
    );
    console.log(`[JoinPoll] First run — initialized watermark at ${now}. Only new applications will be processed.`);
    return { ts: now, justInitialized: true };
}

/**
 * Returns Join application IDs already processed (for dedup within the valid window).
 */
async function getProcessedJoinAppIds(): Promise<Set<number>> {
    const { data, error } = await supabase
        .from('pipeline_events')
        .select('payload')
        .eq('source', 'join-poll');

    if (error) {
        console.warn('[JoinPoll] Could not read pipeline_events for dedup:', error.message);
        return new Set();
    }

    const ids = new Set<number>();
    for (const row of data || []) {
        const joinId = row.payload?.joinApplicationId;
        if (typeof joinId === 'number') ids.add(joinId);
    }
    return ids;
}

async function extractResumeText(app: JoinApplication): Promise<string> {
    const cvAttachment = app.attachments.find(a => a.type === 'CV');
    if (!cvAttachment) {
        return buildFallbackProfile(app);
    }

    try {
        const client = getJoinClient();
        const pdfBuffer = await client.downloadAttachment(cvAttachment.url);
        const { text } = await extractText(pdfBuffer);
        const fullText = Array.isArray(text) ? text.join('\n\n') : text;

        if (fullText && fullText.trim().length > 50) {
            return fullText;
        }
        return buildFallbackProfile(app);
    } catch (e: any) {
        console.error(`[JoinPoll] PDF extraction failed for app ${app.id}:`, e.message);
        return buildFallbackProfile(app);
    }
}

function buildFallbackProfile(app: JoinApplication): string {
    const parts = [`Candidate: ${app.candidate.firstName} ${app.candidate.lastName}`];
    parts.push(`Applied for: ${app.job.title}`);

    if (app.candidate.country) {
        parts.push(`Location: ${app.candidate.country.name}`);
    }

    const linkedin = app.candidate.professionalLinks?.find(l => l.type === 'LINKEDIN');
    if (linkedin) {
        parts.push(`LinkedIn: ${linkedin.url}`);
    }

    if (app.screeningQuestions?.length > 0) {
        parts.push('Screening answers:');
        for (const q of app.screeningQuestions) {
            if (q.answer && !q.isSkipped) {
                parts.push(`  ${q.question}: ${q.answer}`);
            }
        }
    }

    return parts.join('\n');
}

export async function GET(req: Request) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const batchLimit = parseInt(url.searchParams.get('batch') || '10', 10);

    try {
        const { ts: initTs, justInitialized } = await getInitTimestamp();

        if (justInitialized) {
            return NextResponse.json({
                success: true,
                message: 'Poller initialized. Only applications arriving after this moment will be processed.',
                initialized_at: initTs,
                processed: 0,
            });
        }

        const client = getJoinClient();
        const [applications, processedIds] = await Promise.all([
            client.getRecentApplications(1),
            getProcessedJoinAppIds(),
        ]);

        // Only process apps created AFTER initialization AND not already processed
        const allNewApps = applications.filter(app =>
            new Date(app.createdAt) > new Date(initTs) && !processedIds.has(app.id)
        );
        const newApps = allNewApps.slice(0, batchLimit);

        console.log(`[JoinPoll] Fetched ${applications.length} recent, ${allNewApps.length} new since ${initTs} (processing ${newApps.length}, batch=${batchLimit})`);

        if (newApps.length === 0) {
            return NextResponse.json({ success: true, processed: 0, message: 'No new applications since last poll.' });
        }

        const results: { id: number; candidateId: string; name: string; role: string }[] = [];
        const errors: { id: number; error: string }[] = [];

        for (const app of newApps) {
            try {
                const candidateId = `join-${app.candidate.id}`;
                const role = app.job.title;
                const candidateName = `${app.candidate.firstName} ${app.candidate.lastName}`;
                const resumeText = await extractResumeText(app);

                const eventId = `evt-join-${app.id}-${Date.now()}`;

                await logPipelineEvent(eventId, 'NEW_APPLICATION', candidateId, {
                    role,
                    source: 'join-poll',
                    joinApplicationId: app.id,
                    joinCandidateId: app.candidate.id,
                    candidateName,
                    candidateEmail: app.candidate.email,
                    joinSource: app.source.product,
                    linkedinUrl: app.candidate.professionalLinks?.find(l => l.type === 'LINKEDIN')?.url,
                }, 'join-poll');

                const event: Event = {
                    id: eventId,
                    event_type: 'NEW_APPLICATION',
                    app_id: process.env.NEXT_PUBLIC_DDC_APP_ID || 'ui-app',
                    account_id: 'join-poll',
                    timestamp: new Date().toISOString(),
                    signature: 'sig',
                    context_path: { agent_service: 'hiring', workspace: 'ws-1' },
                    payload: { candidateId, role, resumeText },
                };

                const useRealNode = process.env.NEXT_PUBLIC_USE_REAL_DDC_NODE === 'true';

                if (useRealNode) {
                    const eventRuntimeUrl = process.env.EVENT_RUNTIME_URL || 'https://compute-1.devnet.ddc-dragon.com';
                    await fetch(`${eventRuntimeUrl}/api/v1/events`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(event),
                    });
                } else {
                    const { context } = createContext();
                    await conciergeHandle(event, context);

                    const now = new Date().toISOString();
                    const status: CandidateStatus = {
                        candidate_id: candidateId,
                        role,
                        stage: 'ai_scored',
                        created_at: now,
                        updated_at: now,
                    };
                    await mockCubbies['hiring-status'].json.set(`/${candidateId}`, status);

                    const existingTraits = await mockCubbies['hiring-traits'].json.get(`/${candidateId}`);
                    if (existingTraits) {
                        await mockCubbies['hiring-traits'].json.set(`/${candidateId}`, {
                            ...existingTraits,
                            candidate_name: candidateName,
                            candidate_email: app.candidate.email,
                            role,
                            source: 'join',
                            linkedin_url: app.candidate.professionalLinks?.find(l => l.type === 'LINKEDIN')?.url,
                        });
                    }
                }

                results.push({ id: app.id, candidateId, name: candidateName, role });
                console.log(`[JoinPoll] Processed ${candidateId} (${candidateName}) for ${role}`);
            } catch (e: any) {
                console.error(`[JoinPoll] Error processing app ${app.id}:`, e.message);
                errors.push({ id: app.id, error: e.message });
            }
        }

        return NextResponse.json({
            success: true,
            processed: results.length,
            remaining: allNewApps.length - newApps.length,
            errors: errors.length,
            batchLimit,
            details: { results, errors },
        });
    } catch (e: any) {
        console.error('[JoinPoll] Fatal error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
