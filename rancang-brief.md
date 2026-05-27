# Project Brief — Rancang

**One-liner:** AI co-pilot for indie architects and drafters. Import or sketch a residential floor plan, get anchored AI critique and alternative layouts, review in 3D. Not a CAD replacement — the "show it to a senior peer for review" step, on-demand.

---

## 1. Problem

Indie architects and drafters lose meaningful time in early-stage design:
- Heavy CAD (AutoCAD, ArchiCAD, Revit) has a learning curve and a price tag mismatched to schematic-design work
- Freehand sketching is fast but gives zero analytical feedback
- Existing AI tools (Maket, Finch3D, Spacely) chase *generation* — but their output is often un-trustworthy, and architects don't want to be replaced; they want to be sharpened
- There's no tool that takes a plan the architect *already drew* and gives specific, coordinate-anchored critique against their stated brief

## 2. Vision

An architect imports a draft, fills in a brief, and within 10 minutes is reading specific feedback like *"the master corridor is 1.6m wide for a 4.2m run — 1.1m would reclaim 1.7m² for the adjacent walk-in closet."* Each iteration cycle takes minutes, not days. The "vibe" comes from the speed of the feedback loop, not from AI-generated final plans.

## 3. Users & Roles (v1)

| Role | Who | Can do |
|---|---|---|
| Owner | Solo indie architect / drafter | Everything in their own projects |
| (v1.1) Collaborator | Invited peer | Comment, view, no edit |

Single-user product in v1. Collaboration deferred.

## 4. Goals

- **Critique quality**: ≥90% of returned critique items are specific, anchored to coordinates, and actionable (measured by user-tagged thumbs)
- **Time-to-value**: new user runs first useful critique within 10 minutes of signup
- **Canvas feel**: 2D drawing is as smooth as Figma/tldraw — pan/zoom buttery, snapping precise, undo reliable
- **3D fidelity**: extrusion accurate enough to spot orientation, circulation, and adjacency issues (not photoreal)

## 5. Non-Goals (v1)

- CAD-grade precision (no precise dimensioning toolset, no layers panel, no DWG/DXF export)
- Structural / MEP / plumbing engineering
- Photorealistic rendering, ray tracing, material libraries
- Multi-user real-time collaboration
- Generating floor plans from scratch (text-to-plan) — only critiquing and remixing existing ones
- Mobile editing (read-only review on tablet only)
- Multi-floor / stairs (v1.1)

## 6. Success Metrics

**North Star:** Critique runs per active user per week. Target: **≥3 by week 4 of usage** — captures real iteration, not one-and-done tire-kicking.

**Supporting:**
- 7-day retention: ≥35%
- Time-to-first-critique: <10 min median
- % of critiques where user adopts at least one suggestion: ≥40%
- Free → Pro conversion: ≥3% by month 3

## 7. Scope — v1

**Auth & projects:** magic link, project CRUD, requirements brief form

**2D canvas (Konva.js)** — the core, 60% of build time:
- Walls (line + thickness), doors, windows, auto room detection from closed loops
- Snapping: endpoint, perpendicular, ortho-lock, grid
- Undo/redo, version snapshots, auto-save
- Background image import + scale calibration

**AI integration (Anthropic API):**
- Critique: anchored, structured JSON, 8-item max, severity-tagged
- Alternatives: 2–3 variant plans as JSON, swap-in flow
- Image-to-plan vision extraction (Claude vision → wall graph proposal)

**3D viewer (React Three Fiber):**
- Wall extrusion (2.7m default), door/window cutouts, floor polygons
- Orbit + first-person walk modes
- Read-only — edits happen in 2D

**Version history:** named snapshots, side-by-side compare

## 8. Tech Stack

- **Frontend:** Next.js 15 (App Router, TypeScript), Tailwind, shadcn/ui
- **Canvas:** Konva.js + react-konva
- **3D:** React Three Fiber, drei
- **Backend:** Convex (DB, file storage, real-time, auth)
- **AI:** Anthropic API, `claude-sonnet-4-20250514`
- **Locale:** English first; Bahasa Indonesia as toggle (v1.1)
- **Pricing currency:** USD (global SaaS pricing for indie architect market)

## 8b. LLM Provider Abstraction (Dev vs Prod)

**Rationale:** API costs during prompt iteration add up. Local LLM = free, fast, offline-capable iteration. Production stays on Claude for quality.

### Interface

