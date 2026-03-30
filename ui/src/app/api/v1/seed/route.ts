import { NextResponse } from 'next/server';
import { getCI, getStorage, getExperimentTracker } from '@/lib/compound-intelligence/runtime';
import type { ExtractedTraits } from '@/lib/compound-intelligence/types';

interface SeedCandidate {
  name: string;
  role: string;
  status: string;
  text: string;
}

const CANDIDATES: SeedCandidate[] = [
  {
    name: 'Priya Sharma',
    role: 'Senior Frontend Engineer',
    status: 'Hired',
    text: `Priya Sharma — Senior Frontend Engineer

Education: MS Computer Science, Stanford University (2016)

Experience: 8 years
- Staff Engineer at Stripe (2021–present): Led the redesign of Stripe's payment elements SDK, used by 3M+ merchants. Built a custom rendering engine that reduced bundle size by 62%. Managed a team of 6 engineers.
- Senior Engineer at Airbnb (2018–2021): Core contributor to Airbnb's design system (DLS). Built the dynamic pricing visualization used across all listing pages. Shipped accessibility improvements achieving WCAG 2.1 AA compliance.
- Frontend Engineer at a YC W16 startup (2016–2018): Employee #3. Built the entire customer-facing web app from scratch using React. Company raised Series A ($12M).

Technical Skills: React, TypeScript, WebGL, Rust (WASM), GraphQL, Figma API, Playwright, Storybook, Tailwind CSS, Node.js
Company Stages: startup, series_a, growth, public
Hard Things Built: Custom rendering engine at Stripe reducing 62% bundle size; built entire web app as employee #3 at startup; led WCAG 2.1 AA accessibility overhaul at Airbnb
Open Source: Maintainer of "react-perf-tools" (2.4k GitHub stars), contributor to Radix UI
Hackathons: Won HackMIT 2015 (1st place), participated in Stripe CTF
Company Signals: Stripe (staff level), Airbnb, YC-backed startup`,
  },
  {
    name: 'Marcus Chen',
    role: 'Backend Engineer',
    status: 'Hired',
    text: `Marcus Chen — Backend Engineer

Education: BS Computer Science, UC Berkeley (2014)

Experience: 10 years
- Principal Engineer at Datadog (2020–present): Architected the real-time log aggregation pipeline processing 15TB/day. Designed the multi-tenant isolation layer. Filed 2 patents on distributed tracing.
- Senior Engineer at Dropbox (2017–2020): Rebuilt the file sync engine in Rust, reducing sync latency by 40%. Led the migration from Python 2 to Python 3 across 2M lines of code.
- Engineer at Square (2014–2017): Built fraud detection microservices processing 50k transactions/second.

Technical Skills: Go, Rust, Python, Kafka, PostgreSQL, Redis, gRPC, Kubernetes, Terraform, ClickHouse
Company Stages: growth, public
Hard Things Built: Real-time log pipeline at 15TB/day; rebuilt file sync engine in Rust; fraud detection at 50k TPS
Open Source: Creator of "streamql" query language for streaming data (5.1k stars), contributor to Apache Kafka
Hackathons: Won Facebook Hacker Cup 2016 (top 100)
Company Signals: Datadog (principal), Dropbox, Square`,
  },
  {
    name: 'Sarah Kim',
    role: 'Full Stack Engineer',
    status: 'Offer Accepted',
    text: `Sarah Kim — Full Stack Engineer

Education: BS Computer Engineering, MIT (2019)

Experience: 5 years
- Senior Engineer at Vercel (2022–present): Core contributor to Next.js App Router. Built the incremental static regeneration v2 system. Regularly presents at Next.js Conf.
- Engineer at Notion (2020–2022): Built the real-time collaboration engine for Notion databases. Implemented operational transforms for concurrent editing.
- Intern at Google (2018): Worked on Chrome DevTools performance panel.

Technical Skills: TypeScript, React, Next.js, Node.js, PostgreSQL, Redis, WebSockets, Rust, Vercel Edge Functions, Prisma
Company Stages: startup, growth, public
Hard Things Built: ISR v2 for Next.js; real-time collab engine at Notion; contributed to Chrome DevTools
Open Source: Core contributor to Next.js (50+ merged PRs), created "edge-cache" library (1.8k stars)
Hackathons: Won TreeHacks 2019, HackMIT 2018 finalist
Company Signals: Vercel, Notion, Google`,
  },
  {
    name: 'James Rodriguez',
    role: 'ML Engineer',
    status: 'Company Rejected',
    text: `James Rodriguez — ML Engineer

Education: PhD Machine Learning, Carnegie Mellon University (2020)

Experience: 4 years
- ML Engineer at Scale AI (2022–present): Builds data labeling pipelines and RLHF training workflows. Works on instruction tuning for LLMs.
- Research Engineer at DeepMind (2020–2022): Published 3 papers on reinforcement learning. Contributed to AlphaFold protein structure prediction pipeline.

Technical Skills: Python, PyTorch, JAX, TensorFlow, CUDA, Triton, Hugging Face, Ray, Kubernetes, MLflow, SQL
Company Stages: growth, public
Hard Things Built: RLHF training pipeline at Scale AI; contributed to AlphaFold; published 3 RL papers at top venues
Open Source: Author of "fast-rlhf" training framework (3.2k stars), contributor to Hugging Face Transformers
Hackathons: NeurIPS competition winner (2019), Kaggle Grandmaster
Company Signals: Scale AI, DeepMind/Google`,
  },
  {
    name: 'Alex Thompson',
    role: 'Frontend Engineer',
    status: 'Archived',
    text: `Alex Thompson — Frontend Engineer

Education: Bootcamp certificate, General Assembly (2021)

Experience: 3 years
- Junior Developer at a local agency (2022–present): Builds WordPress sites and landing pages. Some React work on client dashboards. Mostly follows tutorials and Stack Overflow.
- Freelance (2021–2022): Built 5 portfolio websites for small businesses using HTML/CSS/JavaScript.

Technical Skills: HTML, CSS, JavaScript, React (basic), WordPress, jQuery, Bootstrap
Company Stages: None notable
Hard Things Built: Nothing particularly complex or novel
Open Source: No contributions
Hackathons: None
Company Signals: Small local agency, no notable employers`,
  },
  {
    name: 'Elena Vasquez',
    role: 'Infrastructure Engineer',
    status: 'Hired',
    text: `Elena Vasquez — Infrastructure Engineer

Education: MS Distributed Systems, ETH Zurich (2017)

Experience: 7 years
- Staff SRE at Netflix (2021–present): Owns the chaos engineering platform. Built custom Kubernetes operators managing 200k+ containers. Reduced mean time to recovery by 73% through automated remediation.
- Senior Engineer at Cloudflare (2018–2021): Built edge caching infrastructure serving 25M requests/second. Designed the rate limiting engine used by 20% of the internet.
- Systems Engineer at Jane Street (2017–2018): Built low-latency trading infrastructure. Sub-microsecond message passing.

Technical Skills: Go, Rust, C++, Linux internals, eBPF, Kubernetes, Terraform, AWS, GCP, Prometheus, Grafana
Company Stages: growth, public
Hard Things Built: Chaos engineering platform at Netflix; edge caching at 25M req/sec; low-latency trading infra at Jane Street
Open Source: Creator of "kube-surgeon" Kubernetes operator toolkit (4.7k stars)
Hackathons: ICPC finalist (2015)
Company Signals: Netflix (staff), Cloudflare, Jane Street`,
  },
  {
    name: 'David Park',
    role: 'Backend Engineer',
    status: 'Rejected',
    text: `David Park — Backend Engineer

Education: BS Information Systems, State University (2019)

Experience: 5 years
- Engineer at mid-size consulting firm (2020–present): Builds CRUD APIs for enterprise clients. Works in Java/Spring Boot. Projects are typically internal tools and admin dashboards. No production scale beyond 100 users.
- Junior Developer at small SaaS company (2019–2020): Bug fixes and minor feature work on a Django app.

Technical Skills: Java, Spring Boot, Django, Python, MySQL, Docker, basic AWS
Company Stages: enterprise
Hard Things Built: Standard CRUD APIs for internal tools, nothing at notable scale
Open Source: Forked some repos but no meaningful contributions
Hackathons: Attended one local hackathon, didn't finish project
Company Signals: Mid-size consulting firm, small SaaS company`,
  },
  {
    name: 'Aisha Okonkwo',
    role: 'AI Engineer',
    status: 'Offer Accepted',
    text: `Aisha Okonkwo — AI Engineer

Education: MS AI, University of Oxford (2019); BS Mathematics, University of Lagos (2017)

Experience: 5 years
- Senior AI Engineer at Anthropic (2022–present): Works on constitutional AI training and red-teaming. Built the automated evaluation pipeline for Claude model releases. Manages safety benchmark suite.
- ML Engineer at Cohere (2020–2022): Built the embedding model fine-tuning pipeline. Shipped Cohere's first multilingual model supporting 100+ languages.
- Research Assistant at Oxford (2017–2019): Published paper on few-shot learning at ICML.

Technical Skills: Python, PyTorch, JAX, CUDA, Triton, distributed training, RLHF, eval frameworks, TypeScript, PostgreSQL
Company Stages: startup, growth
Hard Things Built: Automated eval pipeline for Claude; multilingual embedding model for 100+ languages; constitutional AI training infrastructure
Open Source: Contributor to LangChain and LlamaIndex, author of "eval-harness-extended" (2.1k stars)
Hackathons: Won AI Safety hackathon (2022), MLH finalist
Company Signals: Anthropic, Cohere, Oxford research`,
  },
  {
    name: 'Tom Baker',
    role: 'Full Stack Engineer',
    status: 'Declined',
    text: `Tom Baker — Full Stack Engineer

Education: Self-taught

Experience: 12 years
- CTO/Co-founder at failed startup (2022–present): Built a social commerce platform. Raised $2M seed round. Struggled with product-market fit and shut down after 18 months. Team of 4 engineers.
- Senior Engineer at Shopify (2017–2022): Built the storefront rendering engine serving 2M+ stores. Contributed to Hydrogen (React framework). Led migration to TypeScript.
- Developer at a digital agency (2012–2017): Full-stack web development. Built 50+ client projects.

Technical Skills: Ruby, Rails, TypeScript, React, Node.js, PostgreSQL, Redis, GraphQL, Docker, AWS
Company Stages: startup, growth, public
Hard Things Built: Storefront rendering at Shopify scale (2M stores); built and led engineering at a VC-backed startup; migrated large codebase to TypeScript
Open Source: Contributor to Ruby on Rails (12 merged PRs), created "shop-components" library
Hackathons: Won Shopify internal hackathon twice
Company Signals: Shopify, VC-backed startup (CTO)`,
  },
  {
    name: 'Mei Lin Zhang',
    role: 'Systems Engineer',
    status: 'Hired',
    text: `Mei Lin Zhang — Systems Engineer

Education: PhD Computer Science (Systems), University of Washington (2018)

Experience: 6 years
- Senior Engineer at Apple (2021–present): Works on the kernel team for Apple Silicon. Optimized memory management reducing power consumption by 15%. Built diagnostic tooling used by 200+ engineers internally.
- Engineer at Microsoft (2018–2021): Worked on the Azure Kubernetes Service control plane. Built the auto-scaling algorithm handling 500k+ node pools.

Technical Skills: C, C++, Rust, ARM assembly, Linux kernel, XNU, LLVM, systems profiling, eBPF, Kubernetes internals
Company Stages: public
Hard Things Built: Kernel optimizations for Apple Silicon; AKS auto-scaling at 500k+ nodes; custom diagnostic tools for hardware engineers
Open Source: Contributor to LLVM, authored 2 kernel patches merged into Linux mainline
Hackathons: ICPC World Finals (2014), won Systems research hackathon
Company Signals: Apple (kernel team), Microsoft (Azure)`,
  },
  {
    name: 'Ryan Cooper',
    role: 'Frontend Engineer',
    status: 'Company Rejected',
    text: `Ryan Cooper — Frontend Engineer

Education: BS Computer Science, University of Michigan (2020)

Experience: 4 years
- Mid-level Engineer at a fintech startup (Series B) (2021–present): Works on the customer dashboard. Built a real-time portfolio tracker with WebSocket data. Some performance optimization work. Reports indicate communication issues with product team.
- Junior Engineer at IBM (2020–2021): Worked on internal tooling. Left after 1 year due to slow pace.

Technical Skills: React, TypeScript, D3.js, WebSockets, Node.js, PostgreSQL, Docker
Company Stages: series_b, public
Hard Things Built: Real-time portfolio tracker; basic internal tooling
Open Source: A few small utilities on GitHub, <50 stars total
Hackathons: MHacks participant (no wins)
Company Signals: Series B fintech, IBM`,
  },
  {
    name: 'Nina Petrov',
    role: 'DevOps Engineer',
    status: 'Pending',
    text: `Nina Petrov — DevOps Engineer

Education: MS Computer Science, Technical University of Munich (2018)

Experience: 6 years
- Platform Engineer at Spotify (2021–present): Manages the internal developer platform serving 3000+ engineers. Built the golden path templates reducing onboarding time by 60%. Runs the Backstage instance for service catalog.
- DevOps Engineer at Zalando (2018–2021): Built CI/CD pipelines for 400+ microservices. Designed the multi-region deployment strategy across AWS and GCP.

Technical Skills: Kubernetes, Terraform, Go, Python, ArgoCD, Backstage, AWS, GCP, Datadog, PagerDuty, GitHub Actions
Company Stages: growth, public
Hard Things Built: Internal developer platform for 3000+ engineers; multi-region deployment across 400+ microservices; golden path templates
Open Source: Contributor to Backstage, creator of "terraform-modules-catalog" (1.5k stars)
Hackathons: Won internal Spotify hack week (2023)
Company Signals: Spotify, Zalando`,
  },
  {
    name: 'Chris Williams',
    role: 'Mobile Engineer',
    status: 'Pending',
    text: `Chris Williams — Mobile Engineer

Education: BS Software Engineering, Georgia Tech (2017)

Experience: 7 years
- Senior iOS Engineer at Uber (2020–present): Rebuilt the Uber Eats order tracking experience. Built a custom map rendering layer reducing battery drain by 30%. Mentors 3 junior engineers.
- iOS Engineer at Instagram (2018–2020): Worked on Stories camera effects. Built AR filters used by 50M+ users monthly.
- Mobile Dev at a startup (2017–2018): Built MVP iOS app. Company acquired by larger tech firm.

Technical Skills: Swift, SwiftUI, Objective-C, Kotlin, UIKit, CoreML, ARKit, MapKit, GraphQL, Bazel
Company Stages: startup, growth, public
Hard Things Built: Custom map renderer with 30% battery reduction; AR filters for 50M+ users; MVP leading to acquisition
Open Source: Creator of "swift-concurrency-utils" (900 stars), contributor to Kingfisher
Hackathons: Won SwiftUI Jam (2021)
Company Signals: Uber, Instagram/Meta, acquired startup`,
  },
  {
    name: 'Fatima Al-Hassan',
    role: 'Security Engineer',
    status: 'Pending',
    text: `Fatima Al-Hassan — Security Engineer

Education: MS Cybersecurity, Georgia Tech (2019); BS Computer Science, American University of Beirut (2017)

Experience: 5 years
- Security Engineer at Coinbase (2022–present): Leads the application security program. Built automated vulnerability scanning into CI/CD. Conducted red team exercises finding 12 critical vulnerabilities. Manages bug bounty program.
- Security Analyst at CrowdStrike (2019–2022): Built threat detection rules for the Falcon platform. Analyzed APT campaigns and published 3 threat intelligence reports.

Technical Skills: Python, Go, Burp Suite, Metasploit, Terraform, AWS security, Kubernetes security, SAST/DAST, threat modeling, incident response
Company Stages: growth, public
Hard Things Built: Automated appsec pipeline at Coinbase; threat detection for Falcon platform; red team exercises finding 12 critical vulns
Open Source: Creator of "k8s-audit-scanner" (1.1k stars), contributor to OWASP ZAP
Hackathons: Won DEF CON CTF qualifier (2021), CyberPatriot national finalist
Company Signals: Coinbase, CrowdStrike`,
  },
  {
    name: 'Lucas Andersen',
    role: 'Data Engineer',
    status: 'Rejected',
    text: `Lucas Andersen — Data Engineer

Education: BA Economics, minor in CS, small liberal arts college (2020)

Experience: 4 years
- Data Analyst turned Data Engineer at mid-size e-commerce (2021–present): Maintains existing Airflow DAGs. Writes SQL queries for business reports. Some Python scripts for data cleaning. Mostly works with pre-built tools, limited engineering depth.
- Intern at local analytics shop (2020): Excel and Tableau work.

Technical Skills: SQL, Python (pandas, basic), Airflow (user-level), Tableau, Excel, basic dbt
Company Stages: enterprise
Hard Things Built: Maintained existing data pipelines, nothing built from scratch at scale
Open Source: No contributions
Hackathons: None
Company Signals: Mid-size e-commerce, local analytics shop`,
  },
  {
    name: 'Sophie Moreau',
    role: 'Backend Engineer',
    status: 'Offer Accepted',
    text: `Sophie Moreau — Backend Engineer

Education: MS Computer Science, EPFL (2018)

Experience: 6 years
- Tech Lead at Figma (2022–present): Leads the multiplayer collaboration backend. Rebuilt the CRDT sync engine achieving <50ms p99 latency globally. Team of 5 engineers.
- Senior Engineer at Twitch (2019–2022): Built the live chat infrastructure handling 30M concurrent users. Designed the emote rendering pipeline.
- Engineer at a fintech startup (2018–2019): Built payment processing system handling €100M+ annually.

Technical Skills: Rust, Go, TypeScript, CRDTs, WebSockets, PostgreSQL, DynamoDB, Redis, Kafka, AWS, load testing
Company Stages: startup, growth, public
Hard Things Built: CRDT sync engine at <50ms p99; live chat for 30M concurrent users; payment system handling €100M+
Open Source: Author of "crdt-bench" benchmarking suite (2.8k stars), contributor to Automerge
Hackathons: Won EuroHack (2017), ICFP Programming Contest top 10
Company Signals: Figma (tech lead), Twitch/Amazon, fintech`,
  },
  {
    name: 'Kevin Nakamura',
    role: 'Frontend Engineer',
    status: 'Pending',
    text: `Kevin Nakamura — Frontend Engineer

Education: BS Computer Science, University of Tokyo (2019)

Experience: 5 years
- Senior Engineer at Linear (2022–present): Built the keyboard-first navigation system. Implemented offline-first sync using IndexedDB + CRDTs. Created the custom rich text editor.
- Engineer at Mercari (2019–2022): Built the seller dashboard with real-time analytics. Implemented A/B testing framework for mobile web. Reduced page load time by 45%.

Technical Skills: TypeScript, React, Svelte, IndexedDB, CRDTs, WebAssembly, Playwright, Vite, Tailwind, Figma
Company Stages: startup, growth, public
Hard Things Built: Offline-first sync at Linear; custom rich text editor; 45% page load improvement at Mercari
Open Source: Creator of "offline-sync-kit" (1.6k stars), contributor to Svelte
Hackathons: Won Code for Japan (2020), participated in Google Code Jam
Company Signals: Linear, Mercari`,
  },
  {
    name: 'Jordan Mitchell',
    role: 'Full Stack Engineer',
    status: 'Archived',
    text: `Jordan Mitchell — Full Stack Engineer

Education: BS Information Technology, online university (2018)

Experience: 6 years
- Developer at government contractor (2019–present): Builds internal CRUD applications using .NET and Angular. Fixed scope, waterfall methodology. Applications serve 500 internal users max. No deployment automation.
- IT Support / Junior Dev (2018–2019): Desktop support transitioning to development.

Technical Skills: C#, .NET, Angular, SQL Server, basic Azure, HTML/CSS
Company Stages: enterprise
Hard Things Built: Standard internal business applications, nothing at scale or technically novel
Open Source: No contributions
Hackathons: None
Company Signals: Government contractor`,
  },
];

