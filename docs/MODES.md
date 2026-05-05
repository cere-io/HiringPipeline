# Pipeline Modes — recruiting, sales, and beyond

## Why this exists

Per Fred (call 2026-04-17):

> "Sales are the same thing. The same agent. It's gonna be pretty customized for different people. It's like a checkbox to say, is this for recruiting or is this for sales? Where at some point I'll get into..."

The compound intelligence loop (extract traits → score → human feedback → distill new weights → re-score) is mode-agnostic. What changes per mode is **the trait schema** and **the default weights**. Pipeline shape stays identical.

## Modes today

| Mode | Domain | Trait type | Default weights | Status |
|---|---|---|---|---|
| `recruiting` | Job candidates | `CandidateTraits` (9 traits) | `DEFAULT_RECRUITING_WEIGHTS` | Live (pre-existing) |
| `sales` | Generic sales pipeline | `AccountTraits` (9 traits) | `DEFAULT_SALES_WEIGHTS` | Schema scaffolded |
| `sales:enterprise` | Enterprise sub-segment | `AccountTraits` | `DEFAULT_SALES_WEIGHTS` (tunable per role) | Schema scaffolded |
| `sales:smb` | SMB sub-segment | `AccountTraits` | `DEFAULT_SALES_WEIGHTS` (tunable per role) | Schema scaffolded |

## What this PR adds (smallest diff)

1. `PipelineMode` type union.
2. `mode?: PipelineMode` optional field on `NewApplicationPayload`, `CandidateTraits`, `CandidateScore`. Default: `'recruiting'` (full backward compatibility).
3. `AccountTraits` interface (sales-side analog of `CandidateTraits`).
4. `SalesTraitWeights` interface + `DEFAULT_SALES_WEIGHTS`.
5. `defaultWeightsFor(mode)` helper.

**What this PR does NOT change yet:**

- Trait extractor agent (`src/agents/trait-extractor.ts`) — still recruiting-only. Sales-mode branch follows.
- Scorer agent — still uses recruiting weights schema. Sales scorer branch follows.
- Distillation agent — still scoped to recruiting role weights. Sales distillation branch follows.
- UI — single 6-step flow today. Future: mode selector at top.

The PR is about establishing the type surface and the convention. Per-mode agents land in follow-ups so each can be reviewed independently.

## How to add a new mode (recipe)

1. **Add a `mode` value** to the `PipelineMode` union in `src/types/index.ts`.
2. **Define a Traits interface** for that mode (e.g. `LegalCaseTraits` if mode `legal:contracts`).
3. **Define DefaultWeights** + add it to `defaultWeightsFor(mode)`.
4. **Add a branch** in `trait-extractor.ts`:
   - Pick the LLM prompt by mode.
   - Project the LLM output to the mode's Traits interface.
5. **Add a branch** in `scorer.ts`:
   - Apply mode-specific weights to compute `composite_score`.
6. **Add a branch** in `distillation.ts`:
   - Use mode-specific weight keys when normalizing + tuning.

Each branch is ~30 lines. The orchestration (concierge.ts) stays unchanged because it just routes events by `mode`.

## Why this is the right consolidation

Without mode flag we'd build:
- A separate Sales Pipeline repo with the same Concierge → Extractor → Scorer → Distillation pattern.
- A separate Cubby with parallel `account_*` tables.
- A separate UI.
- A separate set of weights to maintain.

With mode flag we build:
- Same repo, same agents, same cubby (one extra column: `mode`).
- Same UI with a dropdown at top.
- Same weight-tuning UX, scoped per mode + role.
- Same compound intelligence loop applied to a new domain.

**Cost of adding sales: ~3 days. Cost of building it standalone: ~3 weeks.** Same compound learning, different traits.

## Future modes

Anything that follows the "extract attributes from text → weighted score → outcome → tune weights" pattern fits:

- `legal:case-prioritization` — score legal cases by likelihood of favorable outcome.
- `bd:partnership` — score partnership opportunities.
- `marketing:lead` — score inbound leads.
- `pm:feature` — score feature ideas against ICP fit.

Each = one new mode + one extractor branch + one weights default. The compound intelligence loop is reused.
