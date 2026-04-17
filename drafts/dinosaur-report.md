# Dinosaur Replay Report

Generated: 2026-04-17T12:52:36.410Z
Fixtures: 4 recruiting + 3 sales = 7 total

## Three Fred operations, proven

- **Restructure**: two extractor prompt variants per fixture. Same input, different trait values.
- **Reindex**: two to three weight sets applied per fixture. Same traits, different composite scores.
- **Feedback**: simulated interviewer scorecard (human_score) drives weight shifts with max 0.05 per-weight delta.

---

### cand-alexandros (mode: recruiting, role: Senior Protocol Engineer)

**Restructure proof — trait deltas across prompt variants:**

| Variant | skills | yoe | hard_things | oss | schools | edu |
|---|---:|---:|---:|---:|---:|---|
| `baseline` | 7 | 8 | 7 | 0 | 5 | Bachelors |
| `depth-over-breadth` | 3 | 10 | 8 | 0 | 5 | Bachelors |

**Reindex proof — score deltas across weight sets (on the baseline trait extraction):**

| Weight set | Composite score |
|---|---:|
| `baseline_generalist` | 48.33 |
| `protocol_engineer_priors` | 47.83 |

**Feedback proof — simulated interviewer scorecard drives weight shift:**

- Human score: 8/10
- Base weight set: `protocol_engineer_priors`

| Trait | Delta |
|---|---:|
| `skills` | 0.0120 |
| `years_of_experience` | 0.0020 |
| `education_level` | 0.0060 |
| `hard_things_done` | 0.0120 |
| `hackathons` | -0.0300 |
| `open_source_contributions` | -0.0300 |
| `company_signals` | 0.0060 |

---

### cand-benhur (mode: recruiting, role: Senior Protocol Engineer)

**Restructure proof — trait deltas across prompt variants:**

| Variant | skills | yoe | hard_things | oss | schools | edu |
|---|---:|---:|---:|---:|---:|---|
| `baseline` | 7 | 12 | 7 | 5 | 8 | Masters |
| `depth-over-breadth` | 3 | 14 | 8 | 5 | 8 | Masters |

**Reindex proof — score deltas across weight sets (on the baseline trait extraction):**

| Weight set | Composite score |
|---|---:|
| `baseline_generalist` | 61.00 |
| `protocol_engineer_priors` | 63.00 |

**Feedback proof — simulated interviewer scorecard drives weight shift:**

- Human score: 8/10
- Base weight set: `protocol_engineer_priors`

| Trait | Delta |
|---|---:|
| `skills` | 0.0120 |
| `years_of_experience` | 0.0180 |
| `education_level` | 0.0180 |
| `schools` | 0.0180 |
| `hard_things_done` | 0.0120 |
| `hackathons` | -0.0300 |
| `company_signals` | 0.0060 |

---

### cand-bhavin (mode: recruiting, role: Senior Protocol Engineer)

**Restructure proof — trait deltas across prompt variants:**

| Variant | skills | yoe | hard_things | oss | schools | edu |
|---|---:|---:|---:|---:|---:|---|
| `baseline` | 5 | 14 | 2 | 0 | 5 | Bachelors |
| `depth-over-breadth` | 3 | 16 | 3 | 0 | 5 | Bachelors |

**Reindex proof — score deltas across weight sets (on the baseline trait extraction):**

| Weight set | Composite score |
|---|---:|
| `baseline_generalist` | 32.83 |
| `protocol_engineer_priors` | 27.83 |

**Feedback proof — simulated interviewer scorecard drives weight shift:**

- Human score: 8/10
- Base weight set: `protocol_engineer_priors`

| Trait | Delta |
|---|---:|
| `years_of_experience` | 0.0260 |
| `company_stages` | -0.0300 |
| `education_level` | 0.0060 |
| `hard_things_done` | -0.0180 |
| `hackathons` | -0.0300 |
| `open_source_contributions` | -0.0300 |
| `company_signals` | -0.0180 |

---

### cand-benjamin (mode: recruiting, role: Senior Protocol Engineer)

**Restructure proof — trait deltas across prompt variants:**

| Variant | skills | yoe | hard_things | oss | schools | edu |
|---|---:|---:|---:|---:|---:|---|
| `baseline` | 4 | 5 | 2 | 0 | 2 | None |
| `depth-over-breadth` | 3 | 7 | 3 | 0 | 2 | None |

**Reindex proof — score deltas across weight sets (on the baseline trait extraction):**

| Weight set | Composite score |
|---|---:|
| `baseline_generalist` | 19.33 |
| `protocol_engineer_priors` | 17.83 |

**Feedback proof — simulated interviewer scorecard drives weight shift:**

