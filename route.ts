/**
 * app/api/extract/route.ts
 * -----------------------------------------------------------------------------
 * POST /api/extract
 *
 * Body: a RawCase (or { sourceText, channel } at minimum).
 * Runs the AI orchestration pipeline server-side and returns the review-ready
 * PvCase plus any reviewer warnings.
 *
 * Uses AnthropicLlmClient when ANTHROPIC_API_KEY is set, otherwise falls back
 * to the deterministic MockLlmClient so the endpoint always responds.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pvAiPipeline";
import { AnthropicLlmClient, MockLlmClient } from "@/lib/llm/llmClient";
import type { RawCase, IntakeChannel } from "@/types/pvCase";

export const runtime = "nodejs";

function buildRawCase(body: Partial<RawCase>): RawCase {
  if (!body.sourceText || typeof body.sourceText !== "string") {
    throw new Error("`sourceText` is required.");
  }
  return {
    id: body.id ?? `CASE-${Date.now()}`,
    worldwideId: body.worldwideId,
    channel: (body.channel as IntakeChannel) ?? "web_form",
    receivedAt: body.receivedAt ?? new Date().toISOString(),
    sourceText: body.sourceText,
    subject: body.subject,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<RawCase>;
    const raw = buildRawCase(body);

    const llm = process.env.ANTHROPIC_API_KEY
      ? new AnthropicLlmClient()
      : new MockLlmClient();

    const result = await runPipeline(raw, { llm });

    return NextResponse.json(
      {
        case: result.case,
        warnings: result.warnings,
        engine: llm.modelName,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
