# ADR: Candidate Trait Extraction & Reshuffling Loop

**Date**: February 27, 2026
**Status**: Ready for Implementation (Phase 1 & Phase 2)
**Authors**: Martijn, Fred Jin, Sergey

## The Goal
The core objective is to move from a standard ATS (unstructured candidates treated equally) to an **AI-driven pattern-matching engine**. 

We need to ingest candidates from Notion, vectorise their nuanced traits (e.g. specific hard things they've built, hackathons, open source contributions), and store them in Cere Cubbies. We then need a closed feedback loop: as human interviewers provide a final score (1-10), the system must autonomously recalculate how heavily it weighs certain traits, making our candidate screening continuously smarter and self-correcting.

## Phase 1: The Bridge (Candidate Ingest & Trait Vectorization)
The first lab functionality focuses purely on extracting the unstructured data, parsing it into structured schemas, rating the nuance, and writing it to the `hiring-traits` Cubby.

**Key Architecture Decisions:**
- **Extraction Model:** Gemini 2.5 Pro (via Vercel AI SDK). We built a Next.js `trait-tester` sandbox that successfully proves multi-PDF and batch parsing capabilities natively before pushing to the pipeline.
- **Nuanced Trait Vectorization:** We updated the `001-bridge-traits-cubby` specs to explicitly capture nuanced signals (e.g., Waterloo/Toronto over standard schools, reverse-engineering SQLite). 
- **Nuanced Trait Ratings:** Instead of just extracting strings, the AI scores each extracted trait from `0-10`.
- **Conclusive Score:** A deterministic weighted sum of the trait ratings (Hard Things Done x3.5, Company Signals x2.5, Open Source x2.0, Hackathons x1.0, Schools x1.0) yields a final `conclusive_score` out of 100.
- **Storage:** Persisted in the `hiring-traits` Cubby using the `CubbyClient`.

🔗 **[View Phase 1 Specs on GitHub](https://github.com/cere-io/HiringPipeline/tree/001-bridge-traits-cubby/specs/001-bridge-traits-cubby)**
🔗 **[View the Working Local Prototype (trait-tester)](https://github.com/cere-io/HiringPipeline/tree/001-bridge-traits-cubby/testing-tools/trait-tester)**

## Phase 2: The Reshuffle Agent (Continuous Feedback Loop)
The second lab functionality closes the loop. It ingests the human ground truth, runs mathematical regressions against the AI's scores, and adjusts the trait weights accordingly.

**Key Architecture Decisions:**
- **Event-Driven Ingestion:** A `POST /notion` webhook receives the `page.updated` event from Notion when an interviewer updates the `Interview Score` property. It produces a `NotionScorecardUpdated` Kafka event.
- **Native Cere Compute:** The Reshuffle Engine is a Cere-native agent (not a Node CRON job). It subscribes to Kafka streams and executes the weight recalibrations.
- **Secondary Indexing:** Because the `CubbyClient` currently lacks direct field-level filtering, we maintain an array of `scored_candidates` inside a `hiring-meta` cubby to allow the Reshuffle Agent to bulk-fetch only candidates that have human scores.
- **Deterministic Math:** We use standard linear regression (not an LLM) to calculate the new optimal trait weights based on the human feedback, guaranteeing mathematical precision.

🔗 **[View Phase 2 Specs on GitHub](https://github.com/cere-io/HiringPipeline/tree/001-bridge-traits-cubby/specs/002-trait-reshuffle-agent)**

## Next Steps / "Lab" Huddle
Per Fred's guidance on Feb 27: *"What's that one functionality you're trying to get working? And just focus on that. And then we demo it and go over it... The process here is more of a quickly experiment, run a lab, and then, and then run a lab again."*

1. **Sergey**: Implement the `001-bridge-traits-cubby` extraction logic and write to the Cubby using the predefined `TraitSignalSchema`. You can validate your output against the local Next.js `trait-tester` prototype.
2. **Huddle / Demo 1**: Review the real JSON traits flowing into the Cubby.
3. **Sergey**: Deploy the `002-trait-reshuffle-agent` to Cere native compute to start adjusting the weights based on Notion Webhook ingest.
4. **Huddle / Demo 2**: Review the vectorization loop updating the `hiring-meta` cubby.
