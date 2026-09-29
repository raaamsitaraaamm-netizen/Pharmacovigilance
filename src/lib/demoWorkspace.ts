import type { PvCase } from "@/types/pvCase";

export const DEMO_TENANTS = [
  {
    id: "northstar-safety-demo",
    name: "Northstar Safety Demo",
    caseIds: ["CASE-2026-0417", "CASE-2026-0418", "CASE-2026-0419"],
  },
  {
    id: "meridian-pv-demo",
    name: "Meridian PV Demo",
    caseIds: ["CASE-2026-0420", "CASE-2026-0421"],
  },
] as const;

export interface DemoWorkspaceData {
  cases: PvCase[];
  warningsByCase: Record<string, string[]>;
}

const STORAGE_VERSION = 1;

function storageKey(tenantId: string): string {
  return `pv-copilot:demo:v${STORAGE_VERSION}:${tenantId}`;
}

export function readDemoWorkspace(tenantId: string): DemoWorkspaceData | null {
  try {
    const stored = localStorage.getItem(storageKey(tenantId));
    if (!stored) return null;
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (
      record.version !== STORAGE_VERSION ||
      record.tenantId !== tenantId ||
      !Array.isArray(record.cases) ||
      !record.cases.every(isPvCase) ||
      !record.warningsByCase ||
      typeof record.warningsByCase !== "object"
    ) {
      return null;
    }
    return {
      cases: record.cases,
      warningsByCase: record.warningsByCase as Record<string, string[]>,
    };
  } catch {
    return null;
  }
}

export function writeDemoWorkspace(
  tenantId: string,
  data: DemoWorkspaceData
): void {
  try {
    localStorage.setItem(
      storageKey(tenantId),
      JSON.stringify({ version: STORAGE_VERSION, tenantId, ...data })
    );
  } catch {
    // Browser storage can be unavailable or full; the active session still works.
  }
}

export function clearDemoWorkspace(tenantId: string): void {
  try {
    localStorage.removeItem(storageKey(tenantId));
  } catch {
    // Browser storage can be unavailable; the current in-memory state is reset separately.
  }
}

function isPvCase(value: unknown): value is PvCase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PvCase>;
  return Boolean(
    candidate.raw &&
      typeof candidate.raw.id === "string" &&
      typeof candidate.raw.sourceText === "string" &&
      candidate.patient &&
      candidate.reporter &&
      Array.isArray(candidate.drugs) &&
      Array.isArray(candidate.adverseEvents) &&
      candidate.provenance &&
      candidate.validity &&
      candidate.caseSeriousness &&
      typeof candidate.status === "string"
  );
}