# Production agents

This is the production Compound Intelligence engine deployed on Vercel.

| Agent | File |
|---|---|
| Extractor | `extractor.ts` |
| Scorer | `scorer.ts` |
| Distiller | `distiller.ts` |
| Analyzer | `analyzer.ts` |
| PatternDiscovery | `pattern-discovery.ts` |
| GraphIndexer | `indexer.ts` |
| QueryEngine | `query-engine.ts` |

Wired into Next.js API routes under `ui/src/app/api/v1/*`. See top-level `README.md` for the full request flow.

The legacy 5-agent pipeline at `../agents/` is still imported by `ui/src/lib/runtime.ts` for the original hiring flow — both coexist on production today.
