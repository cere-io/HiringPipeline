import { Event, Context, CandidateProfile, JobDetails } from '../types';

export async function handle(event: Event, context: Context) {
    return execute(event.payload, context);
}

export async function execute(payloadData: any, context: Context) {
    const { action, payload } = payloadData;

    if (!action) {
        return { success: false, error: 'Missing action in payload' };
    }

    const candidatesCubby = context.cubby('candidates');
    const jobsCubby = context.cubby('jobs');

    try {
        switch (action) {
            case 'init': {
                // Initialize vector indices
                candidatesCubby.vector.createIndex();
                jobsCubby.vector.createIndex();
                context.log('Initialized vector indices for candidates and jobs');
                return { success: true };
            }

            case 'saveCandidate': {
                const { id, profile, embedding } = payload as { id: string, profile: CandidateProfile, embedding: number[] };
                
                // Save JSON profile
                candidatesCubby.json.set(`/candidates/${id}`, profile);
                
                // Save Vector embedding
                candidatesCubby.vector.add(id, embedding, { status: 'new' });
                
                context.log('Saved candidate:', id);
                return { success: true };
            }

            case 'saveJob': {
                const { id, jobDetails, embedding } = payload as { id: string, jobDetails: JobDetails, embedding: number[] };
                
                // Save JSON job details
                jobsCubby.json.set(`/jobs/${id}`, jobDetails);
                
                // Save Vector embedding
                jobsCubby.vector.add(id, embedding, { department: jobDetails.department });
                
                context.log('Saved job:', id);
                return { success: true };
            }

            case 'findMatchingJobs': {
                const { embedding, k = 5 } = payload as { embedding: number[], k?: number };
                
                // Search for matching jobs
                const matches = jobsCubby.vector.search(embedding, { k });
                
                // Retrieve full job details for the matches
                const matchedJobs = matches.map(match => {
                    const jobDetails = jobsCubby.json.get(`/jobs/${match.id}`);
                    return {
                        ...match,
                        jobDetails
                    };
                });
                
                context.log(`Found ${matches.length} matching jobs`);
                return { success: true, matches: matchedJobs };
            }

            default:
                return { success: false, error: `Unknown action: ${action}` };
        }
    } catch (error: any) {
        context.log(`Error executing action ${action}:`, error.message);
        return { success: false, error: error.message };
    }
}
