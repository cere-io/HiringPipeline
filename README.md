# Hiring Pipeline — Compound Intelligence

CEF integration for [HR-2026-E2E](https://github.com/cere-io/HR-2026-E2E). Wires the existing hiring pipeline into cubbies so every hire makes the next one smarter.

## Architecture

```
DATA SOURCES                    CUBBIES
+--------------+     +------------------+
| Wellfound WH |     | hiring-traits    |
| Join.com WH  |--+  | hiring-scores    |
| Gmail polls  |  |  | hiring-interviews|
+--------------+  |  | hiring-outcomes  |
                  v  | hiring-meta (!)  |
           +------------+ +------------------+
           | hiring-     |        ^
           | stream      |        |
           +-----+------+        |
                 |                |
                 v                |
           +------------+        |
           |   RAFT     |        |
           | categorize |        |
           +-----+------+        |
                 |                |
    +------+----+----+------+    |
    v      v         v      v    |
 +----+ +-----+ +-------+ +-------+
 |Trait| |Score| |Interv.| |Distil.|--+
 |Ext. | |Agent| |Analyz.| |Agent  |
 +----+ +-----+ +-------+ +-------+
```

## Speckit Commands

Run from Cursor (`/speckit.*`):

| Command | What it does |
|---------|-------------|
| `/speckit.constitution` | Generate or update the constitution |
| `/speckit.specify` | Create feature spec with prioritized user stories |
| `/speckit.clarify` | Resolve ambiguities through structured questioning |
| `/speckit.plan` | Generate technical plan (must pass Constitution Check) |
| `/speckit.tasks` | Break plan into tasks organized by user story |
| `/speckit.analyze` | Cross-artifact consistency check |
| `/speckit.checklist` | Validate requirements quality |
| `/speckit.implement` | Execute tasks in order, verify against spec |
| `/speckit.taskstoissues` | Push tasks to GitHub Issues |

## Repo Structure

```
.cursor/commands/          # Speckit Cursor slash commands (9)
.specify/
  memory/
    constitution.md        # Hiring pipeline constitution (v1.0.0)
  templates/               # Spec, plan, tasks, checklist templates
  scripts/bash/            # Automation scripts
  features/                # Feature specs (created per feature)
specs/
  001-bridge-traits-cubby/ # Feature: Bridge candidate traits to cubby
    spec.md                # Feature specification
    plan.md                # Technical plan
    data-model.md          # Data model
    research.md            # Research notes
    quickstart.md          # Quick start guide
    checklists/            # Requirements checklists
    contracts/             # Zod schemas (trait-signal-schema.ts)
package.json               # Node dependencies (zod)
```

## Current Work

| Feature | Branch | Status |
|---------|--------|--------|
| 001 — Bridge candidate traits to cubby | `001-bridge-traits-cubby` | 🔨 In Progress |

**What's in scope:** Extract `TraitSignal` from `candidate-processor.ts` → validate with zod → write to `hiring-traits` cubby. No PII in payload. Notion write unchanged.

**Next steps:** Implement `trait-extractor.ts`, `cubby-integration.ts`, and vitest tests per [plan.md](specs/001-bridge-traits-cubby/plan.md).

---

## Quick Start

```bash
# Open in Cursor, then start a feature:
/speckit.specify "Bridge candidate traits into hiring-traits cubby"

# Follow the chain:
/speckit.clarify → /speckit.plan → /speckit.tasks → /speckit.implement
```

## Phases

| Phase | Goal | Acceptance |
|-------|------|------------|
| **1: Bridge** | Wire existing data into cubbies | ATS → traits cubby, AI score → scores cubby, transcripts → interviews cubby |
| **2: Distillation** | Compound learning loop | Outcomes update `hiring-meta` weights, scorer reads live weights |
| **3: Full Loop** | Automated feedback | 3-month auto-prompts, weight drift dashboard, cross-candidate similarity |

## Links

- **Spec**: [Notion — Hiring Pipeline Compound Intelligence](https://www.notion.so/Spec-Hiring-Pipeline-Compound-Intelligence-30dd800083d68036b023f7a996f62eec)
- **Implementation**: [cere-io/HR-2026-E2E](https://github.com/cere-io/HR-2026-E2E)
- **Upstream framework**: [github/spec-kit](https://github.com/github/spec-kit)
- **Reference setup**: [ddc-node/.cursor/commands/](https://github.com/Cerebellum-Network/ddc-node/tree/dev/.cursor/commands)
