/**
 * pvCase.ts
 * -----------------------------------------------------------------------------
 * Domain model + strict validation schema for an Individual Case Safety Report
 * (ICSR), modelled on the ICH E2B(R3) / ISO 27953-2 HL7 ICSR standard.
 *
 * Each field is annotated with the E2B(R3) data element reference it maps to,
 * so the extraction layer and the E2B exporter stay aligned with the standard.
 *
 * NOTE ON MedDRA: MedDRA is a licensed dictionary owned by the ICH MSSO. The
 * codes shipped in this repo are ILLUSTRATIVE MOCK VALUES for prototyping only
 * and must be replaced by a licensed MedDRA release before any regulatory use.
 * -----------------------------------------------------------------------------
 */

import { z } from "zod";

/* ============================================================================
 * Enumerations
 * ==========================================================================*/

/** Intake channel for the raw source document. */
export type IntakeChannel =
  | "patient_email"
  | "call_center"
  | "hcp_note"
  | "literature"
  | "web_form"
  | "social_media";

/** Patient sex — E2B D.5 (ISO 5218: 1 = male, 2 = female). */
export type Sex = "male" | "female" | "unknown";

/** Reporter qualification — E2B C.2.r.4. */
export type ReporterProfession =
  | "physician" // qualification 1
  | "pharmacist" // qualification 2
  | "other_hcp" // qualification 3
  | "lawyer" // qualification 4
  | "consumer" // qualification 5
  | "unknown";

/** Drug characterisation — E2B G.k.1. */
export type DrugCharacterisation = "suspect" | "concomitant" | "interacting";

/** Reaction outcome — E2B E.i.7. */
export type ReactionOutcome =
  | "recovered"
  | "recovering"
  | "not_recovered"
  | "recovered_with_sequelae"
  | "fatal"
  | "unknown";

/** Lifecycle state of a case inside the review workspace. */
export type CaseStatus =
  | "ingested"
  | "ai_extracted"
  | "in_review"
  | "approved"
  | "exported"
  | "rejected";

/** Bucketed confidence used for triage in the UI. */
export type ConfidenceBand = "high" | "medium" | "low";

/* ============================================================================
 * Seriousness — E2B E.i.3.2a … E.i.3.2f (each a Y/N element)
 * ==========================================================================*/

export interface Seriousness {
  death: boolean; // E.i.3.2a — Results in death
  lifeThreatening: boolean; // E.i.3.2b — Life threatening
  hospitalization: boolean; // E.i.3.2c — Caused / prolonged hospitalisation
  disabling: boolean; // E.i.3.2d — Persistent / significant disability
  congenitalAnomaly: boolean; // E.i.3.2e — Congenital anomaly / birth defect
  otherMedicallySignificant: boolean; // E.i.3.2f — Other medically important condition
}

export const SERIOUSNESS_CRITERIA: {
  key: keyof Seriousness;
  label: string;
  e2b: string;
}[] = [
  { key: "death", label: "Death", e2b: "E.i.3.2a" },
  { key: "lifeThreatening", label: "Life-threatening", e2b: "E.i.3.2b" },
  { key: "hospitalization", label: "Hospitalisation", e2b: "E.i.3.2c" },
  { key: "disabling", label: "Disabling / incapacitating", e2b: "E.i.3.2d" },
  { key: "congenitalAnomaly", label: "Congenital anomaly", e2b: "E.i.3.2e" },
  {
    key: "otherMedicallySignificant",
    label: "Other medically significant",
    e2b: "E.i.3.2f",
  },
];

/** A case is "serious" if any single criterion is met (ICH E2B rule). */
export function isSerious(s: Seriousness): boolean {
  return Object.values(s).some(Boolean);
}

export function emptySeriousness(): Seriousness {
  return {
    death: false,
    lifeThreatening: false,
    hospitalization: false,
    disabling: false,
    congenitalAnomaly: false,
    otherMedicallySignificant: false,
  };
}

