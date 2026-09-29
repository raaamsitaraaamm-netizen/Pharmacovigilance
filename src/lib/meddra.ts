/**
 * meddra.ts
 * -----------------------------------------------------------------------------
 * Mock MedDRA auto-coder.
 *
 * Maps a free-text adverse-event verbatim ("bad throbbing headache") to a
 * MedDRA Lowest Level Term (LLT) and Preferred Term (PT) with a match score.
 *
 * The matcher blends three cheap, deterministic signals to approximate a
 * semantic-similarity search without any external dependency:
 *   1. exact LLT / synonym hit
 *   2. token-overlap (Jaccard) between verbatim and candidate terms
 *   3. normalised Levenshtein ratio on the whole string
 *
 * ⚠️ COMPLIANCE: MedDRA is a licensed dictionary (ICH MSSO). The terms and
 * 8-digit codes below are ILLUSTRATIVE placeholders for prototyping only.
 * Swap this module for a licensed MedDRA release + a real vector store before
 * any regulatory submission.
 * -----------------------------------------------------------------------------
 */

import type { MedDraCoding } from "@/types/pvCase";

export const MEDDRA_VERSION = "MOCK-27.0";

interface PtEntry {
  pt: string;
  ptCode: string;
  soc: string;
  socCode: string;
  /** LLTs + colloquial synonyms that should resolve to this PT. */
  terms: { text: string; lltCode: string }[];
}

/**
 * Small illustrative slice of the MedDRA hierarchy. Extend or replace with a
 * licensed release. Codes are 8-digit to mirror real MedDRA formatting.
 */
