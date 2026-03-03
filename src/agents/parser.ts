import { Event, Context, CandidateProfile } from '../types';

export async function handle(event: Event, context: Context) {
    // Default handler just routes to parse
    return parse(event.payload, context);
}

export async function parse(payload: any, context: Context) {
    const { resumeText, candidateId } = payload;

    if (!resumeText || !candidateId) {
        return { success: false, error: 'Missing resumeText or candidateId' };
    }

    context.log('Parsing resume for candidate:', candidateId);

    try {
        // Mocked extraction for PoC
        const parsedProfile: Partial<CandidateProfile> = {
            id: candidateId,
            name: "John Doe",
            email: "john.doe@example.com",
            skills: ["TypeScript", "Node.js", "React", "Python"],
            experience: "5 years of software engineering experience...",
            education: "B.S. in Computer Science"
        };

        // Mocked embedding
        const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);

        context.log('Successfully parsed resume and generated embedding');

        return {
            success: true,
            profile: parsedProfile,
            embedding: embedding
        };
    } catch (error: any) {
        context.log('Error parsing resume:', error.message);
        return { success: false, error: error.message };
    }
}
