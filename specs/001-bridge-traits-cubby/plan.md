# Implementation Plan: Bridge Candidate Traits to Cubby

**Branch**: `001-bridge-traits-cubby` | **Date**: 2026-02-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-bridge-traits-cubby/spec.md`

## Summary

Extract structured trait signals (skills, experience, education, etc.) from incoming candidates processed by `candidate-processor.ts`, validate them against a strict schema, and persist them in the `hiring-traits` CEF Cubby using `CubbyClient`. The implementation ensures no PII is stored and maintains the existing Notion-first integration pattern.

## Technical Context

**Language/Version**: TypeScript / Node.js
**Primary Dependencies**: `zod` (for schema validation), `CubbyClient` (CEF SDK)
**Storage**: CEF Cubbies (`hiring-traits`)
**Testing**: `vitest` (unit/integration)
**Target Platform**: Node.js backend (`HR-2026-E2E`)
**Project Type**: Single Node.js service
**Performance Goals**: Cubby write must complete efficiently after Notion write (non-blocking)
**Constraints**: Zero PII in cubby payload.
**Scale/Scope**: ~100s of candidates/week, minimal load.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Spec-Driven Development**: Spec written, reviewed, and approved.
- [x] **II. Testing & Validation**: Vitest unit/integration tests planned for extraction logic and cubby writes.
- [x] **III. Cubby Access & Data Architecture**: Implementation relies strictly on `CubbyClient.put`. PII stripped. Zod validation planned.
- [x] **IV. Agent Design & Communication**: Agent input/output boundaries respected.
- [x] **V. TypeScript Strictness & Conventions**: `zod` used for parsing `unknown` to `TraitSignal`. Custom errors and PascalCase interfaces.
- [x] **VI. Observability & Accountability**: Structured logging ` { event: 'cubby_write', ... }` planned.

**Result**: PASS. No constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-bridge-traits-cubby/
├── plan.md              # This file
├── research.md          # Implementation decisions
├── data-model.md        # TraitSignal schema definition
├── quickstart.md        # Local testing guide
├── contracts/           # API/Schema contracts
│   └── trait-signal-schema.ts
└── checklists/          # Validation checklists
```

### Source Code (repository root)

```text
src/
├── models/
│   └── trait-signal.ts         # Zod schema and TS types
├── services/
│   ├── candidate-processor.ts  # (Existing) Update to call extractor
│   ├── trait-extractor.ts      # New service for trait extraction
│   └── cubby-integration.ts    # CubbyClient interactions
└── utils/
    └── logger.ts               # Structured logging
tests/
├── unit/
│   └── trait-extractor.test.ts # Validate PII stripping and data mapping
└── integration/
    └── cubby-integration.test.ts # Validate CubbyClient writes
```

**Structure Decision**: Extending the existing HR-2026-E2E monolithic service structure, grouping by technical capability (`models`, `services`, `tests`).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations.
