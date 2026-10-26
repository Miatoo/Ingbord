/** Remap stylus pressure (X) → size response (Y). Both axes 0–1. */
export type PressureCurvePoint = { x: number; y: number };

export const DEFAULT_PRESSURE_SIZE_CURVE: PressureCurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export function normalizePressureCurve(points: PressureCurvePoint[]): PressureCurvePoint[] {
  const cleaned = points
    .map((p) => ({
      x: Math.max(0, Math.min(1, p.x)),
      y: Math.max(0, Math.min(1, p.y)),
    }))
    .sort((a, b) => a.x - b.x);
  if (cleaned.length === 0) return DEFAULT_PRESSURE_SIZE_CURVE.map((p) => ({ ...p }));
  if (cleaned[0].x > 0) cleaned.unshift({ x: 0, y: cleaned[0].y });
  if (cleaned[cleaned.length - 1].x < 1) {
    const last = cleaned[cleaned.length - 1];
    cleaned.push({ x: 1, y: last.y });
  }
  // Ensure endpoints pinned to 0 and 1 on X
  cleaned[0] = { x: 0, y: cleaned[0].y };
  cleaned[cleaned.length - 1] = { x: 1, y: cleaned[cleaned.length - 1].y };
  return cleaned;
}

/** Map raw pressure 0–1 through the user curve. */
export function evaluatePressureCurve(
  pressure: number,
  points: PressureCurvePoint[] | null | undefined
): number {
  const p = Math.max(0, Math.min(1, pressure));
  const curve = normalizePressureCurve(points?.length ? points : DEFAULT_PRESSURE_SIZE_CURVE);
  if (curve.length === 1) return curve[0].y;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (p >= a.x && p <= b.x) {
      const t = b.x - a.x < 1e-6 ? 0 : (p - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return curve[curve.length - 1].y;
}
