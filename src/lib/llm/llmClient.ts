/**
 * llmClient.ts
 * -----------------------------------------------------------------------------
 * Provider-agnostic LLM boundary for the extraction pipeline.
 *
 *  - `LlmClient`         : the interface the pipeline depends on.
 *  - `MockLlmClient`     : deterministic, dependency-free extractor. Produces
 *                          schema-valid JSON for the offline demo provider.
 *
 * The pipeline never parses provider-specific shapes — it only ever receives a
 * JSON string, which it validates with Zod. That keeps swapping providers a
 * one-line change.
 * -----------------------------------------------------------------------------
 */

export interface LlmCompletionRequest {
  system: string;
  user: string;
}

export interface LlmClient {
  readonly modelName: string;
  /** Returns a raw JSON string. The caller validates it. */
  complete(req: LlmCompletionRequest): Promise<string>;
}

/* ===========================================================================
 * MockLlmClient — heuristic, deterministic, offline
 * ===========================================================================
 * This is NOT a language model. It is a rule-based stand-in that mimics what a
 * well-prompted LLM returns: the E2B extraction JSON with per-field confidence
 * and evidence spans.
 * =========================================================================*/

type FieldOut<T> = { value: T; confidence: number; evidence: string } | undefined;

function field<T>(value: T | undefined, confidence: number, evidence: string): FieldOut<T> {
  if (value === undefined || value === null || value === "") return undefined;
  return { value, confidence, evidence };
}

/** Find the first regex hit and return the matched substring (for evidence). */
function firstMatch(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  return m ? m[0].trim() : undefined;
}

export class MockLlmClient implements LlmClient {
  readonly modelName = "mock-extractor-v1";

  async complete(req: LlmCompletionRequest): Promise<string> {
    const text = req.user;
    const lower = text.toLowerCase();

    /* ---- Patient (E2B section D) ---------------------------------------- */
    const ageMatch = text.match(/(\d{1,3})\s*[- ]?\s*(years?|yrs?|y\/o|yo|year[- ]old|months?|mo)\b/i);
    const age = ageMatch ? parseInt(ageMatch[1], 10) : undefined;
    const ageUnit = ageMatch && /mo|month/i.test(ageMatch[2]) ? "months" : "years";

    let sex: "male" | "female" | "unknown" | undefined;
    let sexEvidence = "";
    if (/\b(female|woman|she|her|f\/)\b/i.test(text)) {
      sex = "female";
      sexEvidence = firstMatch(text, /\b(female|woman|she|her)\b/i) ?? "female";
    } else if (/\b(male|man|he|him|his|m\/)\b/i.test(text)) {
      sex = "male";
      sexEvidence = firstMatch(text, /\b(male|man|he|him|his)\b/i) ?? "male";
    }

    const initials =
      firstMatch(text, /\binitials?\s*[:\-]?\s*([A-Z]\.?\s?[A-Z]\.?)/i)?.replace(/initials?\s*[:\-]?\s*/i, "") ||
      firstMatch(text, /\b([A-Z]\.[A-Z]\.)\b/);

    /* ---- Reporter (E2B section C.2) ------------------------------------- */
    let profession:
      | "physician"
      | "pharmacist"
      | "other_hcp"
      | "lawyer"
      | "consumer"
      | undefined;
    let professionEvidence = "";
    if (/\b(dr\.?|doctor|physician|md\b|consultant|gp\b)\b/i.test(text)) {
      profession = "physician";
      professionEvidence = firstMatch(text, /\b(dr\.?|doctor|physician|consultant|gp)\b/i) ?? "";
    } else if (/\b(pharmacist|pharmacy)\b/i.test(text)) {
      profession = "pharmacist";
      professionEvidence = firstMatch(text, /\bpharmacist\b/i) ?? "";
    } else if (/\b(nurse|rn\b|paramedic)\b/i.test(text)) {
      profession = "other_hcp";
      professionEvidence = firstMatch(text, /\b(nurse|paramedic)\b/i) ?? "";
    } else if (/\b(patient|consumer|myself|i (?:took|was|am|have))\b/i.test(text)) {
      profession = "consumer";
      professionEvidence = firstMatch(text, /\b(patient|myself)\b/i) ?? "consumer";
    }

    const email = firstMatch(text, /[\w.+-]+@[\w-]+\.[\w.-]+/);
    const phone = firstMatch(text, /(\+?\d[\d\s().-]{7,}\d)/);
    const contact = email ?? phone;

    const drName = firstMatch(text, /\bDr\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/);
    const nameParts = drName?.replace(/Dr\.?\s+/, "").split(/\s+/) ?? [];

    /* ---- Suspect drug (E2B section G) ----------------------------------- */
    const dosage = firstMatch(
      text,
      /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|g|ml|iu|units?)\b(?:\s+(?:once|twice|three times|daily|per day|bd|od|qds|tds|nightly|weekly|every \d+ hours?))*/i
    );

