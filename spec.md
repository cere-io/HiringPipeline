# Spec: Hiring Pipeline - Compound Intelligence

**Status:** Ready for review
**Owner:** Martijn
**Existing system:** [HR-2026-E2E](https://github.com/cere-io/HR-2026-E2E) (production, stores to Notion)

---

## Problem

We process hiring data through a production pipeline ([HR-2026-E2E](https://github.com/cere-io/HR-2026-E2E)). Resumes get parsed, AI-scored, interviews analyzed, reviewers tracked. But hire #200 is scored with the same weights as hire #1. No learning. No compounding.

The data exists. The feedback loop does not.

## Objective

Wire the existing HR-2026-E2E pipeline into CEF so that:

1. Each stage of hiring produces structured data in cubbies
2. Outcomes (human score, interview score, 1-month success/failure) feed backward into AI scoring weights
3. Human overrides become training signal, not noise
4. Every hire makes the next one smarter

## Architecture

```
DATA SOURCES                           CUBBIES
+--------------+                       +------------------+
| Wellfound WH |                       | hiring-traits    |
| Join.com WH  |---+                   | hiring-scores    |
| Gmail polls  |   |                   | hiring-interviews|
+--------------+   |                   | hiring-outcomes  |
                   v                   | hiring-meta (!)  |
            +------------+            +------------------+
            | client SDK ->
            | hiring-    |                    ^
            | stream     |                    |
            +-----+------+                    |
                  |                           |
                  v                           |
            +------------+                    |
            | RAFT       |                    |
            | categorize |                    |
            | by stage   |                    |
            +-----+------+                    |
                  |                           |
     +------+----+----+------+               |
     v      v         v      v               |
  +----+ +-----+ +-------+ +-------+        |
  |Trait| |Score| |Interv.| |Distil.|--------+
  |Ext. | |Agent| |Analyz.| |Agent  |
  +----+ +-----+ +-------+ +-------+
   F1      F2       F3     F4 -> hiring-meta
```

## Existing Inventory (HR-2026-E2E)

| Component | File(s) | Status |
|-----------|---------|--------|
| ATS ingestion (Wellfound) | `routes/wellfound-webhook.ts` | Running |
| ATS ingestion (Join.com) | `routes/join-webhook.ts`, `routes/join-poll.ts` | Running |
| Resume parsing + AI scoring | `services/candidate-processor.ts`, `services/openai.ts` | Running |
| Role-specific prompts (6 roles) | `prompts/AI_Engineer.txt`, etc. | Calibrated |
| Interview transcript analysis | `routes/transcript-poll.ts`, `routes/interview-score.ts` | Running |
| Gmail transcript polling | `services/gmail-transcripts.ts` | Running |
| Reviewer SLA monitoring | `services/reviewer-monitor.ts`, `services/sla-monitor.ts` | Running |
| Pipeline dashboard | `routes/dashboard-v5.ts` | Running |
| Slack notifications | `services/slack.ts`, `services/smart-alerts.ts` | Running |

## Agents

| Agent | Input | Output | Cubby |
|-------|-------|--------|-------|
| Trait Extractor | Candidate record (resume, LinkedIn) | Structured traits | `hiring-traits` |
| Scorer | Traits + weights from `hiring-meta` | Weighted composite score | `hiring-scores` |
| Interview Analyzer | Gmail transcript | Dimension scores + signals | `hiring-interviews` |
| Distillation (KEY) | Outcome event | Updated weights | `hiring-meta`, `hiring-outcomes` |

## Cubbies

| Cubby | Purpose | Key Pattern |
|-------|---------|-------------|
| `hiring-traits` | Per-candidate trait decomposition | `{candidate_id}` |
| `hiring-scores` | AI + human scores | `{candidate_id}` |
| `hiring-interviews` | Interview analysis | `{candidate_id}` |
| `hiring-outcomes` | 3-month outcomes | `{candidate_id}` |
| `hiring-meta` | **Compound intelligence** — weights that shift with every outcome | `trait_weights/*`, `override_patterns` |

## Implementation Phases

**Phase 1 (Bridge):** Wire existing data into cubbies — no logic changes to HR-2026-E2E
**Phase 2 (Distillation):** Outcome -> weight update -> scorer uses live weights
**Phase 3 (Full Loop):** Automated outcome prompts, weight drift dashboard, cross-candidate search
