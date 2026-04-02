# Compound Intelligence — GraphRAG Knowledge Graph

Domain-agnostic intelligence engine with a **knowledge graph** layer. Extracts traits, scores subjects, learns from outcomes, ingests human feedback from Notion comments, and builds a queryable graph of entities, signals, and candidate similarity. Designed as a modular component that plugs into existing infrastructure.

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
│        /api/v1/patterns   /api/v1/reset                      │
└──────────────────────┬────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌───────────┐ ┌────────────────┐
│  Join.com    │ │  Notion   │ │  Generic       │
│  Adapter     │ │  Adapter  │ │  Webhook       │
│              │ │ +Comments │ │                │
└──────────────┘ └───────────┘ └────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │    KNOWLEDGE GRAPH       │
        │                          │
        │  Candidates (status)     │
        │  Signals (strengths/     │
        │    risks from feedback)  │
        │  Skill Categories        │
        │  Similarity Edges        │
        │  Roles                   │
        └──────────────────────────┘
```

### Intelligence SDK (`ui/src/lib/compound-intelligence/`)

| Agent | What it does |
|-------|-------------|
| **Extractor** | Takes text + schema → structured traits |
| **Scorer** | Takes traits + weights → composite score 0-10 |
| **Distiller** | Takes outcome → adjusts weights (learning loop) |
| **Analyzer** | Takes documents → dimensional scores |
| **PatternDiscovery** | Finds trait clusters across subjects |
| **GraphIndexer** | Converts traits/scores/feedback into graph with similarity edges and signal nodes |
| **GraphQueryEngine** | Natural language queries against the knowledge graph |

### ATS Adapters (`ui/src/lib/adapters/`)

| Adapter | Status |
|---------|--------|
| **Join.com** | Implemented — polls API, downloads PDFs, extracts text |
| **Notion** | Implemented — ingests candidates + **page comments as human feedback** |
| **Generic Webhook** | Implemented — field mapping for any JSON payload |

## Key Features

### Notion Comment Ingestion
Notion page comments are automatically parsed into structured evaluator feedback:
- **Verdict** detection (positive/negative/neutral)
- **Score** extraction (e.g., "Score: 7/10")
- **Strengths/Risks** parsing into discrete signal nodes
- Each comment feeds the distiller to adjust scoring weights

### Knowledge Graph Structure

| Node Type | What it represents |
|-----------|-------------------|
| **Candidate** | Person — colored by status (green=hired, red=rejected, blue=pending), score shown inside |
| **Signal** | Human insight from feedback — diamond-shaped, green for strengths, red for risks |
| **Skill Category** | Aggregated skill group (Backend & Systems, Blockchain & Web3, Data & AI/ML, etc.) |
| **Role** | Position applied for (Blockchain Engineer, Founding Platform Engineer, etc.) |

| Edge Type | What it connects |
|-----------|-----------------|
| **similar_to** | Candidate ↔ Candidate — cosine similarity on ratings + Jaccard on skill categories |
| **has_signal** | Candidate → Signal — human-observed strength or risk |
| **has_skill** | Candidate → Skill Category — aggregated technical domain |
| **applied_for** | Candidate → Role |

### Graph Views

| View | Shows | Use case |
|------|-------|----------|
| **Compact** | Candidates + Roles + Signals + Similarity | Quick overview of people, signals, and connections |
| **Standard** | + Skill Categories | See technical domain overlap |
| **Detailed** | + Trait nodes (ratings, experience, education) | Deep dive into trait-level connections |
| **Full** | + Individual skills | Raw data exploration |

### Candidate Similarity
Computed at index time using:
- **60% cosine similarity** on rating vectors (hard things done, company signals, open source, etc.)
- **40% Jaccard similarity** on skill category overlap
- Pairs above 50% match threshold get a `similar_to` edge

### Compound Intelligence Loop
```
Notion Comment → Parse (verdict, score, strengths, risks)
  → Distiller (adjusts scoring weights)
  → Signal Catalog (accumulates patterns)
  → Graph (signal nodes shared across candidates)
  → Future candidates scored with learned weights
```

## UI Dashboard

| Tab | Features |
|-----|----------|
| **Graph Queries** | Role filter (position toggle), detail level selector, NL query input, categorized preset queries, force-directed graph with curved edges and glow effects, node detail panel with evaluator feedback and similarity |
| **Candidates** | Candidate list with scores, add new via paste, interview transcript analysis, human feedback submission |
| **Agent Flows** | Visual processing pipeline, graph statistics, node/edge breakdowns |
| **Indexing** | Connect Notion/Webhook/API, run reindex, adapter status, job history |

## Quick Start

```bash
cd ui
npm install
cp .env.local.example .env.local  # Add your keys
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `NEXT_PUBLIC_SUPABASE_URL` | For Postgres mode | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For Postgres mode | Supabase service role key |
| `STORAGE_MODE` | No | `mock` for in-memory, omit for Postgres |
| `NOTION_API_KEY` | No | Notion API key (for comment ingestion) |

## v1 API Reference

### GraphRAG
| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/graph` | GET | Get graph data, stats, and preset queries |
| `/api/v1/graph` | POST | Execute NL query or preset query against graph |
| `/api/v1/index-graph` | POST | Run full reindex (builds similarity edges + signal nodes) |
| `/api/v1/index-graph` | GET | Get indexing jobs and stats |
| `/api/v1/reset` | POST | Clear all data for a schema (traits, scores, graph, signals) |

### Intelligence Engine
| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/extract` | POST | Extract traits from text |
| `/api/v1/score` | POST | Score subject against role weights |
| `/api/v1/distill` | POST | Feed outcome to adjust weights |
| `/api/v1/analyze` | POST | Analyze interview transcript |
| `/api/v1/weights` | GET | Get current weights |
| `/api/v1/analytics` | GET | Full analytics |
| `/api/v1/patterns` | POST/GET | Discover trait patterns |

### Adapters
| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/adapters/connect` | POST/GET | Connect/list data source adapters |
| `/api/v1/adapters/poll` | POST | Poll Notion for new candidates + comments |

## Database

Run migrations in order:
1. `ui/supabase/migration.sql` — v1 tables
2. `ui/supabase/migration-v2.sql` — v2 tables (schemas, CI data)
3. `ui/supabase/migration-v3.sql` — v3 tables (knowledge graph, pgvector)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router) |
| Runtime | React 19, TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Database | Supabase (Postgres) + pgvector |
| Graph Viz | d3-force (HiDPI canvas, curved bezier edges) |
| LLM | Google Gemini (pluggable) |
| Deployment | Vercel |
