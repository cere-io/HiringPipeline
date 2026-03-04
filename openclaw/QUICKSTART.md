# OpenClaw Slack Bot — Quickstart Guide

> For the internal HR team at Cere. This guide gets you from zero to chatting with the Hiring Assistant in Slack.

---

## What Is This?

The **Hiring Assistant** is a Slack bot powered by [OpenClaw](https://docs.openclaw.ai) that connects to the Cere Hiring Intelligence pipeline. It lets you:

- **Look up any candidate** — ask for their AI score, extracted traits, interview analysis, and human feedback.
- **Submit a human review score (1–10)** — which triggers the Distillation Agent to update the role's scoring weights so the AI gets smarter over time.

You don't need to open any dashboards or Notion pages. Just chat.

---

## Prerequisites

| Requirement | How to check |
|---|---|
| Node.js 20+ | `node -v` |
| OpenClaw installed | `openclaw --version` (install: `npm i -g openclaw`) |
| This repo cloned | `cd ~/Downloads/HiringPipeline-main` |
| Gemini API key | Ask Martijn or check `ui/.env.local` |

---

## Step 1: Start the Pipeline

The Hiring Intelligence pipeline runs as a local Next.js app on port 3006.

```bash
cd ui
npm install        # first time only
npm run dev -- -p 3006
```

Verify it's running:

```bash
curl -s http://localhost:3006/api/data | jq .
```

You should see `{"traits":{},"scores":{},...}`.

---

## Step 2: Configure OpenClaw

### 2a. Set the Slack tokens

Your Slack App ("Hiring Assistant") needs two tokens. Get them from [api.slack.com/apps](https://api.slack.com/apps) → your app → **Basic Information** (App Token) and **OAuth & Permissions** (Bot Token).

```bash
openclaw config set channels.slack.botToken "xoxb-YOUR-BOT-TOKEN"
openclaw config set channels.slack.appToken "xapp-YOUR-APP-TOKEN"
```

### 2b. Set the LLM provider

We use Google Gemini (never OpenAI). Set your Gemini API key:

```bash
openclaw config set models.providers.google.apiKey "YOUR-GEMINI-API-KEY"
openclaw config set agents.defaults.model.primary "google/gemini-2.5-flash"
```

### 2c. Open up Slack access

Allow the bot to respond to DMs and channel mentions:

```bash
openclaw config set channels.slack.dmPolicy "open"
openclaw config set channels.slack.allowFrom '["*"]'
```

### 2d. Install the skill

Copy the skill file into your OpenClaw workspace:

```bash
mkdir -p ~/clawd/skills/cere-hiring-assistant
cp openclaw/skills/cere-hiring-assistant.yaml ~/clawd/skills/cere-hiring-assistant/
cp openclaw/skills/cere-hiring-assistant.yaml ~/clawd/skills/cere-hiring-assistant/SKILL.md
```

Also ensure `MEMORY.md` in your workspace (`~/clawd/MEMORY.md`) contains the API instructions. The key section:

```markdown
## Cere Hiring Assistant — Slack Bot Skill

When someone asks about a candidate, ALWAYS use bash to call:
curl -s http://localhost:3006/api/candidates/{candidateId}

When someone wants to rate a candidate, use:
curl -s -X POST http://localhost:3006/api/distill \
  -H "Content-Type: application/json" \
  -d '{"candidateId":"{id}","role":"{role}","outcome":{score}}'
```

---

## Step 3: Start OpenClaw

```bash
openclaw gateway
```

You should see:

```
[gateway] agent model: google/gemini-2.5-flash
[slack] socket mode connected
```

If the gateway is already running, restart it:

```bash
pkill -f openclaw-gateway && sleep 2 && openclaw gateway
```

---

## Step 4: Use It in Slack

### Look up a candidate

In any channel where the bot is invited (or via DM):

```
@Hiring Assistant how did candidate test2 do?
```

The bot will call the pipeline API and respond with:
- Composite AI score (0–100)
- Extracted traits (skills, experience, education, hard things done)
- Interview analysis (if available)
- Human score (if submitted)

### Submit a human review score

```
@Hiring Assistant rate test2 a 7/10 for Senior Backend Engineer
```

The bot will:
1. Parse the candidate ID, score, and role
2. Call the Distillation Agent via `/api/distill`
3. Confirm the score was recorded and weights were updated

If you leave out the candidate ID or role, the bot will ask you for them.

### Available roles

- Senior Backend Engineer
- Founder's Associate (Business Ops)
- AI Innovator
- Principal Fullstack Engineer
- Blockchain Engineer

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Bot doesn't respond | Check `openclaw status` — Slack should show `OK` |
| "Thinking level not supported" error | Run `openclaw config set agents.defaults.model.primary "google/gemini-2.5-flash"` and restart |
| "Candidate not found" | The pipeline server restarted and mock cubbies were wiped. Submit a new candidate via the UI at `http://localhost:3006` |
| Bot asks about Telegram instead of using API | Restart the gateway: `pkill -f openclaw-gateway && sleep 2 && openclaw gateway` |
| Port 3006 in use | `lsof -i :3006 \| awk 'NR!=1 {print $2}' \| xargs kill -9` then restart |

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐
│  Slack (#hiring)    │     │  OpenClaw Gateway         │
│                     │────▶│  (Personal AI)            │
│  @Hiring Assistant  │     │  Gemini 2.5 Flash         │
│  how did test2 do?  │◀────│  Parses intent → curl     │
└─────────────────────┘     └──────────┬───────────────┘
                                       │
                            curl localhost:3006/api/...
                                       │
                            ┌──────────▼───────────────┐
                            │  Hiring Pipeline          │
                            │  (Sovereign AI)           │
                            │                           │
                            │  Trait Extractor Agent    │
                            │  Scorer Agent             │
                            │  Interview Agent          │
                            │  Distillation Agent       │
                            │  Concierge (Orchestrator) │
                            │                           │
                            │  DDC Cubbies (mock)       │
                            │  hiring-traits            │
                            │  hiring-scores            │
                            │  hiring-interviews        │
                            │  hiring-outcomes          │
                            │  hiring-meta (weights)    │
                            └───────────────────────────┘
```

---

## Links

- **Pipeline Repo:** [github.com/cere-io/HiringPipeline](https://github.com/cere-io/HiringPipeline)
- **OpenClaw Docs:** [docs.openclaw.ai](https://docs.openclaw.ai)
- **Cubby Developer Guide:** [CUBBY.md](https://github.com/Cerebellum-Network/ddc-node/blob/dev/docs/compute/agent-runtime/CUBBY.md)
- **ADR on Notion:** [ADR-Hiring-Pipeline-on-RAZ](https://www.notion.so/cere/ADR-Hiring-Pipeline-on-RAZ-314d800083d68068b54ffacdf480d75f)