export const MEDDRA_DICTIONARY: PtEntry[] = [
  {
    pt: "Headache",
    ptCode: "10019211",
    soc: "Nervous system disorders",
    socCode: "10029205",
    terms: [
      { text: "headache", lltCode: "10019211" },
      { text: "head ache", lltCode: "10019212" },
      { text: "head pain", lltCode: "10019218" },
      { text: "throbbing head", lltCode: "10019233" },
      { text: "pounding headache", lltCode: "10019240" },
      { text: "cephalalgia", lltCode: "10008479" },
    ],
  },
  {
    pt: "Migraine",
    ptCode: "10027599",
    soc: "Nervous system disorders",
    socCode: "10029205",
    terms: [
      { text: "migraine", lltCode: "10027599" },
      { text: "migraine attack", lltCode: "10027605" },
      { text: "migraine headache", lltCode: "10027603" },
    ],
  },
  {
    pt: "Dizziness",
    ptCode: "10013573",
    soc: "Nervous system disorders",
    socCode: "10029205",
    terms: [
      { text: "dizziness", lltCode: "10013573" },
      { text: "dizzy", lltCode: "10013575" },
      { text: "lightheaded", lltCode: "10024855" },
      { text: "light headed", lltCode: "10024856" },
      { text: "giddy", lltCode: "10018103" },
    ],
  },
  {
    pt: "Syncope",
    ptCode: "10042772",
    soc: "Nervous system disorders",
    socCode: "10029205",
    terms: [
      { text: "syncope", lltCode: "10042772" },
      { text: "fainting", lltCode: "10016173" },
      { text: "passed out", lltCode: "10042777" },
      { text: "blacked out", lltCode: "10042779" },
    ],
  },
  {
    pt: "Seizure",
    ptCode: "10039906",
    soc: "Nervous system disorders",
    socCode: "10029205",
    terms: [
      { text: "seizure", lltCode: "10039906" },
      { text: "convulsion", lltCode: "10010904" },
      { text: "fit", lltCode: "10039910" },
    ],
  },
  {
    pt: "Nausea",
    ptCode: "10028813",
    soc: "Gastrointestinal disorders",
    socCode: "10017947",
    terms: [
      { text: "nausea", lltCode: "10028813" },
      { text: "nauseous", lltCode: "10028817" },
      { text: "feeling sick", lltCode: "10028821" },
      { text: "queasy", lltCode: "10028825" },
    ],
  },
  {
    pt: "Vomiting",
    ptCode: "10047700",
    soc: "Gastrointestinal disorders",
    socCode: "10017947",
    terms: [
      { text: "vomiting", lltCode: "10047700" },
      { text: "vomit", lltCode: "10047706" },
      { text: "throwing up", lltCode: "10047710" },
      { text: "being sick", lltCode: "10047712" },
    ],
  },
  {
    pt: "Diarrhoea",
    ptCode: "10012735",
    soc: "Gastrointestinal disorders",
    socCode: "10017947",
    terms: [
      { text: "diarrhoea", lltCode: "10012735" },
      { text: "diarrhea", lltCode: "10012736" },
      { text: "loose stools", lltCode: "10024855" },
      { text: "runny stools", lltCode: "10012740" },
    ],
  },
  {
    pt: "Abdominal pain",
    ptCode: "10000081",
    soc: "Gastrointestinal disorders",
    socCode: "10017947",
    terms: [
      { text: "abdominal pain", lltCode: "10000081" },
      { text: "stomach ache", lltCode: "10042113" },
      { text: "stomach pain", lltCode: "10042118" },
      { text: "belly pain", lltCode: "10000085" },
      { text: "cramps", lltCode: "10011416" },
    ],
  },
  {
    pt: "Rash",
    ptCode: "10037844",
    soc: "Skin and subcutaneous tissue disorders",
    socCode: "10040785",
    terms: [
      { text: "rash", lltCode: "10037844" },
      { text: "skin rash", lltCode: "10037848" },
      { text: "red spots", lltCode: "10037852" },
      { text: "breakout", lltCode: "10037855" },
    ],
  },
  {
    pt: "Pruritus",
    ptCode: "10037087",
    soc: "Skin and subcutaneous tissue disorders",
    socCode: "10040785",
    terms: [
      { text: "pruritus", lltCode: "10037087" },
      { text: "itching", lltCode: "10023084" },
      { text: "itchy", lltCode: "10023086" },
      { text: "itchy skin", lltCode: "10023088" },
    ],
  },
  {
    pt: "Urticaria",
    ptCode: "10046735",
    soc: "Skin and subcutaneous tissue disorders",
    socCode: "10040785",
    terms: [
      { text: "urticaria", lltCode: "10046735" },
      { text: "hives", lltCode: "10020608" },
      { text: "welts", lltCode: "10046740" },
      { text: "nettle rash", lltCode: "10046742" },
    ],
  },
  {
    pt: "Angioedema",
    ptCode: "10002424",
    soc: "Skin and subcutaneous tissue disorders",
    socCode: "10040785",
    terms: [
      { text: "angioedema", lltCode: "10002424" },
      { text: "swelling of the face", lltCode: "10016029" },
      { text: "facial swelling", lltCode: "10016030" },
      { text: "swollen lips", lltCode: "10002430" },
      { text: "swollen tongue", lltCode: "10042727" },
    ],
  },
  {
    pt: "Anaphylactic reaction",
    ptCode: "10002198",
    soc: "Immune system disorders",
    socCode: "10021428",
    terms: [
      { text: "anaphylactic reaction", lltCode: "10002198" },
      { text: "anaphylaxis", lltCode: "10002218" },
      { text: "severe allergic reaction", lltCode: "10002205" },
      { text: "allergic shock", lltCode: "10002209" },
    ],
  },
  {
    pt: "Dyspnoea",
    ptCode: "10013968",
    soc: "Respiratory, thoracic and mediastinal disorders",
    socCode: "10038738",
    terms: [
      { text: "dyspnoea", lltCode: "10013968" },
      { text: "dyspnea", lltCode: "10013969" },
      { text: "shortness of breath", lltCode: "10013972" },
      { text: "breathlessness", lltCode: "10013974" },
      { text: "difficulty breathing", lltCode: "10013976" },
      { text: "trouble breathing", lltCode: "10013978" },
    ],
  },
  {
    pt: "Cough",
    ptCode: "10011224",
    soc: "Respiratory, thoracic and mediastinal disorders",
    socCode: "10038738",
    terms: [
      { text: "cough", lltCode: "10011224" },
      { text: "coughing", lltCode: "10011226" },
      { text: "dry cough", lltCode: "10011228" },
    ],
  },
  {
    pt: "Fatigue",
    ptCode: "10016256",
    soc: "General disorders and administration site conditions",
    socCode: "10018065",
    terms: [
      { text: "fatigue", lltCode: "10016256" },
      { text: "tiredness", lltCode: "10016260" },
      { text: "exhaustion", lltCode: "10016262" },
      { text: "very tired", lltCode: "10016264" },
      { text: "worn out", lltCode: "10016266" },
    ],
  },
  {
    pt: "Pyrexia",
    ptCode: "10037660",
    soc: "General disorders and administration site conditions",
    socCode: "10018065",
    terms: [
      { text: "pyrexia", lltCode: "10037660" },
      { text: "fever", lltCode: "10016558" },
      { text: "high temperature", lltCode: "10037665" },
      { text: "feverish", lltCode: "10037667" },
    ],
  },
  {
    pt: "Hypertension",
    ptCode: "10020772",
    soc: "Vascular disorders",
    socCode: "10047065",
    terms: [
      { text: "hypertension", lltCode: "10020772" },
      { text: "high blood pressure", lltCode: "10020775" },
      { text: "raised bp", lltCode: "10020778" },
    ],
  },
  {
    pt: "Tachycardia",
    ptCode: "10043071",
    soc: "Cardiac disorders",
    socCode: "10007541",
    terms: [
      { text: "tachycardia", lltCode: "10043071" },
      { text: "fast heart rate", lltCode: "10043074" },
      { text: "racing heart", lltCode: "10043076" },
      { text: "rapid heartbeat", lltCode: "10043078" },
    ],
  },
  {
    pt: "Palpitations",
    ptCode: "10033557",
    soc: "Cardiac disorders",
    socCode: "10007541",
    terms: [
      { text: "palpitations", lltCode: "10033557" },
      { text: "heart pounding", lltCode: "10033560" },
      { text: "fluttering heart", lltCode: "10033562" },
    ],
  },
  {
    pt: "Insomnia",
    ptCode: "10022437",
    soc: "Psychiatric disorders",
    socCode: "10037175",
    terms: [
      { text: "insomnia", lltCode: "10022437" },
      { text: "cannot sleep", lltCode: "10022440" },
      { text: "trouble sleeping", lltCode: "10022442" },
      { text: "sleeplessness", lltCode: "10022444" },
    ],
  },
  {
    pt: "Hepatic failure",
    ptCode: "10019663",
    soc: "Hepatobiliary disorders",
    socCode: "10019805",
    terms: [
      { text: "hepatic failure", lltCode: "10019663" },
      { text: "liver failure", lltCode: "10019667" },
      { text: "acute liver failure", lltCode: "10019669" },
    ],
  },
];

