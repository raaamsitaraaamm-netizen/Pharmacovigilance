"use client";

/**
 * PvReviewWorkspace.tsx
 * -----------------------------------------------------------------------------
 * Human-in-the-loop validation workspace for AI-extracted adverse-event cases.
 *
 * Layout
 *   ┌──────────────────────────── App bar ────────────────────────────┐
 *   ├──────────────┬───────────────────────────────────────────────────┤
 *   │  Triage inbox │  Case header · validity gate · reviewer warnings   │
 *   │  (channels +  │  ┌───────────────────┬───────────────────────────┐│
 *   │  confidence)  │  │  Raw source doc    │  Editable E2B fields       ││
 *   │               │  │  (evidence-linked) │  (per-field confidence)    ││
 *   │               │  └───────────────────┴───────────────────────────┘│
 *   │               │  Sticky action bar → Approve & Generate E2B (R3)   │
 *   └──────────────┴───────────────────────────────────────────────────┘
 *
 * Runs fully client-side against the deterministic mock pipeline (no keys /
 * no network). Swap `runPipeline` for a call to POST /api/extract to use a
 * real model in production.
 * -----------------------------------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  SERIOUSNESS_CRITERIA,
  bandFromScore,
  isSerious,
  type ConfidenceBand,
  type IntakeChannel,
  type PvCase,
  type ReactionOutcome,
  type RawCase,
  type ReporterProfession,
  type Seriousness,
  type Sex,
} from "@/types/pvCase";
import { runPipeline } from "@/lib/pvAiPipeline";
import { MOCK_RAW_CASES } from "@/lib/mockData";
import { generateE2bXml } from "@/lib/e2bExport";
import {
  codeAdverseEventCandidates,
  type MedDraCandidate,
} from "@/lib/meddra";

/* ============================================================================
 * Inline icons (no icon dependency)
 * ==========================================================================*/