- Human score: 8/10
- Base weight set: `protocol_engineer_priors`

| Trait | Delta |
|---|---:|
| `skills` | -0.0060 |
| `years_of_experience` | -0.0100 |
| `company_stages` | -0.0300 |
| `education_level` | -0.0120 |
| `schools` | -0.0180 |
| `hard_things_done` | -0.0180 |
| `hackathons` | -0.0300 |
| `open_source_contributions` | -0.0300 |
| `company_signals` | -0.0180 |

---

### acc-northwind (mode: sales:enterprise, role: sales:enterprise)

**Restructure proof — trait deltas across prompt variants:**

| Variant | company | icp_fit | intent | ARR ($k) | risk | warmth |
|---|---|---:|---:|---:|---:|---:|
| `baseline` | Northwind Systems | 8 | 8 | 2000 | 7 | 7 |
| `urgency-weighted` | Northwind Systems | 8 | 10 | 2000 | 7 | 6 |

**Reindex proof — score deltas across weight sets (on the baseline trait extraction):**

| Weight set | Composite score |
|---|---:|
| `baseline` | 80.00 |
| `enterprise_tilt` | 91.00 |
| `smb_velocity_tilt` | 75.00 |

**Feedback proof — simulated interviewer scorecard drives weight shift:**

- Human score: 7/10
- Base weight set: `enterprise_tilt`

| Trait | Delta |
|---|---:|
| `icp_fit` | 0.0120 |
| `intent_signals` | 0.0120 |
| `deal_size_potential` | 0.0200 |
| `champion_strength` | 0.0120 |
| `timing` | 0.0080 |
| `competitive_displacement` | 0.0040 |
| `relationship_warmth` | 0.0080 |
| `risk_signals` | 0.0080 |

---

### acc-acorn-labs (mode: sales:smb, role: sales:smb)

**Restructure proof — trait deltas across prompt variants:**

| Variant | company | icp_fit | intent | ARR ($k) | risk | warmth |
|---|---|---:|---:|---:|---:|---:|
| `baseline` | Acorn Labs | 5 | 8 | 80 | 7 | 2 |
| `urgency-weighted` | Acorn Labs | 5 | 10 | 80 | 7 | 1 |

**Reindex proof — score deltas across weight sets (on the baseline trait extraction):**

| Weight set | Composite score |
|---|---:|
| `baseline` | 60.26 |
| `enterprise_tilt` | 62.43 |
| `smb_velocity_tilt` | 61.09 |

**Feedback proof — simulated interviewer scorecard drives weight shift:**

- Human score: 7/10
- Base weight set: `smb_velocity_tilt`

| Trait | Delta |
|---|---:|
| `intent_signals` | 0.0120 |
| `deal_size_potential` | 0.0127 |
| `champion_strength` | -0.0120 |
| `timing` | 0.0080 |
| `competitive_displacement` | 0.0040 |
| `relationship_warmth` | -0.0120 |
| `risk_signals` | 0.0080 |

---

### acc-helix-health (mode: sales:enterprise, role: sales:enterprise)

**Restructure proof — trait deltas across prompt variants:**

| Variant | company | icp_fit | intent | ARR ($k) | risk | warmth |
|---|---|---:|---:|---:|---:|---:|
| `baseline` | Helix Health | 6 | 2 | 1600 | 7 | 7 |
| `urgency-weighted` | Helix Health | 6 | 4 | 1600 | 7 | 6 |

**Reindex proof — score deltas across weight sets (on the baseline trait extraction):**

| Weight set | Composite score |
|---|---:|
| `baseline` | 64.00 |
| `enterprise_tilt` | 77.00 |
| `smb_velocity_tilt` | 57.00 |

**Feedback proof — simulated interviewer scorecard drives weight shift:**

- Human score: 7/10
- Base weight set: `enterprise_tilt`

| Trait | Delta |
|---|---:|
| `icp_fit` | 0.0040 |
| `intent_signals` | -0.0120 |
| `deal_size_potential` | 0.0200 |
| `champion_strength` | 0.0120 |
| `timing` | 0.0080 |
| `competitive_displacement` | 0.0040 |
| `relationship_warmth` | 0.0080 |
| `risk_signals` | 0.0080 |

---

## Verdict

The pipeline handles recruiting and sales with the same compound-intelligence loop. Each mode keeps its own trait vocabulary and weight priors; the extractor, scorer, and distillation steps share one orchestration path. Prompt-variant swaps produce distinct trait extractions. Weight-set swaps produce distinct composite scores on identical traits. Feedback events drive bounded, per-weight shifts that will steer future scoring without runaway drift.