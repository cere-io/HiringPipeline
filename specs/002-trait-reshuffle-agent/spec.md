# Feature Specification: Trait Reshuffle Agent (Human Feedback Loop)

**Feature Branch**: `002-trait-reshuffle-agent`
**Created**: 2026-02-25
**Status**: Draft
**Input**: Context from CEO (Fred) regarding a self-reinforcing human feedback loop for candidate traits.

## Overview
This feature implements the "reshuffling" mechanism that adjusts how heavily specific candidate traits (Hard Things Done, Open Source, etc.) are weighted based on actual human interviewer feedback. It closes the loop established in `001-bridge-traits-cubby`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Feedback Ingestion (Priority: P1)

When an interviewer submits a scorecard in Notion, a webhook triggers the Reshuffle Agent. The agent extracts the `human_feedback_score` (1-10) and writes it back to the candidate's record in the `hiring-traits` cubby.

**Acceptance Scenarios**:
1. **Given** an updated Notion scorecard, **When** the webhook fires, **Then** the `human_feedback_score` is successfully patched into the `hiring-traits` cubby for that `candidate_id`.

---

### User Story 2 - Weight Reshuffling / Vector Adjustment (Priority: P1)

On a scheduled cadence (e.g., weekly) or via manual trigger, the Reshuffle Agent analyzes the delta between the AI's `conclusive_score` and the `human_feedback_score` across all candidates. It uses this delta to adjust the global trait weights.

**Acceptance Scenarios**:
1. **Given** a cohort of candidates where "Hackathons" were rated highly by AI but the candidates received low human scores, **When** the reshuffle runs, **Then** the global weight for "Hackathons" decreases.
2. **Given** a cohort of candidates where "Hard Things Done" correlated strongly with high human scores, **When** the reshuffle runs, **Then** the global weight for "Hard Things Done" increases.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST ingest human scorecard data from Notion webhooks and update the `human_feedback_score` in the `hiring-traits` cubby.
- **FR-002**: System MUST calculate the correlation between individual trait ratings (0-10) and the `human_feedback_score` across a statistically significant cohort of candidates.
- **FR-003**: System MUST update the global `WEIGHTS` configuration based on the correlation analysis.
- **FR-004**: System MUST store historical weight snapshots to track how the model's "understanding" of a good candidate evolves over time.

### Key Entities

- **TraitSignal**: (Defined in 001) Contains the AI-generated ratings and the `human_feedback_score`.
- **WeightConfiguration**: A new configuration object stored in a separate meta-cubby (`hiring-meta`) that dictates the multipliers for each trait.
- **ReshuffleLog**: A ledger recording when weights were changed, the delta, and the candidate cohort size that drove the change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `human_feedback_score` is successfully populated for >90% of candidates who complete an interview.
- **SC-002**: The mean absolute error (MAE) between the AI's `conclusive_score` (scaled to 1-10) and the `human_feedback_score` decreases over a 3-month period as the weights self-correct.
