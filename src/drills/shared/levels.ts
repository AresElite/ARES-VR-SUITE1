import type { ProgressionLevel } from "@/ares/drillTypes";

/**
 * 25-level progression builder.
 * Every drill in the suite runs exactly 25 levels; difficulty curves are
 * resampled from the touchscreen suite's source formulas onto this scale.
 */
export const LEVEL_COUNT = 25;

/** Linear interpolation across the 25 levels (i = 0..24). */
export const lerp25 = (from: number, to: number, i: number) => from + ((to - from) * i) / (LEVEL_COUNT - 1);
export const ilerp25 = (from: number, to: number, i: number) => Math.round(lerp25(from, to, i));

export function levels25(
  make: (i: number) => { label: string; parameters: Record<string, unknown> },
): ProgressionLevel[] {
  return Array.from({ length: LEVEL_COUNT }, (_, i) => ({
    level: i + 1,
    label: `L${i + 1} — ${make(i).label}`,
    parameters: make(i).parameters,
  }));
}
