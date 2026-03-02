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

    context.log('Starting hiring pipeline for candidate:', candidateId, 'Role:', role);

    try {
        // 1. Extract Traits
        context.log('Step 1: Extracting Traits');
        const traitResult = await context.agents.traitExtractor.extract({
            candidateId, 
            resumeText
        });

        if (traitResult.error) {
            throw new Error(`Trait Extraction failed: ${traitResult.error}`);
        }

        // 2. Score Candidate
        context.log('Step 2: Scoring Candidate');
        const scoreResult = await context.agents.scorer.score({
            candidateId,
            role
        });

        if (scoreResult.error) {
            throw new Error(`Scoring failed: ${scoreResult.error}`);
        }

        context.log('Pipeline completed successfully for candidate:', candidateId);

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
