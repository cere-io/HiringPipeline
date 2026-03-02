<!--
Sync Impact Report
==================
Version Change: 1.0.0 → 1.1.0
Principles Added:
  - Spec-Driven Development (SDD-First)
  - Testing & Validation Standards
  - Cubby Access & Data Architecture
  - Agent Design & Communication
  - TypeScript Strictness & Conventions
  - Observability & Accountability

Templates Requiring Updates:
  ✅ plan-template.md - Constitution Check section aligns with SDD gates
  ✅ spec-template.md - User stories support testable scenarios
  ✅ tasks-template.md - Task ordering maintained

Follow-up TODOs: None
-->

# Hiring Pipeline Constitution

## Core Principles

### I. Spec-Driven Development (SDD-First)

**NON-NEGOTIABLE**: All implementation MUST be preceded by a reviewed specification. The specification is the source code; the implementation is a compiled byproduct.

1. **Specify**: Write prioritized User Stories (P1/P2/P3) with Given/When/Then acceptance criteria before touching code
2. **Clarify**: Resolve ambiguities through structured questioning before planning
3. **Plan**: Produce a technical plan that passes Constitution Check before generating tasks
4. **Implement**: Execute tasks organized by user story, not by technical layer

**Rationale**: The "70% Trap" — AI gets you 70% of the way instantly, but the final 30% (integration, edge cases, dual-write safety) takes exponentially longer without upfront structural planning. Specs force you to think about interfaces, error paths, and edge cases before the first line of code.

**Rules**:
- No implementation without a reviewed spec (spec.md must exist before plan.md)
- Specs MUST contain independently testable user stories
- Plans MUST pass Constitution Check before task generation
- Tasks MUST be organized by user story, enabling independent delivery

### II. Testing & Validation Standards

Tests are organized by scope. Each test type validates a specific layer.

**Unit Tests** (`*.test.ts`):
- Location: Co-located with source or in `tests/unit/`
- Tools: vitest
- Scope: Business logic, data transformations, score calculations, trait extraction
- Required: All scoring algorithms, weight calculations, trait signal generation

**Integration Tests** (`*.integration.test.ts`):
- Location: `tests/integration/`
- Scope: Cubby read/write flows, Notion API interactions, webhook processing
- Required: Dual-write scenarios (Notion + cubby), agent-to-agent data flow

**E2E Tests**:
- Location: `tests/e2e/`
- Scope: Full pipeline flow from webhook to cubby write
- Mode: Mocked external services by default

**LLM-as-Judge Evaluations** (optional):
- Location: `tests/eval/`
- Scope: Semantic correctness of AI scoring, Distillation Agent fairness
- Tools: DeepEval or custom eval harness with GPT-4/Gemini judge

**Rationale**: Unit tests check syntax; integration tests check plumbing; evals check intent. The Distillation Agent's weight updates cannot be validated by deterministic tests alone — semantic evaluation is required to assess fairness and bias.

### III. Cubby Access & Data Architecture

All cubby operations MUST flow through the CubbyClient abstraction. No direct HTTP calls to CEF APIs.

**Rules**:
- ALWAYS use `CubbyClient.put(cubbyName, key, value)` — never raw `fetch()` to cubby endpoints
- ALWAYS use `candidate_id` as the cubby key for per-candidate cubbies
- ALWAYS validate payload schema with zod before writing to any cubby
- NEVER store PII (names, emails, raw resume text) in cubby payloads — use anonymized identifiers and extracted signals only
- NEVER read/write `hiring-meta` directly from application code — only the Distillation Agent modifies weights

**Cubbies**:

| Cubby | Writer | Key Pattern | Contains PII? |
|-------|--------|-------------|---------------|
| `hiring-traits` | Trait Extractor | `{candidate_id}` | No — signals only |
| `hiring-scores` | Scorer Agent | `{candidate_id}` | No |
| `hiring-interviews` | Interview Analyzer | `{candidate_id}` | No — dimensions only |
| `hiring-outcomes` | MCP tool | `{candidate_id}` | No |
| `hiring-meta` | Distillation Agent ONLY | `trait_weights/*`, `override_patterns` | No |

```typescript
// CORRECT
const traitSignal: TraitSignal = TraitSignalSchema.parse(extractedData);
await cubbyClient.put('hiring-traits', candidateId, traitSignal);

// FORBIDDEN
await fetch(`${CEF_URL}/cubbies/hiring-traits/${candidateId}`, {
  method: 'PUT',
  body: JSON.stringify(rawData), // no schema validation, raw HTTP
});
```

