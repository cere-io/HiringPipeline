import { Event, Context, CandidateTraits } from '../types';

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
        // In reality, this would be an LLM call:
        // const prompt = `Extract technical_depth, communication, problem_solving, system_design (0-10) and skills from this resume: ${resumeText}`;
        // const result = await context.models.infer('gpt-4', { prompt });
        
        // Mocking a basic text heuristic parser to simulate extracting traits based on keywords
        const textLower = resumeText.toLowerCase();
        
        let techDepth = 5;
        let sysDesign = 3;
        let probSolving = 6;
        let comms = 7;
        const skills: string[] = [];

        if (textLower.includes('architecture') || textLower.includes('scalable') || textLower.includes('microservices')) {
            sysDesign += 5;
            techDepth += 2;
        }

        if (textLower.includes('typescript') || textLower.includes('python') || textLower.includes('rust')) {
            techDepth += 3;
            if (textLower.includes('typescript')) skills.push('TypeScript');
            if (textLower.includes('python')) skills.push('Python');
            if (textLower.includes('rust')) skills.push('Rust');
        }

        if (textLower.includes('led') || textLower.includes('team') || textLower.includes('presented')) {
            comms += 2;
            probSolving += 2;
        }

        const traits: CandidateTraits = {
            id: candidateId,
            technical_depth: Math.min(10, techDepth),
            communication: Math.min(10, comms),
            problem_solving: Math.min(10, probSolving),
            system_design: Math.min(10, sysDesign),
            skills,
            raw_evidence: {
                "tech_depth_evidence": "Found programming languages mentioned in resume.",
                "sys_design_evidence": textLower.includes('scalable') ? "Mentioned scalable systems." : "No explicit system design keywords found."
            }
        };

        // Save to hiring-traits cubby
        const traitsCubby = context.cubby('hiring-traits');
        traitsCubby.json.set(`/${candidateId}`, traits);

        context.log('Successfully extracted traits and saved to hiring-traits cubby');

        return {
            success: true,
            traits
        };
    } catch (error: any) {
        context.log('Error extracting traits:', error.message);
        return { success: false, error: error.message };
    }
}
