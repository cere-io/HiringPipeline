import { Event, Context, NewApplicationPayload } from '../types';

export async function handle(event: Event, context: Context) {
    const { event_type, payload } = event;

    if (event_type !== 'NEW_APPLICATION') {
        return { success: false, error: `Unsupported event type: ${event_type}` };
    }

    const { candidateId, resumeText, role } = payload as NewApplicationPayload;

    if (!candidateId || !resumeText || !role) {
        return { success: false, error: 'Missing candidateId, resumeText, or role' };
    }

    context.log('[CONCIERGE] NEW_APPLICATION received → dispatching to child agents');
    context.log('[CONCIERGE] Candidate:', candidateId, '| Role:', role);

    try {
        // 1. Extract Traits
        context.log('[CONCIERGE] → invoking TraitExtractor agent');
        const traitResult = await context.agents.traitExtractor.extract({
            candidateId, 
            resumeText,
            role
        });

        if (traitResult.error) {
            throw new Error(`Trait Extraction failed: ${traitResult.error}`);
        }

        context.log('[CONCIERGE] TraitExtractor complete → invoking Scorer agent');
        const scoreResult = await context.agents.scorer.score({
            candidateId,
            role
        });

        if (scoreResult.error) {
            throw new Error(`Scoring failed: ${scoreResult.error}`);
        }

        context.log('[CONCIERGE] Scorer complete → pipeline finished for', candidateId);

        return {
            success: true,
            candidateId,
            traits: traitResult.value.traits,
            score: scoreResult.value.score
        };

    } catch (error: any) {
        context.log('Pipeline failed:', error.message);
        return { success: false, error: error.message };
    }
}
