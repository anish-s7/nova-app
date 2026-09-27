/**
 * A color for a newly discovered topic cluster. Gemini's naming call only returns
 * {label, short, description} (never asked to pick a color — that's a UI concern, not a
 * judgment call), so new clusters get one generated here: golden-angle hue stepping keeps
 * consecutive indexes visually distinct, at roughly the same muted pastel saturation/lightness
 * as the 5 hand-picked seed colors in lib/clusters.ts.
 */
export function colorForClusterIndex(index: number): string {
  const hue = (index * 137.508) % 360; // golden angle
  return hslToHex(hue, 45, 60);
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
