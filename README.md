# Hiring Pipeline — Compound Intelligence

AI-powered hiring pipeline that makes every hire smarter than the last. Integrates with **Join.com** for candidate sourcing, uses **Gemini AI** for trait extraction and scoring, and builds a compound intelligence system that learns from human decisions.

**Live:** [hiring-pipeline.vercel.app](https://hiring-pipeline.vercel.app)

## How It Works

```
Join.com ATS ──► Cron Poller ──► Trait Extractor (Gemini) ──► Scorer (Gemini)
                                        │                          │
                                        ▼                          ▼
                                  Profile DNA               AI Score (0-100)
                                  Dimensions                 Reasoning
                                        │                          │
                                        └──────────┬───────────────┘
                                                   ▼
                                          Human Review (1-10)
                                          + Trait-level reasons
                                                   │
                                                   ▼
                                      Distillation Agent (Gemini)
                                      ├── Updates role weights
                                      ├── Indexes trait signals
                                      └── Tracks sourcing stats
                                                   │
                                                   ▼
                                        Compound Intelligence
                                        ├── Winning DNA (radar charts)
                                        ├── Startup Fit (6-axis)
                                        ├── Trait Breakdown
                                        └── Signal Catalog
```

## 6-Step Pipeline

| Step | What Happens |
|------|-------------|
| **1. Apply** | Candidate submits resume (manual paste, PDF upload, or auto-synced from Join.com) |
| **2. AI Score** | Gemini extracts traits, dimensions, Profile DNA, then scores 0-100 with reasoning |
| **3. Human Review** | Reviewer scores 1-10 with trait-level reasons. Distillation agent adjusts role weights |
| **4. Interview** | Transcript analyzed by Gemini for technical depth, communication, cultural fit, problem-solving, and Startup Fit (6 axes) |
| **5. Distill** | Performance review after hire. Compound intelligence loop updates weights again |
| **6. Done** | Candidate journey complete. Weights, signals, and patterns feed into next candidate |

## Compound Intelligence

The system learns from every decision:

- **Winning DNA** — Radar chart comparing winners vs rejects across 6 Profile DNA axes + 6 Startup Fit axes
- **Trait Breakdown** — Statistical analysis of which traits correlate with successful hires
- **Signal Catalog** — Qualitative signals from human review reasons, tracked across candidates
- **Role Weights** — Dynamic scoring weights that shift based on hire outcomes

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 16, React 19, Tailwind 4 |
| AI | Google Gemini 2.0/2.5 Flash |
| Database | Supabase (Postgres) |
| ATS Integration | Join.com API v2 |
| Deployment | Vercel (serverless) |
| Roles | Notion API |

## Quick Start

```bash
cd ui
npm install
cp .env.local.example .env.local  # Add your keys
npm run dev -- -p 3006
```

Open [http://localhost:3006](http://localhost:3006).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `JOIN_API_TOKEN` | Yes | Join.com API token (Advanced/Enterprise plan) |
| `NOTION_API_KEY` | Optional | Notion API key for dynamic role list |
| `NOTION_ROLES_DB_ID` | Optional | Notion database ID for roles |
| `STORAGE_MODE` | Optional | `mock` (default) / `dual` / `postgres` |
| `CRON_SECRET` | Auto | Set by Vercel for cron job auth |

## API Routes

### Pipeline
| Route | Method | Description |
|-------|--------|-------------|
| `/api/pipeline/extract` | POST | Extract traits from resume (Edge Runtime) |
| `/api/pipeline/score` | POST | Score candidate from extracted traits |
| `/api/advance` | POST | Advance or reject candidate in pipeline |
| `/api/distill` | POST | Submit human review, trigger distillation |

### Join.com Integration
| Route | Method | Description |
|-------|--------|-------------|
| `/api/cron/join-poll` | GET | Poll Join for new applications (daily cron) |
| `/api/join/latest` | GET | Get the most recent Join candidate |
| `/api/webhooks/join` | POST | Receive Join webhook / manual sync |

### Data & Candidates
| Route | Method | Description |
|-------|--------|-------------|
| `/api/data` | GET | All pipeline data (traits, scores, outcomes, statuses, analytics) |
| `/api/candidates/[id]` | GET | Single candidate detail |
| `/api/candidates/delete` | POST | Remove candidate from all tables |
| `/api/health` | GET | System health check |

### Webhooks
| Route | Method | Description |
|-------|--------|-------------|
| `/api/webhooks/interview` | POST | Submit interview transcript for analysis |
| `/api/webhooks/notion` | POST | Receive human score from Notion |
| `/api/upload` | POST | Upload PDF resume for text extraction |

## Database Schema (Supabase)

| Table | Purpose |
|-------|---------|
| `candidate_traits` | Skills, experience, dimensions, Profile DNA, candidate name |
| `candidate_scores` | AI composite score, reasoning, weights used |
| `candidate_outcomes` | Human review scores, performance reviews |
| `interview_analyses` | Interview scores, summary, Startup Fit, red flags |
| `role_weights` | Dynamic scoring weights per role |
| `sourcing_stats` | Aggregate stats per source (Join, Wellfound, etc.) |
| `pipeline_events` | Audit trail for all pipeline events |

## Project Structure

```
ui/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Main UI (pipeline stepper + compound intelligence)
│   │   └── api/                        # 16 API routes
│   └── lib/
│       ├── runtime.ts                  # Lazy cubby initialization (Vercel-compatible)
│       ├── join-client.ts              # Join.com API v2 client
│       ├── supabase.ts                 # Supabase client
│       ├── postgres-cubby.ts           # Postgres-backed cubby storage
│       ├── dual-write-cubby.ts         # Dual-write (mock + Postgres)
│       └── agents/
│           ├── concierge.ts            # Orchestrates extract → score
│           ├── trait-extractor.ts       # Gemini trait extraction
│           ├── scorer.ts               # Gemini composite scoring
│           ├── transcript-analyzer.ts   # Interview transcript analysis + Startup Fit
│           ├── distillation.ts          # Weight adjustment + signal indexing
│           └── types.ts                # All TypeScript types
├── supabase/
│   └── migration.sql                   # Database schema
└── vercel.json                         # Vercel config + cron schedule
```

## Deployment

Deployed on Vercel with auto-deploy from `main` branch.

- **Production:** [hiring-pipeline.vercel.app](https://hiring-pipeline.vercel.app)
- **Cron:** Daily at 9 AM UTC — polls Join.com for new candidates
- **Root Directory:** `ui`

### Required Vercel Environment Variables
Set these in Vercel Project Settings → Environment Variables:
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JOIN_API_TOKEN`
- `STORAGE_MODE=dual`
