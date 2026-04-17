# Hiring Pipeline Replay Harness

Generated: 2026-04-17T13:46:42.004Z
Fixtures: 5 real Notion candidates from week of 2026-04-14.
Mode: offline deterministic.

## Three replay operations Fred asked for

- **Restructure** — same resume, two extractor prompt variants, different trait values.
- **Reindex** — same traits, two weight sets (`generalist_baseline` vs `blockchain_engineer_priors`), different composite scores.
- **Compound** — simulated interviewer scorecard → bounded weight shifts (max 0.05 per weight per correction). Drift accumulates across nightly runs.

Run against Rahul's hiring agent (extractor → scorer → distillation). Isolated from production via the `stream-2fcefa72` replay stream on Hiring Agent svc 2666 ws 2310.

---

### Finn Theuerkauff — Founder's Associate

Notion status: **Initial Evaluation Call** · Prior AI score: **9/10**

**Restructure — trait deltas across prompt variants:**

| Variant | skills | yoe | hard_things | oss | schools | edu |
|---|---:|---:|---:|---:|---:|---|
| `baseline` | 3 | 4 | 7 | 0 | 8 | Bachelors |
| `depth-over-breadth` | 3 | 6 | 8 | 0 | 8 | Bachelors |

**Reindex — composite score on baseline traits, across weight sets:**

| Weight set | Composite score |
|---|---:|
| `generalist_baseline` | 40.67 |
| `blockchain_engineer_priors` | 41.67 |

**Compound — simulated scorecard (human_score=9/10) → weight shifts on `blockchain_engineer_priors`:**

| Trait | Delta |
|---|---:|
| `skills` | -0.0160 |
| `years_of_experience` | -0.0187 |
| `education_level` | +0.0080 |
| `schools` | +0.0240 |
| `hard_things_done` | +0.0160 |
| `hackathons` | -0.0400 |
| `open_source_contributions` | -0.0400 |
| `company_signals` | -0.0080 |

---

### Alexandros Sivris — Blockchain Engineer

Notion status: **Company Rejected** · Prior AI score: **2/10**

**Restructure — trait deltas across prompt variants:**

| Variant | skills | yoe | hard_things | oss | schools | edu |
|---|---:|---:|---:|---:|---:|---|
| `baseline` | 7 | 8 | 7 | 0 | 5 | Bachelors |
| `depth-over-breadth` | 3 | 10 | 8 | 0 | 5 | Bachelors |

**Reindex — composite score on baseline traits, across weight sets:**

| Weight set | Composite score |
|---|---:|
| `generalist_baseline` | 46.33 |
| `blockchain_engineer_priors` | 46.83 |

**Compound — simulated scorecard (human_score=3/10) → weight shifts on `blockchain_engineer_priors`:**

| Trait | Delta |
|---|---:|
| `skills` | -0.0080 |
| `years_of_experience` | -0.0013 |
| `education_level` | -0.0040 |
| `hard_things_done` | -0.0080 |
| `hackathons` | +0.0200 |
| `open_source_contributions` | +0.0200 |
| `company_signals` | +0.0040 |

---

### Benhur Davies — Blockchain Engineer

Notion status: **Company Rejected** · Prior AI score: **2/10**

**Restructure — trait deltas across prompt variants:**

| Variant | skills | yoe | hard_things | oss | schools | edu |
|---|---:|---:|---:|---:|---:|---|
| `baseline` | 7 | 12 | 7 | 5 | 8 | Masters |
| `depth-over-breadth` | 3 | 14 | 8 | 5 | 8 | Masters |

**Reindex — composite score on baseline traits, across weight sets:**

| Weight set | Composite score |
|---|---:|
| `generalist_baseline` | 61.00 |
| `blockchain_engineer_priors` | 63.00 |

**Compound — simulated scorecard (human_score=3/10) → weight shifts on `blockchain_engineer_priors`:**

| Trait | Delta |
|---|---:|
| `skills` | -0.0080 |
| `years_of_experience` | -0.0120 |
| `education_level` | -0.0120 |
| `schools` | -0.0120 |
| `hard_things_done` | -0.0080 |
| `hackathons` | +0.0200 |
| `company_signals` | -0.0040 |

---

### Bhavin Chandarana — Blockchain Engineer

Notion status: **Company Rejected** · Prior AI score: **2/10**

**Restructure — trait deltas across prompt variants:**

| Variant | skills | yoe | hard_things | oss | schools | edu |
|---|---:|---:|---:|---:|---:|---|
| `baseline` | 5 | 14 | 2 | 0 | 5 | Bachelors |
| `depth-over-breadth` | 3 | 16 | 3 | 0 | 5 | Bachelors |

**Reindex — composite score on baseline traits, across weight sets:**

| Weight set | Composite score |
|---|---:|
| `generalist_baseline` | 32.83 |
| `blockchain_engineer_priors` | 27.83 |

**Compound — simulated scorecard (human_score=3/10) → weight shifts on `blockchain_engineer_priors`:**

| Trait | Delta |
|---|---:|
| `years_of_experience` | -0.0173 |
| `company_stages` | +0.0200 |
| `education_level` | -0.0040 |
| `hard_things_done` | +0.0120 |
| `hackathons` | +0.0200 |
| `open_source_contributions` | +0.0200 |
| `company_signals` | +0.0120 |

---

### Benjamin Elliott — Blockchain Engineer

Notion status: **Company Rejected** · Prior AI score: **2/10**

**Restructure — trait deltas across prompt variants:**

| Variant | skills | yoe | hard_things | oss | schools | edu |
|---|---:|---:|---:|---:|---:|---|
| `baseline` | 5 | 5 | 2 | 0 | 2 | None |
| `depth-over-breadth` | 3 | 7 | 3 | 0 | 2 | None |

**Reindex — composite score on baseline traits, across weight sets:**

| Weight set | Composite score |
|---|---:|
| `generalist_baseline` | 20.83 |
| `blockchain_engineer_priors` | 18.83 |

**Compound — simulated scorecard (human_score=3/10) → weight shifts on `blockchain_engineer_priors`:**

| Trait | Delta |
|---|---:|
| `years_of_experience` | +0.0067 |
| `company_stages` | +0.0200 |
| `education_level` | +0.0080 |
| `schools` | +0.0120 |
| `hard_things_done` | +0.0120 |
| `hackathons` | +0.0200 |
| `open_source_contributions` | +0.0200 |
| `company_signals` | +0.0120 |

---

## Verdict

The hiring agent is replayable. Same candidate, different extractor prompts → different traits. Same traits, different weight priors → different composite scores. Interviewer scorecards drive bounded per-weight shifts that compound across nightly runs. Rahul's pipeline now has a test bed that reruns every night and commits a diffable snapshot to `drafts/nightly/YYYY-MM-DD.md`.