    // Known illustrative products. In production this is a licensed WHODrug lookup.
    const drugCatalog: { pattern: RegExp; brand: string; generic: string }[] = [
      { pattern: /\bcardizem\b/i, brand: "Cardizem", generic: "diltiazem" },
      { pattern: /\bdiltiazem\b/i, brand: "Cardizem", generic: "diltiazem" },
      { pattern: /\blipitor\b/i, brand: "Lipitor", generic: "atorvastatin" },
      { pattern: /\batorvastatin\b/i, brand: "Lipitor", generic: "atorvastatin" },
      { pattern: /\bmetformin\b/i, brand: "Glucophage", generic: "metformin" },
      { pattern: /\bglucophage\b/i, brand: "Glucophage", generic: "metformin" },
      { pattern: /\bamoxicillin\b/i, brand: "Amoxil", generic: "amoxicillin" },
      { pattern: /\bamoxil\b/i, brand: "Amoxil", generic: "amoxicillin" },
      { pattern: /\bwarfarin\b/i, brand: "Coumadin", generic: "warfarin" },
      { pattern: /\bibuprofen\b/i, brand: "Nurofen", generic: "ibuprofen" },
      { pattern: /\bsertraline\b/i, brand: "Zoloft", generic: "sertraline" },
      { pattern: /\bzoloft\b/i, brand: "Zoloft", generic: "sertraline" },
      { pattern: /\blisinopril\b/i, brand: "Zestril", generic: "lisinopril" },
    ];
    const drugHit = drugCatalog.find((d) => d.pattern.test(text));
    const drugEvidence = drugHit ? firstMatch(text, drugHit.pattern) ?? "" : "";

    const indication = firstMatch(
      text,
      /\b(?:for|to treat|prescribed for|indication[:\s])\s+(?:high blood pressure|hypertension|cholesterol|diabetes|infection|depression|anxiety|pain|blood clots?|angina)\b/i
    );

    /* ---- Adverse events (E2B section E) --------------------------------- */
    const symptomPhrases: { re: RegExp; label: string }[] = [
      { re: /\b(throbbing|pounding|bad|severe)?\s?head ?aches?\b/i, label: "headache" },
      { re: /\bmigraines?\b/i, label: "migraine" },
      { re: /\b(dizziness|dizzy|light[- ]?headed)\b/i, label: "dizziness" },
      { re: /\b(nausea|nauseous|feeling sick|queasy)\b/i, label: "nausea" },
      { re: /\b(vomit(?:ing|ed)?|throwing up|being sick)\b/i, label: "vomiting" },
      { re: /\b(diarrh(?:o?ea)|loose stools)\b/i, label: "diarrhoea" },
      { re: /\b(stomach|abdominal|belly)\s?(?:ache|pain|cramps?)\b/i, label: "abdominal pain" },
      { re: /\b(rash|red spots|breakout)\b/i, label: "rash" },
      { re: /\b(itch(?:ing|y)|pruritus)\b/i, label: "itching" },
      { re: /\b(hives|urticaria|welts)\b/i, label: "hives" },
      { re: /\b(swollen (?:lips|tongue|face)|facial swelling|angioedema)\b/i, label: "swelling of the face" },
      { re: /\b(anaphyla(?:xis|ctic))\b/i, label: "anaphylactic reaction" },
      { re: /\b(short(?:ness)? of breath|breathless|difficulty breathing|trouble breathing|dyspn) /i, label: "shortness of breath" },
      { re: /\b(cough(?:ing)?)\b/i, label: "cough" },
      { re: /\b(fatigue|exhaustion|very tired|worn out|tiredness)\b/i, label: "fatigue" },
      { re: /\b(severe\s+)?muscle pain\b/i, label: "muscle pain" },
      { re: /\bmyalgia\b/i, label: "myalgia" },
      { re: /\b(insomnia|difficulty sleeping|trouble sleeping)\b/i, label: "insomnia" },
      { re: /\b(fever|pyrexia|high temperature|feverish)\b/i, label: "fever" },
      { re: /\b(palpitations|racing heart|heart pounding|rapid heartbeat)\b/i, label: "palpitations" },
      { re: /\b(fainting|passed out|blacked out|syncope)\b/i, label: "fainting" },
      { re: /\b(seizure|convulsion|fit)\b/i, label: "seizure" },
      { re: /\b(liver failure|hepatic failure)\b/i, label: "liver failure" },
    ];

