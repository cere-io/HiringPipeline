# Spec: DDC Node Compound Intelligence PoC

**Status:** Completed
**Owner:** Martijn
**Context:** This specification outlines the architecture, data model, and local testing strategy for porting the `HR-2026-E2E` hiring pipeline into the Cere DDC Network (Agent Runtime + Cubbies).

## 1. Objective
Demonstrate that the Cere DDC Network's `Agent Runtime` and `Redis Stack Cubbies` can support a "Compound Intelligence" feedback loop, where downstream outcomes automatically adjust the algorithmic scoring weights of incoming candidates.

## 2. Architecture

### 2.1 Agents
The system is built on the **Goal-Directed Multi-Agent Flow** exactly as specified in the `ddc-node` documentation. 

*   `Concierge`: The root orchestrator. It receives the `NEW_APPLICATION` event and triggers child agents.
*   `Trait Extractor`: Receives raw text, extracts a 9-dimensional trait schema, and persists to the `hiring-traits` cubby.
*   `Scorer`: Reads traits from `hiring-traits`, reads role weights from `hiring-meta`, computes a composite score, and persists to `hiring-scores`.
*   `Distillation`: Triggered by an `OUTCOME_RECORDED` event (e.g. "Hired_Performing_Well"). Reads the candidate's original traits and nudges the role's global weights in `hiring-meta` to favor the candidate's strongest traits.

### 2.2 Shared Memory (Cubbies)
Because agents run in isolated V8 environments, state is strictly shared via the Context API (`context.cubby`).

*   `hiring-traits`: Stores `CandidateTraits`
*   `hiring-scores`: Stores `CandidateScore` 
*   `hiring-outcomes`: Stores final human feedback (3-month outcomes).
*   `hiring-meta`: Stores the dynamic `TraitWeights` per role.

## 3. Data Model (`CandidateTraits`)
*   `skills`: string[]
*   `years_of_experience`: number
*   `company_stages`: string[]
*   `education_level`: string
*   `schools`: { items: string[], rating: number }
*   `hard_things_done`: { items: string[], rating: number }
*   `hackathons`: { items: string[], rating: number }
*   `open_source_contributions`: { items: string[], rating: number }
*   `company_signals`: { items: string[], rating: number }

## 4. Local Execution & UI
Due to a broken dependency (`cerebellum-network/ddc-dac`) in the `ddc-node` `dev` branch preventing local Docker execution, a Next.js UI was built to simulate the orchestrator.

The Next.js UI (`/ui`) runs the native Agent TypeScript code using an in-memory `mockCubby` that perfectly replicates the `context.cubby.json.set` interface. The UI visualizes the pipeline execution logs and the shifting weights in real-time.

## 5. Deployment
A deployment script (`scripts/deploy-to-ddc.ts`) is included. Once the `ddc-node` dependency is fixed by the core team, running this script will push the Agent files and Engagement configuration directly to the physical DDC Orchestrator via the Topology API.