```ts
// convex/lib/llm/types.ts
export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

export type LLMOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
};

export interface LLMProvider {
  complete(messages: LLMMessage[], options?: LLMOptions): Promise<string>;
  completeVision?(messages: LLMMessage[], imageBase64: string, options?: LLMOptions): Promise<string>;
}
```

### Anthropic implementation (prod)

```ts
// convex/lib/llm/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";

export const anthropicProvider: LLMProvider = {
  async complete(messages, options = {}) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = messages.find(m => m.role === "system")?.content;
    const rest = messages.filter(m => m.role !== "system");
    const res = await client.messages.create({
      model: options.model ?? "claude-sonnet-4-20250514",
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.3,
      system,
      messages: rest.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    });
    return res.content[0].type === "text" ? res.content[0].text : "";
  },
};
```

### Local implementation (Ollama / LM Studio, OpenAI-compatible)

```ts
// convex/lib/llm/local.ts
export const localProvider: LLMProvider = {
  async complete(messages, options = {}) {
    const base = process.env.LOCAL_LLM_URL ?? "http://localhost:11434/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model ?? process.env.LOCAL_LLM_MODEL ?? "qwen2.5:32b-instruct",
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.3,
        response_format: options.responseFormat === "json" ? { type: "json_object" } : undefined,
      }),
    });
    const json = await res.json();
    return json.choices[0].message.content;
  },
};
```

### Selector

```ts
// convex/lib/llm/index.ts
import { anthropicProvider } from "./anthropic";
import { localProvider } from "./local";

export const llm: LLMProvider =
  process.env.LLM_PROVIDER === "local" ? localProvider : anthropicProvider;
```

### Usage (critique action stays provider-agnostic)

```ts
// convex/critique.ts
const raw = await llm.complete([
  { role: "system", content: CRITIQUE_SYSTEM_PROMPT },
  { role: "user", content: buildUserMessage(plan, requirements, context) },
], { responseFormat: "json", temperature: 0.3 });

const parsed = CritiqueSchema.safeParse(JSON.parse(raw));
// On parse fail: retry once with "return ONLY valid JSON" reminder, then surface error.
```

### Env config

```env
# .env.local
LLM_PROVIDER=local                  # "local" | "anthropic"
ANTHROPIC_API_KEY=sk-ant-...
LOCAL_LLM_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=qwen2.5:32b-instruct-q4_K_M
```

### Networking caveat

Convex hosted actions can't reach `localhost:11434` on your laptop. For local-LLM dev, choose one:
- Run Convex in dev mode locally (`npx convex dev`) — recommended
- Tunnel Ollama with ngrok / Cloudflare Tunnel → set `LOCAL_LLM_URL` to the tunnel URL
- Build a Next.js API route as a thin proxy, call that from Convex action

### Recommended local models

| Model | Size | RAM needed | Use for |
|---|---|---|---|
| `qwen2.5:14b-instruct` | ~9GB | 16GB | Fast prompt iteration, syntax checks |
| `qwen2.5:32b-instruct` | ~20GB | 32GB+ | Reasonable critique quality, strong JSON |
| `llama3.3:70b-instruct` | ~40GB | 64GB+ | Closest to Claude on spatial reasoning |
| `qwen2.5-vl:32b` | ~20GB | 32GB+ | Optional: image import testing |

### Honest caveats

- Local JSON output fails ~5–15% of the time vs <1% for Claude → always Zod-validate + retry once
- Spatial reasoning on plan critique: best local 32B ≈ 60% as useful as Claude Sonnet 4
- Vision (image-to-plan): local models lag badly — keep this Anthropic-only even in dev
- **Never judge prompt quality on local model output.** Iterate fast locally, but quality-validate against Claude before deciding the prompt is good or bad

### Dev workflow

1. Write/edit prompt → test locally (free, fast)
2. Once shape and structure feel right → switch `LLM_PROVIDER=anthropic`, run same inputs
3. If Claude output is meaningfully better → ship with Claude. If similar → keep both viable.
4. Production always uses Anthropic. Local is a dev tool, not a fallback.

## 9. Key Decisions & Trade-offs

