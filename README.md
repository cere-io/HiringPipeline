# Compound Intelligence — GraphRAG Knowledge Graph

Domain-agnostic intelligence engine with a **knowledge graph** layer. Extracts traits, scores subjects, learns from outcomes, and builds a queryable graph of entities and relationships. Designed as a modular component that plugs into existing infrastructure.

**Live:** [hiring-pipeline.vercel.app](https://hiring-pipeline.vercel.app)

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    AGENT PROCESSING LAYER                     │
│                                                               │
│  Agents:  Extractor → Scorer → Distiller → Analyzer          │
│           PatternDiscovery → GraphIndexer → QueryEngine       │
│                                                               │
│  Schema:  Dynamic trait schemas (any domain)                  │
│  Storage: Postgres / Memory (pluggable)                       │
│  LLM:    Gemini (pluggable — OpenAI, etc.)                   │
│                                                               │
│  API:  /api/v1/extract    /api/v1/score                      │
│        /api/v1/distill    /api/v1/analyze                    │
│        /api/v1/graph      /api/v1/index-graph                │
│        /api/v1/schemas    /api/v1/analytics                  │
│        /api/v1/patterns   /api/v1/seed                       │
└──────────────────────┬────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌───────────┐ ┌────────────────┐
│  Join.com    │ │  Notion   │ │  Generic       │
│  Adapter     │ │  Adapter  │ │  Webhook       │
└──────────────┘ └───────────┘ └────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │    KNOWLEDGE GRAPH       │
        │                          │
        │  graph_nodes (entities)  │
        │  graph_edges (relations) │
        │  graph_queries (presets) │
        │  pgvector (embeddings)   │
        └──────────────────────────┘
```

### Intelligence SDK (`ui/src/lib/compound-intelligence/`)

| Agent | What it does |
|-------|-------------|
| **Extractor** | Takes text + schema → structured traits |
| **Scorer** | Takes traits + weights → composite score 0-100 |
| **Distiller** | Takes outcome → adjusts weights (learning loop) |
| **Analyzer** | Takes documents → dimensional scores |
| **PatternDiscovery** | Finds trait clusters across subjects |
| **GraphIndexer** | Converts traits/scores/analyses into graph nodes and edges |
| **GraphQueryEngine** | Natural language queries against the knowledge graph |

### ATS Adapters (`ui/src/lib/adapters/`)

| Adapter | Status |
|---------|--------|
| **Join.com** | Implemented — polls API, downloads PDFs, extracts text |
| **Notion** | Implemented — ingests candidates from Notion databases |
| **Generic Webhook** | Implemented — field mapping for any JSON payload |

## UI Dashboard

Three-tab GraphRAG Explorer:

| Tab | Features |
|-----|----------|
| **Graph Queries** | Natural language query input, categorized preset queries (Talent Intelligence, Pattern Insights, Compounding, Cross-Domain), force-directed graph visualization with zoom/pan/click, node detail panel, answer display |
| **Agent Flows** | Visual processing pipeline (Ingest → Extract → Score → Analyze → Distill → Index → Graph), data flow description, graph statistics, node/edge breakdowns |
| **Indexing** | Run full reindex, connected adapter status, indexing job history, graph node/edge statistics |

### Graph Query Categories

| Category | Example Queries |
|----------|----------------|
| **Talent Intelligence** | "Who are the strongest candidates?", "Startup + Big Tech mix", "Best role fit" |
| **Pattern Insights** | "Winning traits", "Rejection patterns", "High scorer profile" |
| **Compounding** | "Weight evolution", "Strongest signals", "Learning velocity" |
| **Cross-Domain** | "Open source vs interviews", "Education vs outcomes", "Company caliber vs performance" |

## Quick Start

```bash
cd ui
npm install
cp .env.local.example .env.local  # Add your keys
npm run dev -- -p 3006
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `NEXT_PUBLIC_SUPABASE_URL` | For Postgres mode | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For Postgres mode | Supabase service role key |
| `STORAGE_MODE` | No | `mock` for in-memory, omit for Postgres |
| `JOIN_API_TOKEN` | No | Join.com API token |
| `NOTION_API_KEY` | No | Notion API key |

## v1 API Reference

### GraphRAG
| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/graph` | GET | Get graph data, stats, and preset queries |
| `/api/v1/graph` | POST | Execute NL query or preset query against graph |
| `/api/v1/index-graph` | POST | Run full reindex to build/rebuild knowledge graph |
| `/api/v1/index-graph` | GET | Get indexing jobs and stats |

### Intelligence Engine
| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/extract` | POST | Extract traits + dual-write to graph |
| `/api/v1/score` | POST | Score subject + dual-write to graph |
| `/api/v1/distill` | POST | Feed outcome + dual-write to graph |
| `/api/v1/analyze` | POST | Analyze document + dual-write to graph |
| `/api/v1/weights` | GET | Get current weights |
| `/api/v1/analytics` | GET | Full analytics |
| `/api/v1/patterns` | POST/GET | Discover trait patterns |
| `/api/v1/seed` | POST | Seed test candidates |

### Schema Management
| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/schemas` | GET | List all trait schemas |
| `/api/v1/schemas` | POST | Create schema |

## Database

Run migrations in order:
1. `ui/supabase/migration.sql` — v1 tables
2. `ui/supabase/migration-v2.sql` — v2 tables (schemas, CI data)
3. `ui/supabase/migration-v3.sql` — v3 tables (knowledge graph, pgvector)

### v3 Tables (GraphRAG)
`graph_nodes`, `graph_edges`, `graph_queries`, `graph_index_jobs`

### v2 Tables
`trait_schemas`, `schema_weights`, `ci_traits`, `ci_scores`, `ci_outcomes`, `ci_analyses`, `ci_signals`, `ci_sourcing_stats`, `ci_experiments`, `ci_adapter_connections`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router) |
| Runtime | React 19.2.3, TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Database | Supabase (Postgres) + pgvector |
| Graph Viz | d3-force (canvas-based) |
| LLM | Google Gemini (pluggable) |
| Deployment | Vercel |

## Dual-Write Architecture

Every candidate update (extract, score, distill, analyze) automatically writes to:
1. **Flat tables** (ci_traits, ci_scores, etc.) for backward compatibility
2. **Knowledge graph** (graph_nodes, graph_edges) for graph queries and visualization

The knowledge graph compounds intelligence by building entity relationships that grow with each new data point.