function statusToDecision(status: string): 'hired' | 'rejected' | 'pending' {
  const lower = status.toLowerCase();
  if (lower.includes('hired') || lower.includes('offer')) return 'hired';
  if (lower.includes('reject') || lower.includes('archived') || lower.includes('declined')) return 'rejected';
  return 'pending';
}

export async function POST(req: Request) {
  try {
    const ci = getCI();
    const storage = getStorage();
    const tracker = getExperimentTracker();
    const { schema_id, count } = await req.json();

    if (!schema_id) {
      return NextResponse.json({ success: false, error: 'Missing schema_id' }, { status: 400 });
    }

    const schema = await ci.schemas.get(schema_id);
    if (!schema) {
      return NextResponse.json({ success: false, error: 'Schema not found' }, { status: 404 });
    }

    const maxSeed = Math.min(count || CANDIDATES.length, CANDIDATES.length);
    const results: any[] = [];
    const skipped: any[] = [];
    let processed = 0;

    for (let i = 0; i < maxSeed; i++) {
      const cand = CANDIDATES[i];
      const subjectId = `seed-${cand.name.toLowerCase().replace(/\s+/g, '-')}`;

      const existing = await storage.getTraits(schema.id, subjectId);
      if (existing) {
        skipped.push({ name: cand.name, reason: 'already seeded' });
        continue;
      }

      try {
        const traits = await ci.extract({ schema, subjectId, text: cand.text, role: cand.role });

        const enrichedTraits: ExtractedTraits = {
          ...traits,
          subject_name: cand.name,
          subject_meta: { notionStatus: cand.status, source: 'seed' },
        };
        await storage.saveTraits(enrichedTraits);

        const score = await ci.score({ schema, subjectId, role: cand.role, traits: enrichedTraits });

        const decision = statusToDecision(cand.status);
        await tracker.recordRun({
          schemaId: schema.id,
          subjectId,
          adapterSource: 'seed',
          aiScore: score.composite_score,
          humanDecision: decision,
        });

        results.push({
          subjectId,
          name: cand.name,
          role: cand.role,
          score: score.composite_score,
          reasoning: score.reasoning,
          status: cand.status,
          decision,
        });
        processed++;
      } catch (e: any) {
        skipped.push({ name: cand.name, reason: e.message?.slice(0, 120) });
      }
    }

    let patternCount = 0;
    if (processed > 0) {
      try {
        const patterns = await ci.discoverPatterns(schema);
        patternCount = patterns.length;
      } catch (e: any) {
        console.error('[SEED] Pattern discovery failed:', e.message);
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      skipped_count: skipped.length,
      total_available: CANDIDATES.length,
      patterns_discovered: patternCount,
      results,
      skipped: skipped.slice(0, 20),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
