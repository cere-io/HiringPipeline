# Feature Specification: OpenClaw Slack Connector

**Feature Branch**: `004-openclaw-slack`  
**Created**: 2026-03-03  
**Status**: Draft  
**Input**: User description: "Phase 3: Connect the DDC hiring pipeline to Slack using OpenClaw as the interface agent. Recruiters will be able to query candidate status and submit feedback via chat."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Query Candidate (Priority: P1)

As a recruiter in Slack, I want to query the pipeline for a candidate's status so that I can see their AI scores and traits without leaving my workflow.

**Why this priority**: The primary use case for an interface agent is providing read access to the underlying infrastructure data in natural language.

**Independent Test**: Send a Slack message "@HiringBot how did candidate join-8841 do?" -> Verify OpenClaw fetches data from the DDC Cubbies via the API and returns a coherent summary of the candidate's traits, AI composite score, and interview analysis (if present).

**Acceptance Scenarios**:

1. **Given** a candidate has been fully processed by the pipeline, **When** the recruiter asks for their status in Slack, **Then** OpenClaw responds with their composite score, top traits, and a brief summary.
2. **Given** a candidate ID that does not exist in the cubbies, **When** the recruiter queries it, **Then** OpenClaw politely informs them the candidate was not found.

---

### User Story 2 - Submit Human Review (Priority: P1)

As a recruiter in Slack, I want to submit my human review score (1-10) directly via chat so that I can provide feedback to the Compound Intelligence loop seamlessly.

**Why this priority**: Closing the feedback loop is the core value proposition of the system. Allowing recruiters to do this via chat (OpenClaw) proves the "Personal AI -> Sovereign AI" architecture.

**Independent Test**: Send a Slack message "@HiringBot log a 4/10 score for join-8841. Poor fit." -> Verify OpenClaw calls the distillation webhook and the pipeline's role weights shift in the hiring-meta cubby.

**Acceptance Scenarios**:

1. **Given** a processed candidate, **When** a recruiter specifies a score (e.g., "rate them 8/10") in Slack, **Then** OpenClaw routes this intent to the `/api/distill` endpoint and confirms the update in chat.

---

### Edge Cases

- What happens when a candidate is queried but only partially processed (e.g. traits exist, but interview doesn't)? The API should return whatever is available and OpenClaw should summarize just that data.
- What happens if the recruiter gives a non-numeric score (e.g. "they were great")? OpenClaw's prompt should instruct it to ask for a specific 1-10 rating before submitting to the pipeline.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a `GET /api/candidates/[candidateId]` endpoint that aggregates data from `hiring-traits`, `hiring-scores`, and `hiring-interviews` cubbies.
- **FR-002**: The `/api/distill` endpoint MUST accept human feedback scores routed from OpenClaw.
- **FR-003**: System MUST provide an OpenClaw skill definition (`.md` or `.yaml`) containing the tools to hit these endpoints.
- **FR-004**: The OpenClaw skill MUST include a system prompt instructing the agent on its persona (Hiring Assistant) and how to use the provided tools.

### Key Entities

- **CandidateAggregate**: A read-only projection combining `CandidateTraits`, `CandidateScore`, and `InterviewAnalysis` for a specific candidate, served by the new API endpoint.
- **OpenClawSkill**: A configuration file defining the interface agent's capabilities, prompt, and API tools.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The `GET /api/candidates/[candidateId]` endpoint successfully returns unified candidate data within 500ms.
- **SC-002**: The OpenClaw skill definition successfully executes the read (GET) and write (POST distill) tool calls against the Next.js API.
- **SC-003**: The Distillation Agent successfully updates role weights when triggered via the OpenClaw tool call.
