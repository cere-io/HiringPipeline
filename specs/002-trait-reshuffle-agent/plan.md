# Implementation Plan: Trait Reshuffle Agent

**Branch**: `002-trait-reshuffle-agent` | **Date**: 2026-02-25 | **Spec**: [spec.md](./spec.md)

## Summary

Build an autonomous background agent that ingests human interview scores from Notion, maps them to the `hiring-traits` cubby, and periodically recalculates the optimal weights for candidate traits to minimize the gap between AI predictions and human evaluations.

## Technical Context

**Language/Version**: TypeScript / Node.js
**Storage**: CEF Cubbies (`hiring-traits`, `hiring-meta`)
**Target Platform**: Cere Native Compute (Kafka + Agents)
**Trigger**: `NotionScorecardUpdated` Kafka Event

## Architecture & Components

### 1. Notion Webhook Receiver (Event Producer)
- Endpoint: `POST /notion`
- Logic: Receives `page.updated` payload. Extracts `payload.data.updated_properties["Interview Score"].number`.
- Output: Publishes a `NotionScorecardUpdated` Kafka event containing the candidate ID and human score.

### 2. Feedback Ingestion Agent (Cere Native)
- Trigger: Subscribes to `NotionScorecardUpdated` Kafka stream.
- Logic: Updates the `hiring-traits` cubby for the candidate. Also maintains a secondary index in a `hiring-meta` cubby appending the `candidate_id` to a `scored_candidates` array for fast batch retrieval.

### 3. Reshuffle Engine (Cere Native Agent)
- Trigger: Scheduled Cere native compute task OR triggered via Kafka event when the `scored_candidates` array grows by a set batch size.
- Logic: 
  1. Fetch `scored_candidates` array from `hiring-meta`.
  2. Bulk fetch all corresponding `TraitSignal` records from the `hiring-traits` cubby.
  3. Run a deterministic Linear Regression (e.g., using `ml-regression` or similar JS math library) to find the optimal weights that minimize the Mean Absolute Error between the AI `conclusive_score` and the `Interview Score`.
  4. If the newly calculated weights differ from the current weights beyond a defined threshold (e.g., >5%), write the new weights to the `hiring-meta` cubby.

### 3. Config Provider Updates
- Update the candidate processor (from 001) to fetch weights dynamically from the `hiring-config` cubby instead of using hardcoded constants.

## Project Structure

```text
src/
├── agents/
│   ├── feedback-ingestion.ts    # Subscribes to NotionScorecardUpdated
│   └── reshuffle-worker.ts      # Cere native compute task (Linear Regression)
├── services/
│   └── config-provider.ts       # Service to fetch/cache weights
├── api/
│   └── webhooks/
│       └── notion-score.ts      # Receives webhook, produces Kafka event
```
