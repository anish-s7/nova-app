import type { ClusterId } from "./clusters";

/**
 * One real, named constellation per cluster, as an ordered list of its actual stars'
 * relative positions (roughly -1..1). This is the shape each cluster's region is building
 * toward: as people join, they fill these slots in order, so the outline gets more
 * recognizable rather than sprawling indefinitely. Order follows how the asterism is
 * usually traced, so early arrivals already sketch a legible line, not scattered points.
 */
export const CONSTELLATION_SHAPES: Record<ClusterId, { name: string; points: { x: number; y: number }[] }> = {
  // Quiet, small, an instrument — the lyre, for songs you put on alone.
  quiet_company: {
    name: "Lyra",
    points: [
      { x: 0.1, y: 0.9 }, // Vega
      { x: -0.3, y: 0.6 }, // Epsilon Lyrae
      { x: 0.15, y: 0.35 }, // Zeta Lyrae
      { x: 0.55, y: -0.15 }, // Delta Lyrae
      { x: 0.1, y: -0.55 }, // Gamma Lyrae
      { x: -0.35, y: -0.35 }, // Beta Lyrae
    ],
  },
  // The hunter — armor before the hard thing.
  armor_up: {
    name: "Orion",
    points: [
      { x: -0.5, y: 0.9 }, // Betelgeuse
      { x: 0.45, y: 0.85 }, // Bellatrix
      { x: -0.2, y: 0.1 }, // Alnitak
      { x: 0.0, y: 0.05 }, // Alnilam
      { x: 0.2, y: 0.0 }, // Mintaka
      { x: 0.35, y: -0.85 }, // Saiph
      { x: -0.4, y: -0.9 }, // Rigel
    ],
  },
  // The mourning queen — songs for someone you miss.
  carrying_loss: {
    name: "Cassiopeia",
    points: [
      { x: -0.9, y: -0.2 }, // Caph
      { x: -0.45, y: 0.3 }, // Shedar
      { x: 0.0, y: -0.1 }, // Tsih
      { x: 0.45, y: 0.35 }, // Ruchbah
      { x: 0.9, y: -0.15 }, // Segin
    ],
  },
  // The swan in flight — a few minutes somewhere else.
  somewhere_else: {
    name: "Cygnus",
    points: [
      { x: 0.0, y: 1.0 }, // Deneb
      { x: 0.0, y: 0.25 }, // Sadr
      { x: -0.75, y: 0.05 }, // Gienah
      { x: 0.7, y: 0.15 }, // Delta Cygni
      { x: 0.0, y: -0.85 }, // Albireo
    ],
  },
  // The most enduring shape in the sky — songs that take you back.
  old_selves: {
    name: "Ursa Major",
    points: [
      { x: -1.0, y: 0.55 }, // Alkaid
      { x: -0.55, y: 0.65 }, // Mizar
      { x: -0.15, y: 0.55 }, // Alioth
      { x: 0.15, y: 0.35 }, // Megrez
      { x: 0.05, y: -0.15 }, // Phecda
      { x: 0.55, y: -0.25 }, // Merak
      { x: 0.6, y: 0.25 }, // Dubhe
    ],
  },
};

/** Local footprint size (same units as the rest of the layout, e.g. `idealDistance`'s range). */
export const SHAPE_SCALE = 6;

/**
 * The slot a cluster fills at `index`, looping onto a bigger self-similar copy of the same
 * shape once every slot is taken — still that constellation, just retraced at a larger scale
 * for the next ring of arrivals, instead of drifting into an unrelated blob.
 */
export function shapeSlot(cluster: ClusterId, index: number): { x: number; y: number } {
  const shape = CONSTELLATION_SHAPES[cluster];
  const n = shape.points.length;
  const ring = Math.floor(index / n);
  const p = shape.points[index % n];
  const scale = 1 + ring * 0.6;
  return { x: p.x * scale, y: p.y * scale };
}
