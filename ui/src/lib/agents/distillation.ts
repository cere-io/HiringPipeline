import { Event, Context, TraitWeights, CandidateTraits } from './types';

export async function handle(event: Event, context: Context) {
    return distill(event.payload, context);
}

export async function distill(payload: any, context: Context) {
    const { candidateId, role, outcome } = payload;

    if (!candidateId || !role || !outcome) {
        return { success: false, error: 'Missing candidateId, role, or outcome' };
    }

    context.log('Distilling outcome for candidate:', candidateId, 'Outcome:', outcome);

    try {
        const traitsCubby = context.cubby('hiring-traits');
        const metaCubby = context.cubby('hiring-meta');
        const outcomesCubby = context.cubby('hiring-outcomes');

        outcomesCubby.json.set(`/${candidateId}`, { outcome, timestamp: new Date().toISOString() });

        const traits: CandidateTraits = traitsCubby.json.get(`/${candidateId}`);
        if (!traits) {
            throw new Error('Cannot update weights: Traits not found for candidate');
        }

        let weights: TraitWeights = metaCubby.json.get(`/trait_weights/${role}`);
        if (!weights) {
            weights = {
                skills: 0.1, years_of_experience: 0.1, company_stages: 0.1, education_level: 0.1, schools: 0.1, hard_things_done: 0.2, hackathons: 0.1, open_source_contributions: 0.1, company_signals: 0.1
            };
        }

        const LEARNING_RATE = 0.05;

        if (outcome === 'Hired_Performing_Well') {
            context.log('Candidate succeeded. Adjusting weights towards their strengths.');
            
            const scoreSkills = traits.skills.length > 2 ? 10 : 5;
            const scoreYoe = traits.years_of_experience > 4 ? 10 : 5;
            const scoreStages = traits.company_stages.includes('startup') ? 8 : 5;
            const scoreEdu = traits.education_level === 'Bachelors' ? 7 : 5;
            
            const totalScore = scoreSkills + scoreYoe + scoreStages + scoreEdu + traits.schools.rating + traits.hard_things_done.rating + traits.hackathons.rating + traits.open_source_contributions.rating + traits.company_signals.rating;
            
            if (totalScore > 0) {
                weights.skills = (weights.skills * (1 - LEARNING_RATE)) + ((scoreSkills / totalScore) * LEARNING_RATE);
                weights.years_of_experience = (weights.years_of_experience * (1 - LEARNING_RATE)) + ((scoreYoe / totalScore) * LEARNING_RATE);
                weights.company_stages = (weights.company_stages * (1 - LEARNING_RATE)) + ((scoreStages / totalScore) * LEARNING_RATE);
                weights.education_level = (weights.education_level * (1 - LEARNING_RATE)) + ((scoreEdu / totalScore) * LEARNING_RATE);
                weights.schools = (weights.schools * (1 - LEARNING_RATE)) + ((traits.schools.rating / totalScore) * LEARNING_RATE);
                weights.hard_things_done = (weights.hard_things_done * (1 - LEARNING_RATE)) + ((traits.hard_things_done.rating / totalScore) * LEARNING_RATE);
                weights.hackathons = (weights.hackathons * (1 - LEARNING_RATE)) + ((traits.hackathons.rating / totalScore) * LEARNING_RATE);
                weights.open_source_contributions = (weights.open_source_contributions * (1 - LEARNING_RATE)) + ((traits.open_source_contributions.rating / totalScore) * LEARNING_RATE);
                weights.company_signals = (weights.company_signals * (1 - LEARNING_RATE)) + ((traits.company_signals.rating / totalScore) * LEARNING_RATE);
            }
        }

        // Normalize weights
        const wSum = Object.values(weights).reduce((a, b) => a + b, 0);
        for (const k in weights) {
            (weights as any)[k] /= wSum;
        }

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