/* ============================================================================
 * MedDRA coding result
 * ==========================================================================*/

export interface MedDraCoding {
  /** Verbatim term as reported — E2B E.i.1.1a. */
  reportedTerm: string;
  /** Lowest Level Term. */
  llt: string;
  lltCode: string;
  /** Preferred Term — E2B E.i.2.1b. */
  pt: string;
  ptCode: string;
  /** System Organ Class (primary). */
  soc: string;
  socCode: string;
  /** Auto-coder match score, 0..1. */
  score: number;
  /** How the match was made, for auditability. */
  matchedVia: "exact_llt" | "synonym" | "fuzzy" | "manual";
  /** MedDRA release the code belongs to — E2B E.i.2.1a. */
  meddraVersion: string;
}

/* ============================================================================
 * Core Element 1 — Identifiable Patient (E2B section D)
 * ==========================================================================*/

export interface Patient {
  initials?: string; // D.1 — patient initials (GVP-privacy safe identifier)
  age?: number; // D.2.1 — age at onset (value)
  ageUnit?: "years" | "months" | "weeks" | "days"; // D.2.1 unit
  sex?: Sex; // D.5
}

/* ============================================================================
 * Core Element 2 — Identifiable Reporter (E2B section C.2)
 * ==========================================================================*/

export interface Reporter {
  givenName?: string; // C.2.r.1.1
  familyName?: string; // C.2.r.1.4
  profession?: ReporterProfession; // C.2.r.4 — qualification
  contact?: string; // C.2.r.3 — email / phone / address (verbatim)
  countryCode?: string; // C.2.r.3 — ISO-3166 alpha-2
}

/* ============================================================================
 * Core Element 3 — Suspect Drug (E2B section G)
 * ==========================================================================*/

export interface SuspectDrug {
  id: string;
  brandName?: string; // G.k.2.2 — medicinal product name (as reported)
  genericName?: string; // G.k.2.3.r — active substance
  dosageText?: string; // G.k.4.r — dosage (verbatim, e.g. "20 mg once daily")
  indication?: string; // G.k.7.r — indication for use
  characterisation: DrugCharacterisation; // G.k.1
}

/* ============================================================================
 * Core Element 4 — Adverse Event / Reaction (E2B section E)
 * ==========================================================================*/

export interface AdverseEvent {
  id: string;
  descriptionAsReported: string; // E.i.1.1a — reaction as reported
  meddra?: MedDraCoding; // E.i.2.1b
  onsetDate?: string; // E.i.4 — ISO 8601 date of reaction start
  outcome?: ReactionOutcome; // E.i.7
  seriousness: Seriousness; // E.i.3.2a-f
}

/* ============================================================================
 * AI provenance & validity
 * ==========================================================================*/

/**
 * Per-field confidence and evidence, keyed by a dotted field path
 * (e.g. "patient.age", "adverseEvents.0.descriptionAsReported").
 */
export interface AiProvenance {
  overall: number; // 0..1 overall extraction confidence
  band: ConfidenceBand;
  /** path -> confidence 0..1 */
  fields: Record<string, number>;
  /** path -> exact substring of the source doc supporting the value */
  evidence: Record<string, string>;
  model: string;
  extractedAt: string; // ISO timestamp
}

/** The four core-element completeness gate for a valid ICSR. */
export interface CaseValidity {
  hasIdentifiablePatient: boolean;
  hasIdentifiableReporter: boolean;
  hasSuspectDrug: boolean;
  hasAdverseEvent: boolean;
  isValidCase: boolean; // all four true
  missing: string[];
}

/* ============================================================================
 * Raw inbox item + assembled case
 * ==========================================================================*/

export interface RawCase {
  id: string; // internal id
  worldwideId?: string; // C.1.8.1 — worldwide unique case id
  channel: IntakeChannel;
  receivedAt: string; // ISO timestamp
  sourceText: string; // raw unstructured document
  subject?: string;
}