**Rationale**: CubbyClient provides retry logic, schema validation, and audit logging. Direct HTTP calls bypass these safeguards. PII in cubbies creates compliance risk and violates data minimization principles.

### IV. Agent Design & Communication

Each agent has a single responsibility and writes to exactly one cubby. Agent-to-agent communication flows through RAFT categories, not direct calls.

**Rules**:
- Each agent MUST validate its input schema before processing
- Each agent MUST write to exactly one primary cubby (except Distillation Agent: `hiring-meta` + `hiring-outcomes`)
- Agent-to-agent triggering MUST use RAFT categories, not direct function calls
- Agents MUST be stateless — all state lives in cubbies

**RAFT Configuration**:

| Category | Label | Trigger | Agent |
|----------|-------|---------|-------|
| A | Ingest | ATS webhook (new candidate) | Trait Extractor |
| B | Score | Traits stored | Scorer |
| C | Interview | Transcript ready | Interview Analyzer |
| D | Outcome | 3-month trigger | Distillation Agent |

**Rationale**: Single-responsibility agents are independently testable, deployable, and replaceable. RAFT decouples the pipeline — if the Scorer is down, traits still get extracted and queued.

### V. TypeScript Strictness & Conventions

**Rules**:
- `strict: true` in tsconfig — no exceptions
- No `any` types — use `unknown` with runtime validation (zod) or concrete types
- All async functions MUST have try/catch or propagate errors explicitly
- All public functions MUST have JSDoc with `@param` and `@returns`

**Naming**:

| Thing | Convention | Example |
|-------|-----------|---------|
| Services | PascalCase + `Service` suffix | `CandidateProcessorService` |
| Routes | kebab-case files | `wellfound-webhook.ts` |
| Cubby names | kebab-case | `hiring-traits` |
| Types/Interfaces | PascalCase | `TraitSignal`, `ScoreRecord` |
| Functions | camelCase, verb-first | `extractTraits`, `writeScore` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_ATTEMPTS` |

**Rationale**: TypeScript strict mode catches entire classes of runtime errors at compile time. Consistent naming reduces cognitive load across the team.

### VI. Observability & Accountability

**Rules**:
- Every cubby write MUST produce a structured log entry: `{ event: 'cubby_write', cubby, key, success, duration_ms }`
- Every agent invocation MUST log: `{ event: 'agent_run', agent, candidate_id, input_source, output_cubby, duration_ms }`
- Weight updates in `hiring-meta` MUST log the full delta: `{ event: 'weight_update', version, changes, triggered_by }`
- Human overrides (via MCP) MUST log: `{ event: 'human_override', candidate_id, ai_score, human_score, delta }`

**Rationale**: The Distillation Agent's weight updates are the most consequential operation in the system. Without audit logs, we cannot debug why the system underrated a candidate or trace bias in weight drift.

## Quality Gates

### Before Implementation

1. Spec reviewed and approved
2. Plan passes Constitution Check
3. Tasks organized by user story
4. Edge cases identified in spec

### Before PR Merge

1. All tests pass
2. No linter errors (eslint --fix)
3. Schema validation on all cubby writes
4. No PII in cubby payloads
5. Type safety confirmed (no `any`)

### Before Production

1. Integration tests pass with mocked external services
2. Observability logs confirmed (cubby writes, agent runs)
3. Rollback plan documented

## Governance

### Amendment Process

1. Propose amendment via PR to this file
2. Discuss rationale and alternatives with team
3. Update constitution and increment version
4. Propagate changes to dependent templates (plan, spec, tasks)
5. Communicate changes to all contributors

### Version Semantics

- **MAJOR**: Backward-incompatible principle removals or redefinitions
- **MINOR**: New principles added or materially expanded guidance
- **PATCH**: Clarifications, wording fixes, non-semantic refinements

### Compliance Review

- All PRs MUST verify compliance with constitution principles
- SDD violation (implementation before spec) results in immediate PR rejection
- PII in cubby payloads is a blocking issue regardless of other approvals
- Constitution supersedes all other coding practices

**Version**: 1.1.0 | **Ratified**: 2026-02-20 | **Last Amended**: 2026-02-24