type IconProps = { className?: string };
const S = ({ children, className }: IconProps & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {children}
  </svg>
);
const IconMail = (p: IconProps) => (
  <S {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </S>
);
const IconPhone = (p: IconProps) => (
  <S {...p}>
    <path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 6a2 2 0 0 1 2-2Z" />
  </S>
);
const IconStethoscope = (p: IconProps) => (
  <S {...p}>
    <path d="M4 3v6a4 4 0 0 0 8 0V3" />
    <path d="M8 15v1a5 5 0 0 0 10 0v-2" />
    <circle cx="19" cy="11" r="2" />
  </S>
);
const IconBook = (p: IconProps) => (
  <S {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z" />
    <path d="M4 19a2 2 0 0 0 2 2h13" />
  </S>
);
const IconGlobe = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
  </S>
);
const IconChat = (p: IconProps) => (
  <S {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />
  </S>
);
const IconCheck = (p: IconProps) => (
  <S {...p}>
    <path d="m5 12 5 5 9-11" />
  </S>
);
const IconX = (p: IconProps) => (
  <S {...p}>
    <path d="M6 6 18 18M18 6 6 18" />
  </S>
);
const IconAlert = (p: IconProps) => (
  <S {...p}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4M12 17.5v.5" />
  </S>
);
const IconSpark = (p: IconProps) => (
  <S {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </S>
);
const IconCopy = (p: IconProps) => (
  <S {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </S>
);
const IconDownload = (p: IconProps) => (
  <S {...p}>
    <path d="M12 3v12M7 11l5 4 5-4M4 20h16" />
  </S>
);
const IconPlus = (p: IconProps) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);
const IconShield = (p: IconProps) => (
  <S {...p}>
    <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6Z" />
    <path d="m9 12 2 2 4-4" />
  </S>
);

/* ============================================================================
 * Channel metadata
 * ==========================================================================*/

const CHANNEL_META: Record<
  IntakeChannel,
  { label: string; Icon: (p: IconProps) => React.JSX.Element }
> = {
  patient_email: { label: "Patient email", Icon: IconMail },
  call_center: { label: "Call center", Icon: IconPhone },
  hcp_note: { label: "HCP note", Icon: IconStethoscope },
  literature: { label: "Literature", Icon: IconBook },
  web_form: { label: "Web form", Icon: IconGlobe },
  social_media: { label: "Social media", Icon: IconChat },
};

/* ============================================================================
 * Small presentational helpers
 * ==========================================================================*/

const BAND_STYLE: Record<
  ConfidenceBand,
  { chip: string; dot: string; label: string }
> = {
  high: {
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    dot: "bg-emerald-500",
    label: "High",
  },
  medium: {
    chip: "bg-amber-50 text-amber-700 ring-amber-600/20",
    dot: "bg-amber-500",
    label: "Medium",
  },
  low: {
    chip: "bg-rose-50 text-rose-700 ring-rose-600/20",
    dot: "bg-rose-500",
    label: "Low",
  },
};

function ConfidenceChip({ band, score }: { band: ConfidenceBand; score?: number }) {
  const s = BAND_STYLE[band];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
      {score !== undefined && (
        <span className="font-mono tabular-nums opacity-70">
          {Math.round(score * 100)}%
        </span>
      )}
    </span>
  );
}

function SeriousBadge({ serious }: { serious: boolean }) {
  if (serious) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        Serious
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-300">
      Non-serious
    </span>
  );
}

const STATUS_STYLE: Record<PvCase["status"], string> = {
  ingested: "bg-slate-100 text-slate-600 ring-slate-300",
  ai_extracted: "bg-sky-50 text-sky-700 ring-sky-600/20",
  in_review: "bg-cyan-50 text-cyan-800 ring-cyan-600/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  exported: "bg-violet-50 text-violet-700 ring-violet-600/20",
  rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
};
const STATUS_LABEL: Record<PvCase["status"], string> = {
  ingested: "Ingested",
  ai_extracted: "AI extracted",
  in_review: "In review",
  approved: "Approved",
  exported: "Exported",
  rejected: "Rejected",
};

function StatusChip({ status }: { status: PvCase["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/* ============================================================================
 * Field wrapper with per-field confidence / verified indicator
 * ==========================================================================*/

type FieldState =
  | { kind: "verified" }
  | { kind: "ai"; score: number }
  | { kind: "none" };

function FieldMeta({ state }: { state: FieldState }) {
  if (state.kind === "verified") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
        <IconCheck className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (state.kind === "none") {
    return (
      <span className="text-[11px] font-medium text-slate-400">Not found</span>
    );
  }
  const band = bandFromScore(state.score);
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${
        band === "high"
          ? "text-emerald-600"
          : band === "medium"
          ? "text-amber-600"
          : "text-rose-600"
      }`}
    >
      <IconSpark className="h-3 w-3" />
      AI {Math.round(state.score * 100)}%
    </span>
  );
}

function Field({
  label,
  e2b,
  state,
  onFocus,
  children,
}: {
  label: string;
  e2b: string;
  state: FieldState;
  onFocus?: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className="block"
      onFocus={onFocus}
      onMouseEnter={onFocus}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-1.5 text-xs font-medium text-slate-600">
          {label}
          <span className="font-mono text-[10px] text-slate-400">{e2b}</span>
        </span>
        <FieldMeta state={state} />
      </div>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

/* ============================================================================
 * Section shell
 * ==========================================================================*/

function Section({
  index,
  title,
  subtitle,
  children,
  right,
}: {
  index: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-xs font-semibold text-white">
            {index}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ============================================================================
 * Main component
 * ==========================================================================*/

export default function PvReviewWorkspace() {
  const [cases, setCases] = useState<PvCase[]>([]);
  const [warningsByCase, setWarningsByCase] = useState<Record<string, string[]>>(
    {}
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editedPaths, setEditedPaths] = useState<Record<string, boolean>>({});
  const [highlight, setHighlight] = useState<string>("");
  const [openCoderFor, setOpenCoderFor] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [exportXml, setExportXml] = useState<{ id: string; xml: string } | null>(
    null
  );

  /* ---- Run the pipeline over the seed inbox on mount ---- */
  useEffect(() => {
    let active = true;
    (async () => {
      const results = await Promise.all(
        MOCK_RAW_CASES.map((raw) => runPipeline(raw))
      );
      if (!active) return;
      setCases(results.map((r) => r.case));
      setWarningsByCase(
        Object.fromEntries(results.map((r) => [r.case.raw.id, r.warnings]))
      );
      setSelectedId(results[0]?.case.raw.id ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => cases.find((c) => c.raw.id === selectedId) ?? null,
    [cases, selectedId]
  );

  /* ---- Immutable case updates ---- */
  function patchCase(id: string, updater: (c: PvCase) => PvCase) {
    setCases((prev) => prev.map((c) => (c.raw.id === id ? updater(c) : c)));
  }

  function markEdited(path: string) {
    if (!selected) return;
    setEditedPaths((prev) => ({ ...prev, [`${selected.raw.id}:${path}`]: true }));
  }

  function fieldState(c: PvCase, path: string): FieldState {
    if (editedPaths[`${c.raw.id}:${path}`]) return { kind: "verified" };
    const score = c.provenance.fields[path];
    if (score === undefined) return { kind: "none" };
    return { kind: "ai", score };
  }

  /* ---- Recompute case-level seriousness + validity after edits ---- */
  function recompute(c: PvCase): PvCase {
    const caseSeriousness = c.adverseEvents.reduce<Seriousness>(
      (acc, ev) => {
        (Object.keys(acc) as (keyof Seriousness)[]).forEach((k) => {
          acc[k] = acc[k] || ev.seriousness[k];
        });
        return acc;
      },
      {
        death: false,
        lifeThreatening: false,
        hospitalization: false,
        disabling: false,
        congenitalAnomaly: false,
        otherMedicallySignificant: false,
      }
    );
    const hasIdentifiablePatient = Boolean(
      c.patient.initials || c.patient.age !== undefined || c.patient.sex
    );
    const hasIdentifiableReporter = Boolean(
      c.reporter.givenName ||
        c.reporter.familyName ||
        c.reporter.profession ||
        c.reporter.contact
    );
    const hasSuspectDrug = c.drugs.some(
      (d) => (d.brandName || d.genericName) && d.characterisation === "suspect"
    );
    const hasAdverseEvent = c.adverseEvents.some(
      (e) => e.descriptionAsReported
    );
    const missing: string[] = [];
    if (!hasIdentifiablePatient) missing.push("identifiable patient");
    if (!hasIdentifiableReporter) missing.push("identifiable reporter");
    if (!hasSuspectDrug) missing.push("suspect drug");
    if (!hasAdverseEvent) missing.push("adverse event");
    return {
      ...c,
      caseSeriousness,
      validity: {
        hasIdentifiablePatient,
        hasIdentifiableReporter,
        hasSuspectDrug,
        hasAdverseEvent,
        isValidCase: missing.length === 0,
        missing,
      },
    };
  }

  /* ---- Field mutators ---- */
  function setPatient<K extends keyof PvCase["patient"]>(
    key: K,
    value: PvCase["patient"][K]
  ) {
    if (!selected) return;
    markEdited(`patient.${String(key)}`);
    patchCase(selected.raw.id, (c) =>
      recompute({ ...c, patient: { ...c.patient, [key]: value } })
    );
  }
  function setReporter<K extends keyof PvCase["reporter"]>(
    key: K,
    value: PvCase["reporter"][K]
  ) {
    if (!selected) return;
    markEdited(`reporter.${String(key)}`);
    patchCase(selected.raw.id, (c) =>
      recompute({ ...c, reporter: { ...c.reporter, [key]: value } })
    );
  }
  function setDrug(i: number, key: keyof PvCase["drugs"][number], value: string) {
    if (!selected) return;
    markEdited(`drugs.${i}.${String(key)}`);
    patchCase(selected.raw.id, (c) => {
      const drugs = c.drugs.map((d, idx) =>
        idx === i ? { ...d, [key]: value } : d
      );
      return recompute({ ...c, drugs });
    });
  }
  function setEvent(
    i: number,
    key: "descriptionAsReported" | "onsetDate" | "outcome",
    value: string
  ) {
    if (!selected) return;
    markEdited(`adverseEvents.${i}.${key}`);
    patchCase(selected.raw.id, (c) => {
      const adverseEvents = c.adverseEvents.map((e, idx) =>
        idx === i ? { ...e, [key]: value } : e
      );
      return recompute({ ...c, adverseEvents });
    });
  }
  function toggleSeriousness(i: number, key: keyof Seriousness) {
    if (!selected) return;
    markEdited(`adverseEvents.${i}.seriousness`);
    patchCase(selected.raw.id, (c) => {
      const adverseEvents = c.adverseEvents.map((e, idx) =>
        idx === i
          ? { ...e, seriousness: { ...e.seriousness, [key]: !e.seriousness[key] } }
          : e
      );
      return recompute({ ...c, adverseEvents });
    });
  }
  function applyCoding(i: number, candidate: MedDraCandidate) {
    if (!selected) return;
    markEdited(`adverseEvents.${i}.meddra`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { matchedTerm, ...coding } = { ...candidate, matchedVia: "manual" as const };
    patchCase(selected.raw.id, (c) => {
      const adverseEvents = c.adverseEvents.map((e, idx) =>
        idx === i ? { ...e, meddra: coding } : e
      );
      return recompute({ ...c, adverseEvents });
    });
    setOpenCoderFor(null);
  }

  /* ---- Approve + export ---- */
  function approveAndGenerate() {
    if (!selected || !selected.validity.isValidCase) return;
    const approved = { ...selected, status: "approved" as const };
    patchCase(selected.raw.id, () => approved);
    setExportXml({ id: selected.raw.id, xml: generateE2bXml(approved) });
  }
  function markExported(id: string) {
    patchCase(id, (c) => ({ ...c, status: "exported" }));
  }
  function rejectCase() {
    if (!selected) return;
    patchCase(selected.raw.id, (c) => ({ ...c, status: "rejected" }));
  }

  async function addReport(raw: RawCase) {
    const result = await runPipeline(raw);
    setCases((prev) => [result.case, ...prev]);
    setWarningsByCase((prev) => ({ ...prev, [raw.id]: result.warnings }));
    setSelectedId(raw.id);
    setHighlight("");
    setOpenCoderFor(null);
    setIntakeOpen(false);
  }

  /* ---- Render ---- */
  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-800">
      {/* App bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-700 text-white">
            <IconShield className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">
              PV Copilot
            </div>
            <div className="text-xs text-slate-500">
              Adverse-event case processing · human-in-the-loop
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 sm:inline-flex">
            <IconAlert className="h-3.5 w-3.5" />
            Prototype · not for regulatory use
          </span>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
              DR
            </span>
            <span className="hidden text-slate-600 sm:inline">
              Dr. Reviewer
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Triage inbox */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Triage inbox</h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {cases.filter((c) => c.status === "in_review").length} open
              </span>
              <button
                onClick={() => setIntakeOpen(true)}
                className="inline-flex items-center gap-1 rounded-md bg-cyan-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-800"
              >
                <IconPlus className="h-3.5 w-3.5" />
                New report
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="space-y-2 p-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-lg bg-slate-100"
                  />
                ))}
              </div>
            )}
            {!loading &&
              cases.map((c) => {
                const meta = CHANNEL_META[c.raw.channel];
                const serious = isSerious(c.caseSeriousness);
                const active = c.raw.id === selectedId;
                return (
                  <button
                    key={c.raw.id}
                    onClick={() => {
                      setSelectedId(c.raw.id);
                      setHighlight("");
                      setOpenCoderFor(null);
                    }}
                    className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      active ? "bg-cyan-50/60 ring-1 ring-inset ring-cyan-500/30" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <meta.Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {timeAgo(c.raw.receivedAt)}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-slate-800">
                      {c.raw.subject ?? "Untitled report"}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                      {c.raw.id}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <ConfidenceChip
                        band={c.provenance.band}
                        score={c.provenance.overall}
                      />
                      {serious && <SeriousBadge serious />}
                      {c.status !== "in_review" && (
                        <StatusChip status={c.status} />
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
          <div className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400">
            Multi-channel intake · MedDRA {selected?.meddraVersion ?? ""}
          </div>
        </aside>

        {/* Review workspace */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Select a case from the inbox to begin review.
            </div>
          ) : (
            <>
              {/* Case header */}
              <div className="border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-lg font-semibold text-slate-900">
                        {selected.raw.subject ?? "Adverse event report"}
                      </h1>
                      <StatusChip status={selected.status} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono">
                        {selected.raw.worldwideId ?? selected.raw.id}
                      </span>
                      <span>·</span>
                      <span>{CHANNEL_META[selected.raw.channel].label}</span>
                      <span>·</span>
                      <span>Received {timeAgo(selected.raw.receivedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SeriousBadge serious={isSerious(selected.caseSeriousness)} />
                    <ConfidenceChip
                      band={selected.provenance.band}
                      score={selected.provenance.overall}
                    />
                  </div>
                </div>

                {/* Validity gate */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">
                    Valid-case criteria:
                  </span>
                  {(
                    [
                      ["Patient", selected.validity.hasIdentifiablePatient],
                      ["Reporter", selected.validity.hasIdentifiableReporter],
                      ["Suspect drug", selected.validity.hasSuspectDrug],
                      ["Adverse event", selected.validity.hasAdverseEvent],
                    ] as [string, boolean][]
                  ).map(([label, ok]) => (
                    <span
                      key={label}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        ok
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-rose-50 text-rose-700 ring-rose-600/20"
                      }`}
                    >
                      {ok ? (
                        <IconCheck className="h-3 w-3" />
                      ) : (
                        <IconX className="h-3 w-3" />
                      )}
                      {label}
                    </span>
                  ))}
                </div>

                {/* Warnings */}
                {(warningsByCase[selected.raw.id]?.length ?? 0) > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                      <IconAlert className="h-3.5 w-3.5" />
                      Reviewer attention ({warningsByCase[selected.raw.id].length})
                    </div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-800">
                      {warningsByCase[selected.raw.id].map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Split body */}
              <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
                {/* Left: raw source */}
                <div className="flex flex-col overflow-hidden border-r border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Source document
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Hover a field to trace its evidence
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto px-5 py-4">
                    <SourceText
                      text={selected.raw.sourceText}
                      highlight={highlight}
                    />
                  </div>
                </div>

                {/* Right: structured fields */}
                <div className="flex flex-col overflow-hidden bg-slate-50">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Structured ICSR · ICH E2B(R3)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Extracted by {selected.provenance.model}
                    </span>
                  </div>

                  <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    {/* 1 · Patient */}
                    <Section
                      index={1}
                      title="Identifiable patient"
                      subtitle="E2B section D"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <Field
                          label="Initials"
                          e2b="D.1"
                          state={fieldState(selected, "patient.initials")}
                          onFocus={() =>
                            setHighlight(
                              selected.provenance.evidence["patient.initials"] ?? ""
                            )
                          }
                        >
                          <input
                            className={inputCls}
                            value={selected.patient.initials ?? ""}
                            placeholder="—"
                            onChange={(e) =>
                              setPatient("initials", e.target.value.toUpperCase())
                            }
                          />
                        </Field>
                        <Field
                          label="Age"
                          e2b="D.2.1"
                          state={fieldState(selected, "patient.age")}
                          onFocus={() =>
                            setHighlight(
                              selected.provenance.evidence["patient.age"] ?? ""
                            )
                          }
                        >
                          <div className="flex gap-2">
                            <input
                              type="number"
                              className={inputCls}
                              value={selected.patient.age ?? ""}
                              placeholder="—"
                              onChange={(e) =>
                                setPatient(
                                  "age",
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value)
                                )
                              }
                            />
                            <select
                              className={`${inputCls} w-28`}
                              value={selected.patient.ageUnit ?? "years"}
                              onChange={(e) =>
                                setPatient(
                                  "ageUnit",
                                  e.target.value as PvCase["patient"]["ageUnit"]
                                )
                              }
                            >
                              <option value="years">years</option>
                              <option value="months">months</option>
                              <option value="weeks">weeks</option>
                              <option value="days">days</option>
                            </select>
                          </div>
                        </Field>
                        <Field
                          label="Sex"
                          e2b="D.5"
                          state={fieldState(selected, "patient.sex")}
                          onFocus={() =>
                            setHighlight(
                              selected.provenance.evidence["patient.sex"] ?? ""
                            )
                          }
                        >
                          <select
                            className={inputCls}
                            value={selected.patient.sex ?? ""}
                            onChange={(e) =>
                              setPatient("sex", (e.target.value || undefined) as Sex)
                            }
                          >
                            <option value="">—</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="unknown">Unknown</option>
                          </select>
                        </Field>
                      </div>
                    </Section>

                    {/* 2 · Reporter */}
                    <Section
                      index={2}
                      title="Identifiable reporter"
                      subtitle="E2B section C.2 (primary source)"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <Field
                          label="Given name"
                          e2b="C.2.r.1.1"
                          state={fieldState(selected, "reporter.givenName")}
                          onFocus={() =>
                            setHighlight(
                              selected.provenance.evidence["reporter.givenName"] ??
                                ""
                            )
                          }
                        >
                          <input
                            className={inputCls}
                            value={selected.reporter.givenName ?? ""}
                            placeholder="—"
                            onChange={(e) =>
                              setReporter("givenName", e.target.value)
                            }
                          />
                        </Field>
                        <Field
                          label="Family name"
                          e2b="C.2.r.1.4"
                          state={fieldState(selected, "reporter.familyName")}
                          onFocus={() =>
                            setHighlight(
                              selected.provenance.evidence["reporter.familyName"] ??
                                ""
                            )
                          }
                        >
                          <input
                            className={inputCls}
                            value={selected.reporter.familyName ?? ""}
                            placeholder="—"
                            onChange={(e) =>
                              setReporter("familyName", e.target.value)
                            }
                          />
                        </Field>
                        <Field
                          label="Qualification"
                          e2b="C.2.r.4"
                          state={fieldState(selected, "reporter.profession")}
                          onFocus={() =>
                            setHighlight(
                              selected.provenance.evidence["reporter.profession"] ??
                                ""
                            )
                          }
                        >
                          <select
                            className={inputCls}
                            value={selected.reporter.profession ?? ""}
                            onChange={(e) =>
                              setReporter(
                                "profession",
                                (e.target.value || undefined) as ReporterProfession
                              )
                            }
                          >
                            <option value="">—</option>
                            <option value="physician">Physician</option>
                            <option value="pharmacist">Pharmacist</option>
                            <option value="other_hcp">Other health prof.</option>
                            <option value="lawyer">Lawyer</option>
                            <option value="consumer">Consumer / non-HCP</option>
                            <option value="unknown">Unknown</option>
                          </select>
                        </Field>
                        <Field
                          label="Contact"
                          e2b="C.2.r.3"
                          state={fieldState(selected, "reporter.contact")}
                          onFocus={() =>
                            setHighlight(
                              selected.provenance.evidence["reporter.contact"] ?? ""
                            )
                          }
                        >
                          <input
                            className={inputCls}
                            value={selected.reporter.contact ?? ""}
                            placeholder="—"
                            onChange={(e) => setReporter("contact", e.target.value)}
                          />
                        </Field>
                      </div>
                    </Section>

                    {/* 3 · Suspect drug */}
                    <Section
                      index={3}
                      title="Suspect drug"
                      subtitle="E2B section G"
                    >
                      {selected.drugs.length === 0 && (
                        <div className="rounded-lg border border-dashed border-rose-300 bg-rose-50/50 px-3 py-4 text-center text-sm text-rose-600">
                          No suspect drug identified. Add one to complete the case.
                        </div>
                      )}
                      {selected.drugs.map((d, i) => (
                        <div
                          key={d.id}
                          className="grid grid-cols-2 gap-3 [&:not(:first-child)]:mt-4 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-slate-100 [&:not(:first-child)]:pt-4"
                        >
                          <Field
                            label="Brand name"
                            e2b="G.k.2.2"
                            state={fieldState(selected, `drugs.${i}.brandName`)}
                            onFocus={() =>
                              setHighlight(
                                selected.provenance.evidence[
                                  `drugs.${i}.brandName`
                                ] ?? ""
                              )
                            }
                          >
                            <input
                              className={inputCls}
                              value={d.brandName ?? ""}
                              placeholder="—"
                              onChange={(e) =>
                                setDrug(i, "brandName", e.target.value)
                              }
                            />
                          </Field>
                          <Field
                            label="Generic / active substance"
                            e2b="G.k.2.3.r"
                            state={fieldState(selected, `drugs.${i}.genericName`)}
                            onFocus={() =>
                              setHighlight(
                                selected.provenance.evidence[
                                  `drugs.${i}.genericName`
                                ] ?? ""
                              )
                            }
                          >
                            <input
                              className={inputCls}
                              value={d.genericName ?? ""}
                              placeholder="—"
                              onChange={(e) =>
                                setDrug(i, "genericName", e.target.value)
                              }
                            />
                          </Field>
                          <Field
                            label="Dosage"
                            e2b="G.k.4.r"
                            state={fieldState(selected, `drugs.${i}.dosageText`)}
                            onFocus={() =>
                              setHighlight(
                                selected.provenance.evidence[
                                  `drugs.${i}.dosageText`
                                ] ?? ""
                              )
                            }
                          >
                            <input
                              className={inputCls}
                              value={d.dosageText ?? ""}
                              placeholder="—"
                              onChange={(e) =>
                                setDrug(i, "dosageText", e.target.value)
                              }
                            />
                          </Field>
                          <Field
                            label="Indication"
                            e2b="G.k.7.r"
                            state={fieldState(selected, `drugs.${i}.indication`)}
                            onFocus={() =>
                              setHighlight(
                                selected.provenance.evidence[
                                  `drugs.${i}.indication`
                                ] ?? ""
                              )
                            }
                          >
                            <input
                              className={inputCls}
                              value={d.indication ?? ""}
                              placeholder="—"
                              onChange={(e) =>
                                setDrug(i, "indication", e.target.value)
                              }
                            />
                          </Field>
                        </div>
                      ))}
                    </Section>

                    {/* 4 · Adverse events */}
                    <Section
                      index={4}
                      title="Adverse event(s)"
                      subtitle="E2B section E · MedDRA coded"
                    >
                      {selected.adverseEvents.length === 0 && (
                        <div className="rounded-lg border border-dashed border-rose-300 bg-rose-50/50 px-3 py-4 text-center text-sm text-rose-600">
                          No adverse event identified.
                        </div>
                      )}
                      <div className="space-y-4">
                        {selected.adverseEvents.map((ev, i) => {
                          const serious = isSerious(ev.seriousness);
                          const candidates = codeAdverseEventCandidates(
                            ev.descriptionAsReported
                          );
                          return (
                            <div
                              key={ev.id}
                              className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-500">
                                  Event {i + 1}
                                </span>
                                <SeriousBadge serious={serious} />
                              </div>

                              <Field
                                label="Reaction as reported"
                                e2b="E.i.1.1a"
                                state={fieldState(
                                  selected,
                                  `adverseEvents.${i}.descriptionAsReported`
                                )}
                                onFocus={() =>
                                  setHighlight(
                                    selected.provenance.evidence[
                                      `adverseEvents.${i}.descriptionAsReported`
                                    ] ?? ""
                                  )
                                }
                              >
                                <input
                                  className={inputCls}
                                  value={ev.descriptionAsReported}
                                  onChange={(e) =>
                                    setEvent(
                                      i,
                                      "descriptionAsReported",
                                      e.target.value
                                    )
                                  }
                                />
                              </Field>

                              {/* MedDRA coding */}
                              <div className="mt-3 rounded-md border border-slate-200 bg-white p-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="flex items-baseline gap-1.5 text-xs font-medium text-slate-600">
                                    MedDRA coding
                                    <span className="font-mono text-[10px] text-slate-400">
                                      E.i.2.1b
                                    </span>
                                  </span>
                                  <button
                                    onClick={() =>
                                      setOpenCoderFor(
                                        openCoderFor === ev.id ? null : ev.id
                                      )
                                    }
                                    className="text-xs font-medium text-cyan-700 hover:text-cyan-800"
                                  >
                                    {openCoderFor === ev.id ? "Close" : "Change"}
                                  </button>
                                </div>

                                {ev.meddra ? (
                                  <div className="mt-2 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                                    <div>
                                      <div className="text-[11px] text-slate-400">
                                        Preferred Term (PT)
                                      </div>
                                      <div className="font-medium text-slate-800">
                                        {ev.meddra.pt}{" "}
                                        <span className="font-mono text-xs text-slate-500">
                                          {ev.meddra.ptCode}
                                        </span>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] text-slate-400">
                                        Lowest Level Term (LLT)
                                      </div>
                                      <div className="font-medium text-slate-800">
                                        {ev.meddra.llt}{" "}
                                        <span className="font-mono text-xs text-slate-500">
                                          {ev.meddra.lltCode}
                                        </span>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] text-slate-400">
                                        System Organ Class (SOC)
                                      </div>
                                      <div className="text-slate-700">
                                        {ev.meddra.soc}
                                      </div>
                                    </div>
                                    <div className="flex items-end justify-between gap-2">
                                      <div>
                                        <div className="text-[11px] text-slate-400">
                                          Auto-coder match
                                        </div>
                                        <ConfidenceChip
                                          band={bandFromScore(ev.meddra.score)}
                                          score={ev.meddra.score}
                                        />
                                      </div>
                                      <span className="font-mono text-[10px] text-slate-400">
                                        {ev.meddra.matchedVia}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-2 text-sm text-rose-600">
                                    No automatic match — select a term manually.
                                  </div>
                                )}

                                {openCoderFor === ev.id && (
                                  <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
                                    {candidates.length === 0 && (
                                      <div className="px-3 py-2 text-xs text-slate-500">
                                        No candidate terms.
                                      </div>
                                    )}
                                    {candidates.map((cand) => (
                                      <button
                                        key={cand.ptCode + cand.lltCode}
                                        onClick={() => applyCoding(i, cand)}
                                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-cyan-50"
                                      >
                                        <span>
                                          <span className="font-medium text-slate-800">
                                            {cand.pt}
                                          </span>{" "}
                                          <span className="font-mono text-xs text-slate-500">
                                            {cand.ptCode}
                                          </span>
                                          <span className="ml-2 text-xs text-slate-400">
                                            via {cand.llt}
                                          </span>
                                        </span>
                                        <ConfidenceChip
                                          band={bandFromScore(cand.score)}
                                          score={cand.score}
                                        />
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Onset + outcome */}
                              <div className="mt-3 grid grid-cols-2 gap-3">
                                <Field
                                  label="Onset date"
                                  e2b="E.i.4"
                                  state={fieldState(
                                    selected,
                                    `adverseEvents.${i}.onsetDate`
                                  )}
                                  onFocus={() =>
                                    setHighlight(
                                      selected.provenance.evidence[
                                        `adverseEvents.${i}.onsetDate`
                                      ] ?? ""
                                    )
                                  }
                                >
                                  <input
                                    className={inputCls}
                                    value={ev.onsetDate ?? ""}
                                    placeholder="YYYY-MM-DD"
                                    onChange={(e) =>
                                      setEvent(i, "onsetDate", e.target.value)
                                    }
                                  />
                                </Field>
                                <Field
                                  label="Outcome"
                                  e2b="E.i.7"
                                  state={fieldState(
                                    selected,
                                    `adverseEvents.${i}.outcome`
                                  )}
                                >
                                  <select
                                    className={inputCls}
                                    value={ev.outcome ?? "unknown"}
                                    onChange={(e) =>
                                      setEvent(
                                        i,
                                        "outcome",
                                        e.target.value as ReactionOutcome
                                      )
                                    }
                                  >
                                    <option value="recovered">Recovered</option>
                                    <option value="recovering">Recovering</option>
                                    <option value="not_recovered">
                                      Not recovered
                                    </option>
                                    <option value="recovered_with_sequelae">
                                      Recovered with sequelae
                                    </option>
                                    <option value="fatal">Fatal</option>
                                    <option value="unknown">Unknown</option>
                                  </select>
                                </Field>
                              </div>

                              {/* Seriousness grid */}
                              <div className="mt-3">
                                <div className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium text-slate-600">
                                  Seriousness criteria
                                  <span className="font-mono text-[10px] text-slate-400">
                                    E.i.3.2a–f
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                  {SERIOUSNESS_CRITERIA.map((crit) => {
                                    const on = ev.seriousness[crit.key];
                                    const danger =
                                      crit.key === "death" ||
                                      crit.key === "lifeThreatening";
                                    return (
                                      <button
                                        key={crit.key}
                                        onClick={() =>
                                          toggleSeriousness(i, crit.key)
                                        }
                                        className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                                          on
                                            ? danger
                                              ? "border-rose-300 bg-rose-50 text-rose-700"
                                              : "border-amber-300 bg-amber-50 text-amber-800"
                                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                                        }`}
                                      >
                                        <span
                                          className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border ${
                                            on
                                              ? danger
                                                ? "border-rose-500 bg-rose-500 text-white"
                                                : "border-amber-500 bg-amber-500 text-white"
                                              : "border-slate-300"
                                          }`}
                                        >
                                          {on && <IconCheck className="h-2.5 w-2.5" />}
                                        </span>
                                        <span className="leading-tight">
                                          {crit.label}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Section>

                    <div className="h-2" />
                  </div>

                  {/* Sticky action bar */}
                  <div className="border-t border-slate-200 bg-white px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        {selected.validity.isValidCase ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <IconCheck className="h-3.5 w-3.5" />
                            All 4 core elements present — ready to export
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600">
                            <IconAlert className="h-3.5 w-3.5" />
                            Missing: {selected.validity.missing.join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={rejectCase}
                          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={approveAndGenerate}
                          disabled={!selected.validity.isValidCase}
                          className="inline-flex items-center gap-2 rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          <IconShield className="h-4 w-4" />
                          Approve &amp; Generate ICH E2B (R3) XML
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* E2B export modal */}
      {exportXml && (
        <ExportModal
          xml={exportXml.xml}
          caseId={exportXml.id}
          onClose={() => setExportXml(null)}
          onDownloaded={() => {
            markExported(exportXml.id);
            setExportXml(null);
          }}
        />
      )}
      {intakeOpen && (
        <IntakeModal
          onClose={() => setIntakeOpen(false)}
          onCreate={addReport}
        />
      )}
    </div>
  );
}

/* ============================================================================
 * Source text with evidence highlighting
 * ==========================================================================*/

function SourceText({ text, highlight }: { text: string; highlight: string }) {
  const parts = useMemo(() => {
    if (!highlight || highlight.length < 2) return [{ t: text, hit: false }];
    const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx === -1) return [{ t: text, hit: false }];
    return [
      { t: text.slice(0, idx), hit: false },
      { t: text.slice(idx, idx + highlight.length), hit: true },
      { t: text.slice(idx + highlight.length), hit: false },
    ];
  }, [text, highlight]);

  return (
    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
      {parts.map((p, i) =>
        p.hit ? (
          <mark
            key={i}
            className="rounded bg-cyan-200/70 px-0.5 text-slate-900 ring-1 ring-cyan-400/50"
          >
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </pre>
  );
}

function IntakeModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (raw: RawCase) => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [channel, setChannel] = useState<IntakeChannel>("web_form");
  const [sourceText, setSourceText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const raw: RawCase = {
      id: `CASE-${Date.now()}`,
      channel,
      receivedAt: new Date().toISOString(),
      sourceText: sourceText.trim(),
      subject: subject.trim() || "New adverse event report",
    };
    try {
      await onCreate(raw);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report extraction failed.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
      <form
        onSubmit={submit}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">New report</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Create an intake case for human review
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close new report"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600">
              Intake channel
              <select
                className={`${inputCls} mt-1`}
                value={channel}
                onChange={(event) => setChannel(event.target.value as IntakeChannel)}
              >
                {Object.entries(CHANNEL_META).map(([value, meta]) => (
                  <option key={value} value={value}>{meta.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Report title <span className="font-normal text-slate-400">(optional)</span>
              <input
                className={`${inputCls} mt-1`}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={120}
                placeholder="Short case summary"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-600">
            Source report
            <textarea
              className={`${inputCls} mt-1 min-h-56 resize-y leading-relaxed`}
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              maxLength={20000}
              required
              autoFocus
              placeholder="Paste the adverse event report text..."
            />
            <span className="mt-1 block text-right font-mono text-[10px] text-slate-400">
              {sourceText.length.toLocaleString()} / 20,000
            </span>
          </label>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            Prototype only. Extraction runs locally with a rule-based demo engine. Do not enter real patient data; this app is not for regulatory use.
          </p>
          {error && (
            <p role="alert" className="text-sm text-rose-700">{error}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !sourceText.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <IconSpark className="h-4 w-4" />
            {busy ? "Extracting..." : "Extract for review"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ============================================================================
 * Export modal
 * ==========================================================================*/

function ExportModal({
  xml,
  caseId,
  onClose,
  onDownloaded,
}: {
  xml: string;
  caseId: string;
  onClose: () => void;
  onDownloaded: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(xml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  function download() {
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${caseId}-E2B-R3.xml`;
    a.click();
    URL.revokeObjectURL(url);
    onDownloaded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white">
              <IconCheck className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Case approved · E2B(R3) generated
              </div>
              <div className="font-mono text-xs text-slate-500">{caseId}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-900 p-4">
          <pre className="whitespace-pre font-mono text-xs leading-relaxed text-slate-100">
            {xml}
          </pre>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <span className="text-xs text-slate-500">
            Simplified representation — validate against the official ICH schema
            before gateway submission.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <IconCopy className="h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={download}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800"
            >
              <IconDownload className="h-4 w-4" />
              Download XML
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
