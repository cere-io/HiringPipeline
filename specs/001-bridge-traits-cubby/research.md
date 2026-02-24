# Research: Trait Extraction and Validation

## Decisions

### 1. Data Validation Strategy
- **Decision**: Use `zod` for parsing raw input data to the `TraitSignal` type, prior to passing it to `CubbyClient.put`.
- **Rationale**: The Constitution explicitly calls out schema validation and strictly avoiding `any`. Zod provides both runtime parsing/validation and compile-time type inference. By stripping out unmatched fields, we avoid accidental PII leaks.
- **Alternatives considered**: Raw TS interfaces with custom validation logic. Rejected due to maintainability and higher risk of PII leakage.

### 2. Error Handling & Dual-Writes
- **Decision**: Log errors if cubby writing fails but do not block the request. Wrap all errors in a `CubbyWriteError` and rely on structured logging for observability.
- **Rationale**: Following the meeting notes, we removed complex dual-write resilience (retry loops). However, we must ensure Notion is updated and Cubby failures do not abort the webhook response (Notion-first).
- **Alternatives considered**: Custom retry logic with exponential backoff. Rejected to keep the initial bridge simple.

### 3. Asynchronous Trait Writing
- **Decision**: Trigger the Cubby write asynchronously *after* the Notion payload is resolved, allowing the webhook to return 200 early.
- **Rationale**: Webhook idempotency and fast-acknowledgment rules apply. Blocking ATS providers risks timeouts and duplicates.
