/**
 * pvAiPipeline.ts
 * -----------------------------------------------------------------------------
 * Core AI orchestration service for adverse-event case processing.
 *
 * Pipeline stages:
 *   1. PROMPT   — build a strict extraction instruction for the LLM.
 *   2. EXTRACT  — call the LLM boundary; receive a JSON string.
 *   3. VALIDATE — Zod-parse the JSON. Malformed output is rejected outright.
 *   4. CODE     — auto-map each adverse-event verbatim to MedDRA LLT/PT.
 *   5. SCORE    — fold per-field confidence into a case-level score + band.
 *   6. GATE     — check the 4 core ICSR elements (valid-case minimum criteria).
 *   7. ASSEMBLE — return a review-ready PvCase for the human-in-the-loop UI.
 *
 * The service is deterministic given its inputs and never auto-approves a case:
 * every case lands in `in_review` for a PV specialist to confirm.
 * -----------------------------------------------------------------------------
 */

import {
  AiProvenance,
  AdverseEvent,
  CaseValidity,
  Patient,
  PvCase,
  RawCase,
  Reporter,
  Seriousness,
  SuspectDrug,
  bandFromScore,
  emptySeriousness,
  isSerious,
  zLlmExtraction,
  type LlmExtraction,
} from "@/types/pvCase";
import { codeAdverseEvent, MEDDRA_VERSION } from "@/lib/meddra";
import type { LlmClient } from "@/lib/llm/llmClient";
import { MockLlmClient } from "@/lib/llm/llmClient";

export interface PipelineOptions {
  llm?: LlmClient;
  meddraVersion?: string;
}

export interface PipelineResult {
  case: PvCase;
  /** Non-fatal issues surfaced to the reviewer (never silently swallowed). */
  warnings: string[];
}

/* ---------------------------------------------------------------------------
 * The extraction prompt. Kept here so it is versioned with the pipeline.
 * -------------------------------------------------------------------------*/

const SYSTEM_PROMPT = `You are a pharmacovigilance intake specialist. Extract a structured
Individual Case Safety Report (ICSR) from the unstructured source text, following
ICH E2B(R3) conventions.

Return ONLY a single JSON object — no prose, no markdown fences. Use this shape,
omitting any field you cannot find (do NOT guess or fabricate):

{
  "patient":  { "initials"?: F<string>, "age"?: F<number>, "ageUnit"?: "years"|"months"|"weeks"|"days", "sex"?: F<"male"|"female"|"unknown"> },
  "reporter": { "givenName"?: F<string>, "familyName"?: F<string>, "profession"?: F<"physician"|"pharmacist"|"other_hcp"|"lawyer"|"consumer"|"unknown">, "contact"?: F<string>, "countryCode"?: F<string> },
  "drugs":    [ { "brandName"?: F<string>, "genericName"?: F<string>, "dosageText"?: F<string>, "indication"?: F<string>, "characterisation": "suspect"|"concomitant"|"interacting" } ],
  "adverseEvents": [ { "descriptionAsReported": F<string>, "onsetDate"?: F<string ISO>, "outcome": "recovered"|"recovering"|"not_recovered"|"recovered_with_sequelae"|"fatal"|"unknown", "seriousness": { "death": bool, "lifeThreatening": bool, "hospitalization": bool, "disabling": bool, "congenitalAnomaly": bool, "otherMedicallySignificant": bool } } ]
}

Where F<T> = { "value": T, "confidence": number 0..1, "evidence": "verbatim source substring" }.
Base confidence on how explicit the source is. Only mark a seriousness criterion true
when the text supports it. Never infer death unless clearly stated.`;

export class PvAiPipeline {
  private readonly llm: LlmClient;
  private readonly meddraVersion: string;

  constructor(opts: PipelineOptions = {}) {
    this.llm = opts.llm ?? new MockLlmClient();
    this.meddraVersion = opts.meddraVersion ?? MEDDRA_VERSION;
  }

