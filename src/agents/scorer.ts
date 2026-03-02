import { Event, Context, TraitWeights, CandidateScore } from '../types';

export async function handle(event: Event, context: Context) {
    return score(event.payload, context);
}

export async function score(payload: any, context: Context) {
    const { candidateId, role } = payload;

    if (!candidateId || !role) {
        return { success: false, error: 'Missing candidateId or role' };
    }

    context.log('Scoring candidate:', candidateId, 'for role:', role);

    try {
        // 1. Get traits from hiring-traits
        const traitsCubby = context.cubby('hiring-traits');
        const traits = traitsCubby.json.get(`/${candidateId}`);
        if (!traits) {
            throw new Error(`Traits not found for candidate ${candidateId}`);
        }

        // 2. Get weights from hiring-meta
        const metaCubby = context.cubby('hiring-meta');
        let weights: TraitWeights = metaCubby.json.get(`/trait_weights/${role}`);
        
        // Fallback default weights if none exist yet for this role
        if (!weights) {
            context.log(`No weights found for ${role}, using defaults`);
            weights = {
                technical_depth: 0.25,
                communication: 0.25,
                problem_solving: 0.25,
                system_design: 0.25
            };
            metaCubby.json.set(`/trait_weights/${role}`, weights);
        }

        // 3. Calculate weighted composite score
        const compositeScore = (
            (traits.technical_depth * weights.technical_depth) +
            (traits.communication * weights.communication) +
            (traits.problem_solving * weights.problem_solving) +
            (traits.system_design * weights.system_design)
        );

        const scoreRecord: CandidateScore = {
            id: candidateId,
            composite_score: parseFloat(compositeScore.toFixed(2)),
            weights_used: weights,
            timestamp: new Date().toISOString()
        };

        // 4. Save to hiring-scores cubby
        const scoresCubby = context.cubby('hiring-scores');
        scoresCubby.json.set(`/${candidateId}`, scoreRecord);

        context.log('Successfully scored candidate:', scoreRecord.composite_score);

        return {
            success: true,
            score: scoreRecord
        };
    } catch (error: any) {
        context.log('Error scoring candidate:', error.message);
        return { success: false, error: error.message };
    }
}
