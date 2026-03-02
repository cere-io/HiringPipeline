import { Event, Context, TraitWeights, CandidateScore, CandidateTraits } from './types';

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
        const traitsCubby = context.cubby('hiring-traits');
        const traits: CandidateTraits = traitsCubby.json.get(`/${candidateId}`);
        if (!traits) {
            throw new Error(`Traits not found for candidate ${candidateId}`);
        }

        const metaCubby = context.cubby('hiring-meta');
        let weights: TraitWeights = metaCubby.json.get(`/trait_weights/${role}`);
        
        if (!weights) {
            context.log(`No weights found for ${role}, using defaults`);
            weights = {
                skills: 0.1,
                years_of_experience: 0.1,
                company_stages: 0.1,
                education_level: 0.1,
                schools: 0.1,
                hard_things_done: 0.2,
                hackathons: 0.1,
                open_source_contributions: 0.1,
                company_signals: 0.1
            };
            metaCubby.json.set(`/trait_weights/${role}`, weights);
        }

        // Simple mock scoring based on the new schema
        const scoreSkills = traits.skills.length > 2 ? 10 : 5;
        const scoreYoe = traits.years_of_experience > 4 ? 10 : 5;
        const scoreStages = traits.company_stages.includes('startup') ? 8 : 5;
        const scoreEdu = traits.education_level === 'Bachelors' ? 7 : 5;

        const compositeScore = (
            (scoreSkills * weights.skills) +
            (scoreYoe * weights.years_of_experience) +
            (scoreStages * weights.company_stages) +
            (scoreEdu * weights.education_level) +
            (traits.schools.rating * weights.schools) +
            (traits.hard_things_done.rating * weights.hard_things_done) +
            (traits.hackathons.rating * weights.hackathons) +
            (traits.open_source_contributions.rating * weights.open_source_contributions) +
            (traits.company_signals.rating * weights.company_signals)
        );

        // Update traits with conclusive_score
        traits.conclusive_score = parseFloat(compositeScore.toFixed(2));
        traitsCubby.json.set(`/${candidateId}`, traits);

        const scoreRecord: CandidateScore = {
            id: candidateId,
            composite_score: traits.conclusive_score,
            weights_used: weights,
            timestamp: new Date().toISOString()
        };

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
