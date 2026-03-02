# Data Model: Reshuffle Agent Config

This document outlines the schema design for the configurations and logs managed by the Reshuffle Agent.

## Entities

### `WeightConfiguration` (Persisted in `hiring-meta` Cubby)

This object stores the current multipliers applied to AI ratings to calculate the `conclusive_score`.

| Field | Type | Description | PII Risk |
|-------|------|-------------|----------|
| `weights` | `object` | Key-value pairs of trait names to their current multiplier (e.g., `{"hard_things_done": 3.5}`). | None |
| `updated_at` | `string` | ISO 8601 timestamp of when the weights were last reshuffled. | None |
| `sample_size` | `number` | The number of candidates with `human_feedback_score` used to calculate these weights. | None |

### `ReshuffleLog` (Persisted in `hiring-meta` Cubby under a ledger key)

An append-only log of historical weight changes to track how the system's "understanding" evolves.

| Field | Type | Description | PII Risk |
|-------|------|-------------|----------|
| `timestamp` | `string` | ISO 8601 timestamp of the reshuffle run. | None |
| `previous_weights` | `object` | The weights before the run. | None |
| `new_weights` | `object` | The new weights applied. | None |
| `mae_improvement` | `number` | The improvement in Mean Absolute Error between AI and Human scores achieved by this reshuffle. | None |