  /** Run the full pipeline on a raw intake item. */
  async process(raw: RawCase): Promise<PipelineResult> {
    const warnings: string[] = [];

    // 2. EXTRACT
    let rawJson: string;
    try {
      rawJson = await this.llm.complete({
        system: SYSTEM_PROMPT,
        user: raw.sourceText,
      });
    } catch (err) {
      throw new Error(
        `Extraction failed for case ${raw.id}: ${(err as Error).message}`
      );
    }

    // 3. VALIDATE
    let parsed: LlmExtraction;
    try {
      parsed = zLlmExtraction.parse(JSON.parse(rawJson));
    } catch (err) {
      throw new Error(
        `Schema validation failed for case ${raw.id}: ${(err as Error).message}`
      );
    }

    const fields: Record<string, number> = {};
    const evidence: Record<string, string> = {};

    // ---- Patient (Core Element 1) ----
    const patient: Patient = {};
    if (parsed.patient.initials) {
      patient.initials = parsed.patient.initials.value;
      fields["patient.initials"] = parsed.patient.initials.confidence;
      evidence["patient.initials"] = parsed.patient.initials.evidence;
    }
    if (parsed.patient.age) {
      patient.age = parsed.patient.age.value;
      patient.ageUnit = parsed.patient.ageUnit;
      fields["patient.age"] = parsed.patient.age.confidence;
      evidence["patient.age"] = parsed.patient.age.evidence;
    }
    if (parsed.patient.sex) {
      patient.sex = parsed.patient.sex.value;
      fields["patient.sex"] = parsed.patient.sex.confidence;
      evidence["patient.sex"] = parsed.patient.sex.evidence;
    }

    // ---- Reporter (Core Element 2) ----
    const reporter: Reporter = {};
    const rp = parsed.reporter;
    if (rp.givenName) {
      reporter.givenName = rp.givenName.value;
      fields["reporter.givenName"] = rp.givenName.confidence;
      evidence["reporter.givenName"] = rp.givenName.evidence;
    }
    if (rp.familyName) {
      reporter.familyName = rp.familyName.value;
      fields["reporter.familyName"] = rp.familyName.confidence;
      evidence["reporter.familyName"] = rp.familyName.evidence;
    }
    if (rp.profession) {
      reporter.profession = rp.profession.value;
      fields["reporter.profession"] = rp.profession.confidence;
      evidence["reporter.profession"] = rp.profession.evidence;
    }
    if (rp.contact) {
      reporter.contact = rp.contact.value;
      fields["reporter.contact"] = rp.contact.confidence;
      evidence["reporter.contact"] = rp.contact.evidence;
    }
    if (rp.countryCode) {
      reporter.countryCode = rp.countryCode.value;
      fields["reporter.countryCode"] = rp.countryCode.confidence;
    }

    // ---- Suspect Drug (Core Element 3) ----
    const drugs: SuspectDrug[] = parsed.drugs.map((d, i) => {
      const drug: SuspectDrug = {
        id: `${raw.id}-drug-${i}`,
        characterisation: d.characterisation,
      };
      if (d.brandName) {
        drug.brandName = d.brandName.value;
        fields[`drugs.${i}.brandName`] = d.brandName.confidence;
        evidence[`drugs.${i}.brandName`] = d.brandName.evidence;
      }
      if (d.genericName) {
        drug.genericName = d.genericName.value;
        fields[`drugs.${i}.genericName`] = d.genericName.confidence;
        evidence[`drugs.${i}.genericName`] = d.genericName.evidence;
      }
      if (d.dosageText) {
        drug.dosageText = d.dosageText.value;
        fields[`drugs.${i}.dosageText`] = d.dosageText.confidence;
        evidence[`drugs.${i}.dosageText`] = d.dosageText.evidence;
      }
      if (d.indication) {
        drug.indication = d.indication.value;
        fields[`drugs.${i}.indication`] = d.indication.confidence;
        evidence[`drugs.${i}.indication`] = d.indication.evidence;
      }
      return drug;
    });

    // ---- Adverse Events (Core Element 4) + MedDRA coding ----
    const adverseEvents: AdverseEvent[] = parsed.adverseEvents.map((e, i) => {
      const verbatim = e.descriptionAsReported.value;
      const coding = codeAdverseEvent(verbatim);

      if (!coding) {
        warnings.push(
          `No MedDRA match for "${verbatim}" — manual coding required.`
        );
      } else if (coding.score < 0.6) {
        warnings.push(
          `Low-confidence MedDRA match for "${verbatim}" → ${coding.pt} (${coding.score}). Please verify.`
        );
      }

      const ev: AdverseEvent = {
        id: `${raw.id}-ae-${i}`,
        descriptionAsReported: verbatim,
        meddra: coding ?? undefined,
        onsetDate: e.onsetDate?.value,
        outcome: e.outcome,
        seriousness: e.seriousness as Seriousness,
      };

      fields[`adverseEvents.${i}.descriptionAsReported`] =
        e.descriptionAsReported.confidence;
      evidence[`adverseEvents.${i}.descriptionAsReported`] =
        e.descriptionAsReported.evidence;
      // Coding confidence is folded in as its own field for scoring.
      fields[`adverseEvents.${i}.meddra`] = coding?.score ?? 0;
      if (e.onsetDate) {
        fields[`adverseEvents.${i}.onsetDate`] = e.onsetDate.confidence;
        evidence[`adverseEvents.${i}.onsetDate`] = e.onsetDate.evidence;
      }
      return ev;
    });

    // 5. SCORE
    const overall = this.scoreOverall(fields);
    const provenance: AiProvenance = {
      overall,
      band: bandFromScore(overall),
      fields,
      evidence,
      model: this.llm.modelName,
      extractedAt: new Date().toISOString(),
    };

    // Case-level seriousness = OR across events (ICH aggregation rule).
    const caseSeriousness = adverseEvents.reduce<Seriousness>((acc, ev) => {
      (Object.keys(acc) as (keyof Seriousness)[]).forEach((k) => {
        acc[k] = acc[k] || ev.seriousness[k];
      });
      return acc;
    }, emptySeriousness());

    // 6. GATE — 4 core ICSR elements
    const validity = this.validate(patient, reporter, drugs, adverseEvents);
    if (!validity.isValidCase) {
      warnings.push(
        `Case does not yet meet the 4 valid-case criteria. Missing: ${validity.missing.join(", ")}.`
      );
    }

    // 7. ASSEMBLE
    const pvCase: PvCase = {
      raw,
      patient,
      reporter,
      drugs,
      adverseEvents,
      caseSeriousness,
      provenance,
      validity,
      status: "in_review", // never auto-approve — HITL required
      meddraVersion: this.meddraVersion,
    };

    return { case: pvCase, warnings };
  }

