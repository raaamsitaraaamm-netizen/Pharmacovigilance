/**
 * app/api/extract/route.ts
 * -----------------------------------------------------------------------------
 * POST /api/extract
 *
 * Body: a RawCase (or { sourceText, channel } at minimum).
 * Runs the AI orchestration pipeline server-side and returns the review-ready
 * PvCase plus any reviewer warnings.
 *
 * Uses a deterministic mock behind the planned Amazon Bedrock provider boundary.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pvAiPipeline";
import { BedrockMockLlmClient } from "@/lib/llm/bedrockClient";
import type { RawCase, IntakeChannel } from "@/types/pvCase";
import { z } from "zod";

export const runtime = "nodejs";

const intakeSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  worldwideId: z.string().trim().max(100).optional(),
  channel: z.enum([
    "patient_email",
    "call_center",
    "hcp_note",
    "literature",
    "web_form",
    "social_media",
  ]).default("web_form"),
  receivedAt: z.string().datetime().optional(),
  sourceText: z.string().trim().min(1).max(20000),
  subject: z.string().trim().max(120).optional(),
}).strict();

function buildRawCase(body: z.infer<typeof intakeSchema>): RawCase {
  return {
    id: body.id ?? `CASE-${Date.now()}`,
    worldwideId: body.worldwideId,
    channel: body.channel as IntakeChannel,
    receivedAt: body.receivedAt ?? new Date().toISOString(),
    sourceText: body.sourceText,
    subject: body.subject,
  };
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = intakeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid intake report.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const raw = buildRawCase(parsed.data);
    const llm = new BedrockMockLlmClient();
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
      { error: "Report extraction failed." },
      { status: 502 }
    );
  }
}
