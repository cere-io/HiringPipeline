# Legacy 5-agent pipeline (deployed)

Concierge → TraitExtractor → Scorer → Distillation, plus TranscriptAnalyzer. Imported by `ui/src/lib/runtime.ts` and wired to MockCubby + Supabase.

Still deployed on Vercel alongside the newer Compound Intelligence engine at `../compound-intelligence/agents/`.

This is **not** the same code as the root-level `src/agents/` — that one is a prototype kept only for the nightly replay harness. The two have drifted.
