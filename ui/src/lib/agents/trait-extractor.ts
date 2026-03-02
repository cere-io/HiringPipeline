import { Event, Context, CandidateTraits } from './types';

export async function handle(event: Event, context: Context) {
    return extract(event.payload, context);
}

export async function extract(payload: any, context: Context) {
    const { candidateId, resumeText } = payload;

    if (!resumeText || !candidateId) {
        return { success: false, error: 'Missing resumeText or candidateId' };
    }

    context.log('Extracting traits for candidate:', candidateId);

    try {
        const textLower = resumeText.toLowerCase();
        
        const skills: string[] = [];
        let yoe = 0;
        let hackathonRating = 0;
        let osRating = 0;
        const hardThings: string[] = [];
        let htRating = 0;

        if (textLower.includes('typescript')) skills.push('TypeScript');
        if (textLower.includes('python')) skills.push('Python');
        if (textLower.includes('rust')) skills.push('Rust');
        
        if (textLower.includes('years') || textLower.includes('yoe')) {
            yoe = 5; // Mock extraction
        }

        if (textLower.includes('hackathon')) {
            hackathonRating = 8;
        }

        if (textLower.includes('open source') || textLower.includes('github')) {
            osRating = 7;
        }

        if (textLower.includes('scalable architecture') || textLower.includes('microservices')) {
            hardThings.push('Built highly scalable microservices architecture');
            htRating = 9;
        }

        const traits: CandidateTraits = {
            candidate_id: candidateId,
            skills,
            years_of_experience: yoe,
            company_stages: textLower.includes('startup') ? ['startup'] : ['public'],
            education_level: textLower.includes('b.s.') || textLower.includes('bachelor') ? 'Bachelors' : 'None',
            schools: { items: ['State University'], rating: 6 },
            hard_things_done: { items: hardThings, rating: htRating },
            hackathons: { items: hackathonRating > 0 ? ['Global Hackathon'] : [], rating: hackathonRating },
            open_source_contributions: { items: osRating > 0 ? ['React contribution'] : [], rating: osRating },
            company_signals: { items: ['Google'], rating: 8 },
            conclusive_score: 0, // Will be computed by scorer or left 0
            source_completeness: { has_resume: true, has_linkedin: false },
            extracted_at: new Date().toISOString()
        };

        const traitsCubby = context.cubby('hiring-traits');
        traitsCubby.json.set(`/${candidateId}`, traits);

        context.log('Successfully extracted traits and saved to hiring-traits cubby');

        return { success: true, traits };
    } catch (error: any) {
        context.log('Error extracting traits:', error.message);
        return { success: false, error: error.message };
    }
}