/* ---------------------------------------------------------------------------
 * Text similarity primitives
 * -------------------------------------------------------------------------*/

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "with",
  "very",
  "really",
  "bad",
  "severe",
  "mild",
  "some",
  "my",
  "his",
  "her",
  "had",
  "has",
  "have",
  "was",
  "were",
  "felt",
  "feeling",
  "experienced",
  "developed",
  "got",
  "getting",
  "started",
]);

function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(input: string): string[] {
  return normalise(input)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Jaccard similarity over content tokens. */
function jaccard(a: string, b: string): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  sa.forEach((t) => {
    if (sb.has(t)) inter += 1;
  });
  const union = new Set([...sa, ...sb]).size;
  return inter / union;
}

/** Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j];
  }
  return prev[n];
}

/** Normalised Levenshtein similarity, 0..1. */
function levRatio(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

/* ---------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------*/

export interface MedDraCandidate extends MedDraCoding {
  matchedTerm: string;
}

/**
 * Return the ranked MedDRA candidates for a verbatim term, best first.
 * The UI can offer the top result plus alternatives for manual override.
 */
export function codeAdverseEventCandidates(
  verbatim: string,
  limit = 5
): MedDraCandidate[] {
  const query = normalise(verbatim);
  if (!query) return [];

  const scored: MedDraCandidate[] = [];

  for (const entry of MEDDRA_DICTIONARY) {
    let best = { term: "", lltCode: entry.ptCode, score: 0, via: "fuzzy" as MedDraCoding["matchedVia"] };

    for (const term of entry.terms) {
      const nt = normalise(term.text);
      let score: number;
      let via: MedDraCoding["matchedVia"];

      if (query === nt) {
        score = 1;
        via = "exact_llt";
      } else if (query.includes(nt) || nt.includes(query)) {
        // colloquial synonym contained in the verbatim (or vice-versa)
        score = 0.9;
        via = "synonym";
      } else {
        const blended = 0.6 * jaccard(query, nt) + 0.4 * levRatio(query, nt);
        score = blended;
        via = "fuzzy";
      }

      if (score > best.score) {
        best = { term: term.text, lltCode: term.lltCode, score, via };
      }
    }

    if (best.score > 0) {
      scored.push({
        reportedTerm: verbatim,
        matchedTerm: best.term,
        llt: best.term,
        lltCode: best.lltCode,
        pt: entry.pt,
        ptCode: entry.ptCode,
        soc: entry.soc,
        socCode: entry.socCode,
        score: Number(best.score.toFixed(3)),
        matchedVia: best.via,
        meddraVersion: MEDDRA_VERSION,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Best single MedDRA coding above threshold, or null if nothing plausible. */
export function codeAdverseEvent(
  verbatim: string,
  threshold = 0.34
): MedDraCoding | null {
  const [top] = codeAdverseEventCandidates(verbatim, 1);
  if (!top || top.score < threshold) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { matchedTerm, ...coding } = top;
  return coding;
}