  /** Weighted mean of field confidences, penalised for missing core elements. */
  private scoreOverall(fields: Record<string, number>): number {
    const values = Object.values(fields);
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    // Penalise when the four core-element anchor fields are absent.
    const anchors = [
      "patient.age",
      "patient.sex",
      "patient.initials",
      "reporter.profession",
      "reporter.contact",
      "drugs.0.brandName",
      "drugs.0.genericName",
      "adverseEvents.0.descriptionAsReported",
    ];
    const present = anchors.filter((a) => fields[a] !== undefined).length;
    const coverage = present / anchors.length;

    const score = 0.7 * mean + 0.3 * coverage;
    return Number(Math.max(0, Math.min(1, score)).toFixed(3));
  }

  /** The 4 minimum criteria for a valid ICSR. */
  private validate(
    patient: Patient,
    reporter: Reporter,
    drugs: SuspectDrug[],
    events: AdverseEvent[]
  ): CaseValidity {
    const hasIdentifiablePatient = Boolean(
      patient.initials || patient.age !== undefined || patient.sex
    );
    const hasIdentifiableReporter = Boolean(
      reporter.givenName ||
        reporter.familyName ||
        reporter.profession ||
        reporter.contact
    );
    const hasSuspectDrug = drugs.some(
      (d) => (d.brandName || d.genericName) && d.characterisation === "suspect"
    );
    const hasAdverseEvent = events.some((e) => e.descriptionAsReported);

    const missing: string[] = [];
    if (!hasIdentifiablePatient) missing.push("identifiable patient");
    if (!hasIdentifiableReporter) missing.push("identifiable reporter");
    if (!hasSuspectDrug) missing.push("suspect drug");
    if (!hasAdverseEvent) missing.push("adverse event");

    return {
      hasIdentifiablePatient,
      hasIdentifiableReporter,
      hasSuspectDrug,
      hasAdverseEvent,
      isValidCase: missing.length === 0,
      missing,
    };
  }
}

/** Convenience helper used by API route and mock UI. */
export async function runPipeline(
  raw: RawCase,
  opts?: PipelineOptions
): Promise<PipelineResult> {
  return new PvAiPipeline(opts).process(raw);
}

/** Re-export for consumers that need seriousness aggregation. */
export { isSerious };