| Decision | Rationale | Trade-off |
|---|---|---|
| Critique-first, not generate-first | LLMs evaluate spatial layouts better than they create them; lower R&D risk; honest UX | Less "magical" demo than Maket/Finch positioning |
| Indie architect ICP only | Solo founder needs focus; prosumer pays $20–50/mo; reachable via communities | Skipping bigger TAM (homeowners, firms) for now |
| Konva over Fabric / Excalidraw | Best canvas perf + custom shapes; architectural drawing needs precise primitives | Less out-of-the-box than Excalidraw |
| Plan JSON as single source of truth | 2D, 3D, AI, exports all read from one schema; clean architecture | Schema migrations later will be painful — design it carefully now |
| Convex over Postgres | Real-time + file storage + auth in one; matches existing stack expertise | Vendor lock-in |
| English-first, global pricing in USD | Indie architect tools tend to be global SaaS plays | Misses any Indonesia-specific advantage; revisit if traction is local |
| Web/PWA only (no native app) | One codebase, instant updates | Canvas UX is desktop-first; mobile is read-only |

## 10. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Canvas UX feels clunky → no AI magic can save it | High | Spend 60% of v0 time on canvas alone. Time-trial against tldraw/Figma for basic operations. Cut features before cutting canvas quality. |
| AI critique quality is mediocre on real plans | High | Test the system prompt with 10+ real plans in Anthropic Console *before* building app. If output isn't impressive there, redesign the prompt before any UI work. |
| Claude vision can't reliably extract walls from imported images | Medium-High | Treat vision extraction as "AI proposes, user confirms" — never blind-trust. Defer to v1.1 if quality is too low. |
| Crowded space (Maket, Finch, Spacely, Forma) | Medium | Differentiate on critique honesty + canvas feel. Most competitors lead with generation; lead with "AI co-pilot that respects you stay in control." |
| API costs eat margin | Medium | Per-critique cost ~$0.05; cap free tier at 20 critiques/month; Pro at $29/mo unlimited still leaves 50× margin |
| Solo dev splitting time with Zero | High | Pick one to ship first. Don't build both in parallel — alternating weeks is the worst case. |

## 11. Milestones (solo, part-time pace)

| Phase | Weeks | Deliverable |
|---|---|---|
| Foundation | 1–2 | Scaffold Next.js + Convex, auth, projects CRUD, plan JSON schema |
| Canvas v1 | 3–5 | 2D editor: walls, openings, snapping, room detection, undo/redo, auto-save |
| 3D viewer | 6 | Extrusion from plan JSON, orbit + walk camera |
| Requirements + AI critique | 7–8 | Brief form, Convex action, system prompt validated, anchored critique UI |
| Alternatives + versions | 9 | Variant generation, version snapshots, side-by-side compare |
| Image import | 10 | Vision extraction, scale calibration, traceable background |
| Polish & beta prep | 11–12 | Onboarding, pricing wall, mobile review mode, performance pass |
| Beta launch | 13 | 5–10 architects, weekly feedback, iterate |

**Realistic v1 ship: ~13 weeks part-time.** If full-time: ~6–7 weeks.

## 12. Pricing (working hypothesis)

| Tier | Price | Limits |
|---|---|---|
| Free | $0 | 1 active project, 5 critiques/month, no image import, watermarked 3D |
| Pro | $29/mo or $290/yr | Unlimited projects + critiques, image import, version history, no watermark |
| (v1.1) Team | $79/mo per seat | + collaborator seats, shared library |

Validate via 5 architect interviews before launch — don't assume pricing.

## 13. Open Questions

- **Market:** Indonesia-first (Bahasa UI, IDR pricing, local AEC communities) or global English-first?
- **Distribution:** Where do indie architects actually hang out? Twitter/X AEC, r/architecture, Discord communities, university alumni networks? Test 3 channels in beta.
- **Onboarding:** Sample project with pre-loaded critique, or guided 60-second tour?
- **Critique heuristics:** Which 10 critique rules should the system prompt prioritize? Co-design with 2–3 architects before locking the prompt.
- **Image import in v1 or v1.1?** Risky feature, hit-or-miss vision quality. May ship v1 without it.
- **Should 3D be a separate page or an inline canvas toggle?** UX trade-off, test both.
- **Zero vs Rancang:** which ships first, or do you pause one?

---

## 14. The honest meta-question

This brief assumes you ship Rancang next. You're also actively building Zero. Pick:
- **Sequential:** finish Zero to a clean milestone, then start Rancang. Slower but each gets full attention.
- **Parallel:** ship a Rancang prototype (steps 1–5 above) in 4 weeks while Zero idles. Higher quality risk.
- **Validate-only first:** spend 1 week running the critique system prompt against 10 real plans, interview 5 architects, *then* decide whether to build at all.

The validate-only path is the smart bet for an ambitious side project. Save 12 weeks of engineering if the critique quality or market interest isn't there.
