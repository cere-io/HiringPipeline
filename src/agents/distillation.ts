import { Event, Context, TraitWeights } from '../types';

export async function handle(event: Event, context: Context) {
    return distill(event.payload, context);
}

export async function distill(payload: any, context: Context) {
    const { candidateId, role, outcome } = payload;
    // outcome could be: "Hired_Performing_Well" (+ signal), "Hired_Underperforming" (- signal), "Rejected_In_Interview"

    if (!candidateId || !role || !outcome) {
        return { success: false, error: 'Missing candidateId, role, or outcome' };
    }

    context.log('Distilling outcome for candidate:', candidateId, 'Outcome:', outcome);

    try {
        const traitsCubby = context.cubby('hiring-traits');
        const metaCubby = context.cubby('hiring-meta');
        const outcomesCubby = context.cubby('hiring-outcomes');

        // Save raw outcome
        outcomesCubby.json.set(`/${candidateId}`, { outcome, timestamp: new Date().toISOString() });

        // Retrieve traits
        const traits = traitsCubby.json.get(`/${candidateId}`);
        if (!traits) {
            throw new Error('Cannot update weights: Traits not found for candidate');
        }

        // Retrieve current weights
        let weights: TraitWeights = metaCubby.json.get(`/trait_weights/${role}`);
        if (!weights) {
            weights = { technical_depth: 0.25, communication: 0.25, problem_solving: 0.25, system_design: 0.25 };
        }

        // --- Simulated "Compound Intelligence" Logic ---
        // If a candidate was hired and performed well, we want to look at their strongest traits
        // and slightly increase those weights for the role.
        const LEARNING_RATE = 0.05;

        if (outcome === 'Hired_Performing_Well') {
            context.log('Candidate succeeded. Adjusting weights towards their strengths.');
            const totalScore = traits.technical_depth + traits.communication + traits.problem_solving + traits.system_design;
            
            if (totalScore > 0) {
                // Determine what fraction of their score came from each trait
                const techShare = traits.technical_depth / totalScore;
                const commsShare = traits.communication / totalScore;
                const probShare = traits.problem_solving / totalScore;
                const sysShare = traits.system_design / totalScore;

                // Move weights slightly towards this successful profile
                weights.technical_depth = (weights.technical_depth * (1 - LEARNING_RATE)) + (techShare * LEARNING_RATE);
                weights.communication = (weights.communication * (1 - LEARNING_RATE)) + (commsShare * LEARNING_RATE);
                weights.problem_solving = (weights.problem_solving * (1 - LEARNING_RATE)) + (probShare * LEARNING_RATE);
                weights.system_design = (weights.system_design * (1 - LEARNING_RATE)) + (sysShare * LEARNING_RATE);
            }
        } else if (outcome === 'Hired_Underperforming') {
            context.log('Candidate underperformed. Penalizing their strong traits in weights.');
            // Implement negative feedback... (simplified for PoC)
            // Just shifting towards a more balanced baseline if we made a mistake
            weights.technical_depth = (weights.technical_depth * (1 - LEARNING_RATE)) + (0.25 * LEARNING_RATE);
            weights.communication = (weights.communication * (1 - LEARNING_RATE)) + (0.25 * LEARNING_RATE);
            weights.problem_solving = (weights.problem_solving * (1 - LEARNING_RATE)) + (0.25 * LEARNING_RATE);
            weights.system_design = (weights.system_design * (1 - LEARNING_RATE)) + (0.25 * LEARNING_RATE);
        }

        // Normalize weights to sum to 1.0
        const wSum = weights.technical_depth + weights.communication + weights.problem_solving + weights.system_design;
        weights.technical_depth /= wSum;
        weights.communication /= wSum;
        weights.problem_solving /= wSum;
        weights.system_design /= wSum;

        // Save updated weights back to hiring-meta
        metaCubby.json.set(`/trait_weights/${role}`, weights);

        context.log('Weights updated for role:', role);
        context.log('New Weights:', weights);

        return {
            success: true,
            new_weights: weights
        };

    } catch (error: any) {
        context.log('Error in distillation:', error.message);
        return { success: false, error: error.message };
    }
}