    const seenLabels = new Set<string>();
    const events = symptomPhrases
      .map((s) => {
        const m = text.match(s.re);
        if (!m) return null;
        if (seenLabels.has(s.label)) return null;
        seenLabels.add(s.label);
        return { verbatim: m[0].trim(), label: s.label };
      })
      .filter((x): x is { verbatim: string; label: string } => x !== null);

    /* ---- Onset date ---------------------------------------------------- */
    const isoDate = firstMatch(text, /\b\d{4}-\d{2}-\d{2}\b/);
    const looseDate = firstMatch(
      text,
      /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+\d{4})?\b/i
    );
    const onset = isoDate ?? looseDate;

    /* ---- Seriousness (E2B E.i.3.2a-f) ---------------------------------- */
    const seriousness = {
      death: /\b(died|death|fatal|passed away|deceased)\b/i.test(lower),
      lifeThreatening: /\b(life[- ]threatening|nearly died|almost died|critical)\b/i.test(lower),
      hospitalization: /\b(hospital|admitted|a&e|emergency room|\ber\b|icu|inpatient)\b/i.test(lower),
      disabling: /\b(disab(?:led|ling)|permanent damage|unable to work|incapacitat)\b/i.test(lower),
      congenitalAnomaly: /\b(birth defect|congenital|malformation)\b/i.test(lower),
      otherMedicallySignificant: /\b(medically significant|intervention required|required treatment)\b/i.test(lower),
    };

    /* ---- Assemble schema-valid payload --------------------------------- */
    const payload = {
      patient: {
        initials: field(initials?.toUpperCase(), 0.82, initials ?? ""),
        age: field(age, ageMatch ? 0.95 : 0, ageMatch?.[0] ?? ""),
        ageUnit,
        sex: field(sex, sexEvidence && /female|male/i.test(sexEvidence) ? 0.9 : 0.68, sexEvidence),
      },
      reporter: {
        givenName: field(nameParts[0], drName ? 0.8 : 0, nameParts[0] ?? ""),
        familyName: field(nameParts[1], drName && nameParts[1] ? 0.8 : 0, nameParts[1] ?? ""),
        profession: field(profession, profession ? 0.85 : 0, professionEvidence),
        contact: field(contact, contact ? 0.93 : 0, contact ?? ""),
        countryCode: undefined,
      },
      drugs: drugHit
        ? [
            {
              brandName: field(drugHit.brand, 0.9, drugEvidence),
              genericName: field(drugHit.generic, 0.9, drugEvidence),
              dosageText: field(dosage, dosage ? 0.88 : 0, dosage ?? ""),
              indication: field(indication?.replace(/^(for|to treat|prescribed for|indication[:\s])\s+/i, ""), indication ? 0.7 : 0, indication ?? ""),
              characterisation: "suspect" as const,
            },
          ]
        : [],
      adverseEvents: events.map((e) => ({
        descriptionAsReported: { value: e.verbatim, confidence: 0.9, evidence: e.verbatim },
        onsetDate: field(onset, onset ? 0.72 : 0, onset ?? ""),
        outcome: seriousness.death ? ("fatal" as const) : ("unknown" as const),
        seriousness,
      })),
    };

    // Strip undefined optional fields so the JSON matches the "sparse" shape a
    // real LLM would emit (only present when found).
    return JSON.stringify(pruneUndefined(payload));
  }
}

function pruneUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((v) => pruneUndefined(v)) as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v);
    }
    return out as T;
  }
  return obj;
}
