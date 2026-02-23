# Feature Specification: Bridge Candidate Traits to Cubby

**Feature Branch**: `001-bridge-traits-cubby`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "Bridge candidate trait data from HR-2026-E2E candidate-processor into hiring-traits cubby alongside existing Notion write"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trait Extraction on Candidate Ingest (Priority: P1)

When a new candidate is processed through `candidate-processor.ts`, the system extracts structured trait signals (skills, experience level, company stages, education) and writes them to the `hiring-traits` cubby. The existing Notion write continues unchanged. The trait signal must not contain PII (no names, emails, phone numbers, or raw resume text).

**Why this priority**: This is the foundational data bridge. Without traits in cubbies, no downstream agent (Scorer, Distillation) can function. Everything else depends on this.

**Independent Test**: Send a test candidate payload through the wellfound webhook → verify trait record appears in `hiring-traits` cubby with correct `candidate_id` key and schema-valid payload, AND verify Notion still has the candidate record.

**Acceptance Scenarios**:

1. **Given** a new candidate webhook from Wellfound, **When** `candidate-processor.ts` completes scoring, **Then** a trait record is written to `hiring-traits` cubby with key `{candidate_id}` containing structured signals (skills array, years of experience, company stages, education level)
2. **Given** a new candidate webhook from Join.com, **When** `candidate-processor.ts` completes scoring, **Then** the same trait extraction and cubby write occurs
3. **Given** a candidate is processed, **When** the trait record is written, **Then** the existing Notion write still succeeds and contains all current fields unchanged
4. **Given** a candidate whose resume contains PII, **When** traits are extracted, **Then** the cubby payload contains zero PII — no names, emails, phone numbers, addresses, or raw resume text

---

### User Story 2 - Dual-Write Error Resilience (Priority: P2)

When the cubby write fails after a successful Notion write, the system logs the error and retries the cubby write with exponential backoff (max 3 attempts). The Notion write is never retried or affected by cubby failures.

**Why this priority**: The existing pipeline must not break. Cubby writes are additive — a cubby failure should degrade gracefully, not take down the hiring pipeline.

**Independent Test**: Simulate a cubby write failure (network timeout) after Notion success → verify Notion record is intact, error is logged with structured fields, and retry attempts occur up to 3 times.

**Acceptance Scenarios**:

1. **Given** Notion write succeeds but cubby write fails on first attempt, **When** the retry logic executes, **Then** the system retries up to 3 times with exponential backoff
2. **Given** all 3 cubby retry attempts fail, **When** retries are exhausted, **Then** the error is logged with `{ event: 'cubby_write_failed', cubby: 'hiring-traits', candidate_id, attempts: 3, error }` and the candidate processing completes successfully (Notion record intact)
3. **Given** Notion write itself fails, **When** the error propagates, **Then** the cubby write is never attempted (Notion-first ordering)

---

### User Story 3 - Webhook Deduplication (Priority: P2)

When the same candidate arrives through both Wellfound and Join.com (or the same webhook fires twice), the system deduplicates using a composite key and writes only one trait record per unique candidate.

**Why this priority**: ATS providers retry on timeout and candidates apply through multiple channels. Without dedup, the same candidate gets multiple trait records, corrupting downstream scoring.

**Independent Test**: Send the same candidate payload twice through the wellfound webhook → verify only one trait record exists in the cubby.

**Acceptance Scenarios**:

1. **Given** a candidate webhook fires twice with identical payload, **When** the second webhook is processed, **Then** the duplicate is detected and the cubby write is skipped (return 200 to webhook sender)
2. **Given** a candidate applies through both Wellfound and Join.com, **When** both webhooks are processed, **Then** the system recognizes them as the same candidate (via email hash + applied_at) and writes a single merged trait record

---

### User Story 4 - Trait Schema Validation (Priority: P3)

All trait records written to the cubby are validated against a zod schema before write. Invalid payloads are rejected and logged.

**Why this priority**: Schema validation prevents garbage data from entering cubbies. Important for data quality but the system can function initially with looser validation.

**Independent Test**: Attempt to write a trait record missing required fields → verify the write is rejected with a `SchemaValidationError` and the invalid payload is logged.

**Acceptance Scenarios**:

1. **Given** a trait extraction produces a valid payload, **When** schema validation runs, **Then** the payload passes and is written to the cubby
2. **Given** a trait extraction produces a payload with missing required fields, **When** schema validation runs, **Then** the write is rejected, a `SchemaValidationError` is logged with details of which fields failed, and the candidate processing continues (Notion write still succeeds)

---

### Edge Cases

- What happens when a candidate has no resume (LinkedIn-only application)? Trait extraction runs on available data; missing fields are set to `null` with a `source` field indicating data completeness.
- What happens when OpenAI scoring fails mid-extraction? Cubby write is skipped (no partial traits), error logged, Notion write proceeds with existing behavior.
- What happens when the cubby service is completely unreachable? All cubby writes fail gracefully after 3 retries; the existing pipeline continues with Notion-only storage. A structured alert is logged for monitoring.
- What happens with very large resumes (>50KB of text)? Trait extraction operates on parsed signals, not raw text. The cubby payload stays small regardless of resume size.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST extract structured trait signals from candidate data after `candidate-processor.ts` completes scoring
- **FR-002**: System MUST write trait signals to `hiring-traits` cubby using `CubbyClient.put('hiring-traits', candidateId, traitSignal)`
- **FR-003**: System MUST validate trait payloads against a zod `TraitSignalSchema` before writing to cubby
- **FR-004**: System MUST NOT include PII (names, emails, phone numbers, addresses, raw resume text) in cubby payloads
- **FR-005**: System MUST maintain the existing Notion write unchanged — cubby write is additive, not a replacement
- **FR-006**: System MUST write to Notion first, cubby second — cubby failure never affects Notion
- **FR-007**: System MUST retry failed cubby writes with exponential backoff (max 3 attempts, base 1s)
- **FR-008**: System MUST deduplicate candidates using composite key `{source}:{email_hash}:{applied_at}`
- **FR-009**: System MUST log all cubby write operations with structured fields: `{ event, cubby, candidate_id, success, duration_ms }`
- **FR-010**: System MUST acknowledge webhooks (200 response) before performing cubby writes

### Key Entities

- **TraitSignal**: Anonymized structured decomposition of a candidate. Contains: skills (string array), years_of_experience (number), company_stages (string array — e.g., "startup", "series_b", "public"), education_level (string), source_completeness (object indicating which data sources were available), extracted_at (ISO timestamp)
- **CandidateRecord**: Existing entity in HR-2026-E2E. Contains resume, LinkedIn data, ATS metadata, AI scores. Lives in Notion.
- **CubbyClient**: Abstraction for cubby read/write. Provides `put(cubby, key, value)`, `get(cubby, key)`, `list(cubby)` with built-in retry and logging.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every candidate processed through the pipeline has a corresponding trait record in `hiring-traits` cubby within 5 seconds of Notion write completion
- **SC-002**: Zero PII present in any cubby payload (verifiable by automated scan)
- **SC-003**: Existing Notion pipeline continues with zero regressions — no increase in error rate or processing time >10%
- **SC-004**: Cubby write failures do not block candidate processing — 100% of candidates still appear in Notion regardless of cubby health
- **SC-005**: Duplicate candidates (same person, multiple webhooks) result in exactly one trait record per unique candidate
