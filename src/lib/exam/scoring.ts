import type { CriterionKey } from "./types";

export const CRITERIA: CriterionKey[] = ["fluency", "lexical", "grammar", "pronunciation"];

export function clampBand(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(9, Math.max(0, Math.round(n)));
}

/**
 * The Speaking band is the mean of the four criteria (whole bands), reported in half bands.
 * Averages that fall between half bands are rounded down (6.25 → 6.0, 6.75 → 6.5).
 */
export function overallBand(bands: number[]): number {
  if (bands.length === 0) return 0;
  const mean = bands.reduce((sum, b) => sum + b, 0) / bands.length;
  return Math.floor(mean * 2 + 1e-9) / 2;
}

export function formatBand(band: number): string {
  return band.toFixed(1);
}

/** Index into the IELTS user-level labels (see i18n `bandLevel`). */
export function bandLevel(band: number): number {
  return Math.max(0, Math.min(9, Math.floor(band)));
}
