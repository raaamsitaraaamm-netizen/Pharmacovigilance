# PV Copilot — AI-native Pharmacovigilance case processing (prototype)

An AI-assisted, **human-in-the-loop** workspace that ingests unstructured adverse-event
(AE) reports, extracts the **4 core elements** of a valid ICSR, auto-codes reactions to
(mock) **MedDRA** terms, lets a PV specialist review/edit every field with confidence
scores, and exports a simplified **ICH E2B(R3)** XML on approval.

> ⚠️ **Prototype — not for regulatory use.** MedDRA codes here are *illustrative mock
> values* (MedDRA is an MSSO-licensed dictionary), and the E2B(R3) XML is a *simplified
> representation* that must be validated against the official ICH schema before any real
> submission. No case is ever auto-approved — every case lands in `in_review`.

---

## What's implemented

| Layer | File | Notes |
|---|---|---|
| Domain schema | `src/types/pvCase.ts` | TS interfaces + Zod schemas, every field annotated with its E2B(R3) data-element reference (D.1, C.2.r, G.k, E.i…). |
| MedDRA auto-coder | `src/lib/meddra.ts` | Mock LLT/PT dictionary + ranked matcher (exact / synonym / Jaccard token / Levenshtein). `"Bad throbbing headache"` → PT **Headache 10019211**. |
| LLM boundary | `src/lib/llm/llmClient.ts` | `LlmClient` interface. `MockLlmClient` (deterministic, offline, zero-key) + `AnthropicLlmClient` (real drop-in, server-side). |
| Pipeline | `src/lib/pvAiPipeline.ts` | Orchestration: prompt → extract → **Zod validate** → MedDRA code → score → **4-core-element gate** → assemble. Sets status `in_review`. |
| E2B export | `src/lib/e2bExport.ts` | `generateE2bXml(pvCase)` → simplified `ichicsr` XML. |
| Seed data | `src/lib/mockData.ts` | 5 raw cases across channels (incl. one deliberately incomplete case to exercise the validity gate). |
| API route | `src/app/api/extract/route.ts` | `POST /api/extract` — picks Anthropic client if `ANTHROPIC_API_KEY` is set, else mock. |
| Review UI | `src/components/PvReviewWorkspace.tsx` | Triage inbox + side-by-side source/form review, confidence chips, Serious/Non-Serious badges, MedDRA override, **Approve & Generate E2B(R3) XML**. |

## The 4 core elements (extraction gate)

1. **Identifiable patient** — age / sex / initials
2. **Identifiable reporter** — name / profession / contact
3. **Suspect drug** — brand or generic / dosage / indication
4. **Adverse event** — description / onset / seriousness (Death, Life-threatening,
   Hospitalization, Disabling, Congenital anomaly, Other medically significant)

`isValidCase` is true only when all four are satisfied; the Approve button stays disabled
until then.

---

## Setup

This is a **complete, runnable Next.js 14 (App Router) project**. The scaffolding
(`package.json`, `tsconfig.json` with the `@/*` alias, Tailwind/PostCSS/Next config,
`src/app` entry) is included.

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. The workspace runs the pipeline client-side against
the mock cases on mount — the mock client is pure JS, so **no API key or network is
needed**. Type-check with `npm run typecheck`.

The `@/*` → `./src/*` path alias, Tailwind content globs, and the `zod` dependency are
already wired in the committed config.

### Using the real Anthropic model

Set `ANTHROPIC_API_KEY` and POST to `/api/extract`; the route uses `AnthropicLlmClient`
(model `claude-sonnet-4-6`, server-side only) and validates the returned JSON with the
same Zod schema. Swap the workspace's on-mount `runPipeline(...)` call for a
`fetch("/api/extract", …)` to move extraction server-side.

---

## Note on verification

The code was written against the schema and cross-checked for import/export consistency,
but **`tsc` / `next build` was not run in the authoring environment** (no network to
install dependencies). Before relying on it: `npm install`, then `npm run typecheck`
(`npx tsc --noEmit`) and `npm run build`. All config — `zod`, the `@/*` alias, and the
Tailwind globs — is already committed.