export interface PvCase {
  raw: RawCase;
  patient: Patient;
  reporter: Reporter;
  drugs: SuspectDrug[];
  adverseEvents: AdverseEvent[];
  /** Case-level seriousness = OR across all events. */
  caseSeriousness: Seriousness;
  provenance: AiProvenance;
  validity: CaseValidity;
  status: CaseStatus;
  meddraVersion: string;
}

/* ============================================================================
 * Zod schemas — strict validation of raw LLM JSON output
 * ----------------------------------------------------------------------------
 * The LLM is instructed to return exactly this shape. Anything that fails
 * validation is rejected before it ever reaches a human reviewer.
 * ==========================================================================*/

export const zSex = z.enum(["male", "female", "unknown"]);
export const zProfession = z.enum([
  "physician",
  "pharmacist",
  "other_hcp",
  "lawyer",
  "consumer",
  "unknown",
]);
export const zCharacterisation = z.enum([
  "suspect",
  "concomitant",
  "interacting",
]);
export const zOutcome = z.enum([
  "recovered",
  "recovering",
  "not_recovered",
  "recovered_with_sequelae",
  "fatal",
  "unknown",
]);

export const zSeriousness = z.object({
  death: z.boolean(),
  lifeThreatening: z.boolean(),
  hospitalization: z.boolean(),
  disabling: z.boolean(),
  congenitalAnomaly: z.boolean(),
  otherMedicallySignificant: z.boolean(),
});

const zConfidence = z.number().min(0).max(1);

/** A single extracted value carrying its own confidence + evidence span. */
const zField = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value,
    confidence: zConfidence,
    evidence: z.string().default(""),
  });

export const zLlmExtraction = z.object({
  patient: z.object({
    initials: zField(z.string()).optional(),
    age: zField(z.number().int().positive().max(150)).optional(),
    ageUnit: z.enum(["years", "months", "weeks", "days"]).default("years"),
    sex: zField(zSex).optional(),
  }),
  reporter: z.object({
    givenName: zField(z.string()).optional(),
    familyName: zField(z.string()).optional(),
    profession: zField(zProfession).optional(),
    contact: zField(z.string()).optional(),
    countryCode: zField(z.string().length(2)).optional(),
  }),
  drugs: z
    .array(
      z.object({
        brandName: zField(z.string()).optional(),
        genericName: zField(z.string()).optional(),
        dosageText: zField(z.string()).optional(),
        indication: zField(z.string()).optional(),
        characterisation: zCharacterisation.default("suspect"),
      })
    )
    .default([]),
  adverseEvents: z
    .array(
      z.object({
        descriptionAsReported: zField(z.string()),
        onsetDate: zField(z.string()).optional(),
        outcome: zOutcome.default("unknown"),
        seriousness: zSeriousness,
      })
    )
    .default([]),
});

/** Inferred type for the validated LLM payload. */
export type LlmExtraction = z.infer<typeof zLlmExtraction>;

/* ============================================================================
 * E2B code lookups used by the exporter
 * ==========================================================================*/

export const SEX_E2B_CODE: Record<Sex, string> = {
  male: "1",
  female: "2",
  unknown: "0",
};

export const PROFESSION_E2B_CODE: Record<ReporterProfession, string> = {
  physician: "1",
  pharmacist: "2",
  other_hcp: "3",
  lawyer: "4",
  consumer: "5",
  unknown: "5",
};

export const CHARACTERISATION_E2B_CODE: Record<DrugCharacterisation, string> = {
  suspect: "1",
  concomitant: "2",
  interacting: "3",
};

export const OUTCOME_E2B_CODE: Record<ReactionOutcome, string> = {
  recovered: "1",
  recovering: "2",
  not_recovered: "3",
  recovered_with_sequelae: "4",
  fatal: "5",
  unknown: "6",
};

/* ============================================================================
 * Helpers
 * ==========================================================================*/

export function bandFromScore(score: number): ConfidenceBand {
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}
