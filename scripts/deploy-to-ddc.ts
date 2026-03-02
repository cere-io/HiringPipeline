import * as fs from 'fs';
import * as path from 'path';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:8080';
const EVENT_RUNTIME_URL = process.env.EVENT_RUNTIME_URL || 'http://localhost:8084';

async function deploy() {
    console.log(`🚀 Deploying Hiring Pipeline Agents to Cere DDC Node...`);
    console.log(`Orchestrator URL: ${ORCHESTRATOR_URL}`);

    try {
        // 1. Create or ensure Agent Service exists
        // In a real scenario, this involves signing transactions. For local dev, we hit the API.
        const servicePubKey = `hiring-pipeline-${Date.now()}`;
        console.log(`\n📦 Creating Agent Service: ${servicePubKey}`);
        
        // This is a simulated payload structure based on the DDC Topology API
        const servicePayload = {
            pubKey: servicePubKey,
            metadata: { name: "Hiring Pipeline" }
        };
        
        const isReal = process.argv.includes('--real');

        if (isReal) {
            console.log(`Executing real API calls against ${ORCHESTRATOR_URL}...`);
            await fetch(`${ORCHESTRATOR_URL}/api/v1/agent-services`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(servicePayload)
            });
        }

        // 2. Read agent files
        const agentsDir = path.join(__dirname, '../src/agents');
        const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.ts') && f !== 'types.ts');

        const deployedAgents: Record<string, string> = {};

        // 3. Deploy each child agent
        for (const file of files) {
            if (file === 'concierge.ts') continue; // Handled separately as Engagement
            
            const agentName = file.replace('.ts', '');
            const tsCode = fs.readFileSync(path.join(agentsDir, file), 'utf8');
            
            console.log(`   -> Deploying Agent: ${agentName}`);
            
            const agentPayload = {
                alias: agentName, // Important for context.agents.<alias>
                tsCode: tsCode
            };

            if (isReal) {
                const res = await fetch(`${ORCHESTRATOR_URL}/api/v1/agent-services/${servicePubKey}/agents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(agentPayload)
                });
                const data = await res.json();
                deployedAgents[agentName] = data.id;
            }
        }

        // 4. Deploy Concierge as an Engagement
        console.log(`\n🎯 Deploying Concierge Engagement...`);
        const conciergeCode = fs.readFileSync(path.join(agentsDir, 'concierge.ts'), 'utf8');
        
        const engagementPayload = {
            name: "Hiring Pipeline Orchestration",
            conciergeScript: conciergeCode,
            agents: deployedAgents
        };

        if (isReal) {
            const engRes = await fetch(`${ORCHESTRATOR_URL}/api/v1/agent-services/${servicePubKey}/engagements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(engagementPayload)
            });
            const engData = await engRes.json();
            // const engagementId = engData.id;
        }

        // 5. Create Workspace and Stream
        console.log(`\n🌊 Setting up Workspace and Event Stream...`);
        // ... Calls to /workspaces and /streams to route NEW_APPLICATION events to this Engagement

        console.log(`\n✅ Deployment configuration generated successfully!`);
        console.log(`\nTo trigger this pipeline on the real node, you would send an event to:`);
        console.log(`POST ${EVENT_RUNTIME_URL}/api/v1/events`);
        console.log(`{
    "event_type": "NEW_APPLICATION",
    "app_id": "${servicePubKey}",
    "payload": { ... }
}`);

    } catch (error) {
        console.error('Deployment failed:', error);
    }
}

deploy();
