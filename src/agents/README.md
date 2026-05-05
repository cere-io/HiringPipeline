# Prototype agents — NOT deployed

These are the original 5-agent prototype (concierge, trait-extractor, scorer, distillation, transcript-analyzer). They are **not** what runs in production.

Production code lives in **`ui/src/lib/compound-intelligence/agents/`** (and the legacy 5-agent shim at `ui/src/lib/agents/`).

The only reason this directory still exists is `scripts/replay-harness.ts` — the nightly regression harness runs against these prototype agents to provide a stable baseline. Don't add new features here.
