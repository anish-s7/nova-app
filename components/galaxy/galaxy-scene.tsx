"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getCluster } from "@/lib/clusters";
import { isSongNode } from "@/lib/song-layer";
import { topTwo } from "@/lib/why-mix";
import { BOND_AT } from "@/lib/thread";
import { homeOrbitPoint, type LayoutPoint } from "@/lib/galaxy-layout";
import type { GalaxyNode } from "@/lib/types";
import type { GalaxyApi, GalaxyViewProps } from "./types";

const BG = "#110f22";
const FOV = 50;
const EDGE_MIN = 0.6;

const nodeVertex = /* glsl */ `
  attribute vec3 color;
  attribute float aSize;
  attribute float aIsMe;
  attribute float aBirth;
  attribute float aHighlight;
  attribute float aDim;
  attribute float aPhase;
  uniform float uTime;
  uniform float uOthers;
  uniform float uMe;
  uniform float uScale;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float birth = aBirth < 0.0 ? 1.0 : smoothstep(0.0, 1.8, uTime - aBirth);
    float vis = mix(uOthers, uMe, aIsMe) * birth;
    float lit = clamp(aDim, 0.0, 1.0);
    // aDim below zero removes the star entirely (the song layer while you're looking at people).
    float show = clamp(aDim + 1.0, 0.0, 1.0);
    float dim = mix(0.14, 1.0, lit);
    float hl = clamp(aHighlight, 0.0, 1.0);
    float size = aSize * (1.0 + hl * 0.4) * (0.3 + 0.7 * birth) * mix(0.7, 1.0, lit) * show;
    gl_PointSize = max(size * uScale / -mv.z, 7.0 * vis * show) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
    vColor = color;
    vAlpha = vis * dim * show * (0.75 + hl * 0.25 + aIsMe * 0.25);
    vRing = step(0.99, aHighlight) * vis;
  }
`;

const nodeFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.26, 0.0, d);
    float halo = pow(1.0 - d, 3.2) * 0.32;
    float ring = vRing * (1.0 - smoothstep(0.0, 0.04, abs(d - 0.86))) * 0.6;
    vec3 c = vColor * (halo + core * 0.9 + ring) + vec3(core * 0.55 + ring * 0.25);
    gl_FragColor = vec4(c * vAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

const edgeVertex = /* glsl */ `
  attribute vec3 color;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const edgeFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor * vAlpha * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

const bondVertex = /* glsl */ `
  attribute vec3 color;
  attribute float aT;
  varying vec3 vColor;
  varying float vT;
  void main() {
    vColor = color;
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The bond between you and the selected star: a steady thread. */
const bondFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vT;
  void main() {
    float ends = smoothstep(0.0, 0.08, vT) * smoothstep(1.0, 0.92, vT);
    gl_FragColor = vec4(vColor * 0.55 * ends * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Soft round glow, tinted per cluster by the sprite material. */
function nebulaTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const bridgeTo = new THREE.Color();

/** Home galaxy: closer orbits burn brighter; suggestions are small. */
function starSize(n: GalaxyNode) {
  if (n.relationship === "nearby") return 1.5;
  if (n.relationship === "arriving") return 2.6;
  if (n.relationship === "connected") return 2.1 + 0.6 * (n.orbit ?? 0);
  return 2.1;
}

/** A line of text that stays the same size on screen however far away it is. */
function textSprite(text: string) {
  const px = 44;
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-newsreader").trim() || "serif";
  const font = `italic ${px}px ${family}`;
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 16;
  c.height = Math.ceil(px * 1.4);
  g.font = font;
  g.fillStyle = "rgba(236, 234, 250, 0.92)";
  g.textBaseline = "middle";
  g.fillText(text, 8, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, opacity: 0 }));
  // sizeAttenuation off: scale is a fraction of the view height.
  const h = 0.032;
  sp.scale.set((h * c.width) / c.height, h, 1);
  return sp;
}

/** A gentle arc from a to b, bowed sideways and toward the camera so it reads as a path, not a ruler line. */
function arc(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, bow: number, segments: number) {
  const va = new THREE.Vector3(a.x, a.y, a.z);
  const vb = new THREE.Vector3(b.x, b.y, b.z);
  const mid = va.clone().lerp(vb, 0.5);
  const len = va.distanceTo(vb);
  const perp = new THREE.Vector3(-(vb.y - va.y), vb.x - va.x, 0).normalize().multiplyScalar(len * bow);
  return new THREE.QuadraticBezierCurve3(va, mid.add(perp).setZ(mid.z + len * bow * 0.7), vb).getPoints(segments);
}

export type ClusterCenter = { id: string; x: number; y: number; z: number; spread: number; extent: number; count: number };

/** Where each "why" lives in the layout, and how far it spreads. Your own star is left out so it doesn't drag a cluster. */
export function clusterCenters(points: Map<string, LayoutPoint>, meId?: string): ClusterCenter[] {
  const groups = new Map<string, LayoutPoint[]>();
  for (const p of points.values()) {
    if (p.id === meId || isSongNode(p.id)) continue;
    const list = groups.get(p.cluster) ?? [];
    list.push(p);
    groups.set(p.cluster, list);
  }
  return [...groups].map(([id, ps]) => {
    const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const y = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    const z = ps.reduce((a, p) => a + p.z, 0) / ps.length;
    const spread = Math.max(2.5, ps.reduce((a, p) => a + Math.hypot(p.x - x, p.y - y), 0) / ps.length);
    const extent = Math.max(3, ...ps.map((p) => Math.hypot(p.x - x, p.y - y)));
    return { id, x, y, z, spread, extent, count: ps.length };
  });
}

/**
 * An orbit: the camera sits `dist` from the pivot (x, y, z), turned by yaw and pitch around it.
 * `lift` raises the pivot on screen by that fraction of the view height without moving it in the world.
 */
type CamState = { x: number; y: number; z: number; dist: number; yaw: number; pitch: number; lift: number };
type CamMove = { x: number; y: number; z: number; dist: number; yaw?: number; pitch?: number; lift?: number };
type Tween = { start: number; dur: number; group: string; update: (e: number) => void; resolve: () => void };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep pitch short of the poles so the view never flips over the top. */
const PITCH_LIMIT = 1.3;
/** Radians of turn per pixel dragged. */
const ORBIT_SPEED = 0.006;
/** Wrap an angle into (-π, π] so tweens take the short way round. */
const wrapAngle = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

function Scene({
  nodes,
  edges,
  layout,
  extra,
  selectedId,
  onSelect,
  apiRef,
  initialPhase = "explore",
  interactive = true,
  onReady,
  focusCluster = null,
  mode = "people",
  focusIds = null,
  threads = [],
  fading,
  hidden,
  destinations = [],
  bridges = [],
  onSelectDestination,
}: GalaxyViewProps) {
  const { camera, gl, size, invalidate } = useThree();
  const perspective = camera as THREE.PerspectiveCamera;

  const points = useMemo(() => {
    const m = new Map<string, LayoutPoint>(layout.points);
    for (const p of extra) m.set(p.id, p);
    return m;
  }, [layout, extra]);

  const meId = nodes.find((n) => n.isMe)?.userId;

  const t0 = useRef(performance.now());
  const now = () => (performance.now() - t0.current) / 1000;
  const births = useRef(new Map<string, number>());
  const known = useRef(new Set(layout.points.keys()));

  // Community members live in distant galaxies; "home" framing leaves them out.
  const memberIds = useMemo(() => new Set(nodes.filter((n) => n.destinationId).map((n) => n.userId)), [nodes]);
  const homePoints = useMemo(() => [...layout.points.values()].filter((p) => !memberIds.has(p.id)), [layout, memberIds]);
  const destPoints = useMemo(() => [...(layout.destinations?.values() ?? [])], [layout]);

  // The galaxy's own center (the layout is centered on you, not on the galaxy) and the sphere that holds it.
  const hub = useMemo(() => {
    const lo = { x: Infinity, y: Infinity, z: Infinity };
    const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of homePoints) {
      lo.x = Math.min(lo.x, p.x);
      lo.y = Math.min(lo.y, p.y);
      lo.z = Math.min(lo.z, p.z);
      hi.x = Math.max(hi.x, p.x);
      hi.y = Math.max(hi.y, p.y);
      hi.z = Math.max(hi.z, p.z);
    }
    if (!Number.isFinite(lo.x)) return { x: 0, y: 0, z: 0, radius: layout.radius };
    const c = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
    let radius = 1;
    for (const p of homePoints) radius = Math.max(radius, Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z));
    return { ...c, radius };
  }, [homePoints, layout.radius]);

  /** Camera distance that fits a sphere of this radius. */
  const fitDist = (radius: number) => {
    const aspect = size.width / Math.max(1, size.height);
    const halfV = ((FOV / 2) * Math.PI) / 180;
    // Fit whichever axis is tighter; a wide, short canvas is limited by height, a portrait one by width.
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    // Stars nearer the camera loom larger than the sphere they sit in, so height needs extra room.
    return (radius * (halfV < halfH ? 1.6 : 1.05)) / Math.tan(Math.min(halfV, halfH));
  };
  const overviewDist = useMemo(() => fitDist(hub.radius), [hub.radius, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps -- fitDist reads size
  // Zoomed all the way out: home and every community galaxy around it.
  const universe = useMemo(() => {
    if (!destPoints.length) return null;
    let radius = hub.radius;
    for (const d of destPoints) radius = Math.max(radius, Math.hypot(d.x - hub.x, d.y - hub.y, d.z - hub.z) + d.radius);
    return { x: hub.x, y: hub.y, z: hub.z, dist: fitDist(radius * 0.92) };
  }, [destPoints, hub, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps -- fitDist reads size
  const minDist = 7;
  const maxDist = Math.max(overviewDist, universe?.dist ?? 0) * 1.1;

  const me = meId ? points.get(meId) : undefined;
  const cam = useRef<CamState>(
    initialPhase === "dark"
      ? { x: me?.x ?? 0, y: me?.y ?? 0, z: me?.z ?? 0, dist: 7, yaw: 0, pitch: 0, lift: 0 }
      : { x: hub.x, y: hub.y, z: hub.z, dist: overviewDist, yaw: 0, pitch: 0, lift: 0 },
  );
  const tweens = useRef<Tween[]>([]);
  const dragging = useRef(false);
  // Spin left over after a flick, in radians per frame.
  const vel = useRef({ yaw: 0, pitch: 0 });

  const nodeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: nodeVertex,
        fragmentShader: nodeFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uOthers: { value: initialPhase === "dark" ? 0 : 1 },
          uMe: { value: initialPhase === "dark" ? 0 : 1 },
          uScale: { value: 1 },
          uPixelRatio: { value: 1 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial phase only applies on mount
    [],
  );
  const edgeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: edgeVertex,
        fragmentShader: edgeFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uOpacity: { value: initialPhase === "dark" ? 0 : 1 } },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial phase only applies on mount
    [],
  );

  const ordered = useMemo(() => nodes.filter((n) => points.has(n.userId)), [nodes, points]);
  // Stars that flew somewhere after the layout ran (flyIntoOrbit), until the layout catches up.
  const moved = useRef(new Map<string, { x: number; y: number; z: number }>());
  const posOf = (id: string) => moved.current.get(id) ?? points.get(id);

  // How lit each star should be: 1 lit, 0 ghosted, -1 gone. The song layer and the people layer take turns.
  const dimFor = (n: (typeof nodes)[number]) => {
    const leaving = fading?.get(n.userId);
    if (leaving !== undefined) return 1 - 2 * leaving;
    if (n.kind === "song") {
      if (mode !== "songs") return -1;
      return !focusIds || focusIds.has(n.userId) || n.userId === selectedId ? 1 : 0;
    }
    if (n.isMe) return 1;
    // Suggestions stay faint until you look at one; community members sit a step back from whoever you're meeting.
    if (n.relationship === "nearby") return selectedId === n.userId ? 1 : 0.4;
    if (n.destinationId && !n.relationship) return selectedId && selectedId !== n.userId ? 0.45 : 0.7;
    // A selected song lights the people who have it; everyone else steps back.
    if (mode === "songs") return focusIds?.has(n.userId) ? 1 : 0;
    // Ambient far stars stay faint until you tap one; they should be easy to ignore.
    if (n.far) return selectedId === n.userId ? 1 : !focusCluster || n.cluster === focusCluster ? 0.45 : 0;
    return !focusCluster || n.cluster === focusCluster || n.userId === selectedId ? 1 : 0;
  };
  const dimForRef = useRef(dimFor);
  dimForRef.current = dimFor;

  const nodeGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = ordered.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const sizeA = new Float32Array(n);
    const isMe = new Float32Array(n);
    const birth = new Float32Array(n);
    const c = new THREE.Color();
    ordered.forEach((node, i) => {
      const laid = points.get(node.userId)!;
      const flown = moved.current.get(node.userId);
      // Once the layout puts a flown star where it landed, the layout owns it again.
      if (flown && Math.hypot(flown.x - laid.x, flown.y - laid.y, flown.z - laid.z) < 0.01) moved.current.delete(node.userId);
      const p = moved.current.get(node.userId) ?? laid;
      pos.set([p.x, p.y, p.z], i * 3);
      c.set(getCluster(node.cluster).color);
      // A bridge song is drawn between its two whys: their colors, weighted by how many listeners each has.
      if (node.kind === "song" && node.bridge && node.whys) {
        const [a, b] = topTwo(node.whys);
        if (b) c.lerp(bridgeTo.set(getCluster(b.id).color), 1 - a.w);
      }
      col.set([c.r, c.g, c.b], i * 3);
      sizeA[i] = node.isMe ? 3.4 : node.kind === "song" ? (1.5 + 0.3 * Math.min(6, node.weight ?? 1)) * (node.bridge ? 1.3 : 1) : node.far ? 1.6 : starSize(node);
      isMe[i] = node.isMe ? 1 : 0;
      if (!known.current.has(node.userId) && !births.current.has(node.userId)) births.current.set(node.userId, now());
      birth[i] = births.current.get(node.userId) ?? -1;
    });
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizeA, 1));
    g.setAttribute("aIsMe", new THREE.BufferAttribute(isMe, 1));
    g.setAttribute("aBirth", new THREE.BufferAttribute(birth, 1));
    g.setAttribute("aHighlight", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute("aDim", new THREE.BufferAttribute(Float32Array.from(ordered, (node) => dimForRef.current(node)), 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(Float32Array.from({ length: n }, (_, i) => i * 2.399), 1));
    return g;
  }, [ordered, points]);

  const visibleEdges = useMemo(() => edges.filter((e) => e.similarity >= EDGE_MIN && points.has(e.source) && points.has(e.target)), [edges, points]);
  const clusterOf = useMemo(() => new Map(nodes.map((n) => [n.userId, n.cluster])), [nodes]);

  const edgeGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(visibleEdges.length * 6);
    const col = new Float32Array(visibleEdges.length * 6);
    const c = new THREE.Color();
    visibleEdges.forEach((e, i) => {
      [e.source, e.target].forEach((id, j) => {
        const p = points.get(id)!;
        pos.set([p.x, p.y, p.z], i * 6 + j * 3);
        c.set(getCluster(clusterOf.get(id) ?? "").color);
        col.set([c.r, c.g, c.b], i * 6 + j * 3);
      });
    });
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(visibleEdges.length * 2), 1));
    return g;
  }, [visibleEdges, points, clusterOf]);

  const centers = useMemo(() => clusterCenters(points, meId), [points, meId]);
  // Highlight: 1 = selected (gets a ring), 0.5 = hovered.
  const hovered = useRef<string | null>(null);
  const applyHighlight = () => {
    const hl = nodeGeo.getAttribute("aHighlight") as THREE.BufferAttribute;
    ordered.forEach((n, i) => hl.setX(i, n.userId === selectedId ? 1 : n.userId === hovered.current ? 0.5 : 0));
    hl.needsUpdate = true;
    invalidate();
  };
  const applyHighlightRef = useRef(applyHighlight);
  useLayoutEffect(() => {
    applyHighlightRef.current = applyHighlight;
  });

  useEffect(() => {
    applyHighlightRef.current();
    const alpha = edgeGeo.getAttribute("aAlpha") as THREE.BufferAttribute;
    const inFocus = (id: string) => (focusIds ? focusIds.has(id) : !focusCluster || clusterOf.get(id) === focusCluster);
    visibleEdges.forEach((e, i) => {
      const base = 0.04 + ((e.similarity - EDGE_MIN) / (1 - EDGE_MIN)) * 0.24;
      const mine = e.source === meId || e.target === meId;
      const touched = selectedId && (e.source === selectedId || e.target === selectedId);
      let a = touched ? 0.7 : selectedId ? base * 0.35 : mine ? base * 1.6 : base;
      if (!touched && (focusCluster || focusIds)) a *= inFocus(e.source) && inFocus(e.target) ? 1.8 : 0.15;
      // Each layer only draws its own threads; the other one fades back.
      const songEdge = isSongNode(e.source) && isSongNode(e.target);
      if (mode === "songs") a *= songEdge ? 1.6 : touched ? 1 : 0.08;
      else if (songEdge) a = 0;
      alpha.setX(i * 2, a);
      alpha.setX(i * 2 + 1, a);
    });
    alpha.needsUpdate = true;
    invalidate();
  }, [selectedId, focusCluster, focusIds, mode, nodeGeo, edgeGeo, ordered, visibleEdges, clusterOf, meId, invalidate]);

  // Nebulae: one soft cloud per cluster so the map reads before any star is tapped.
  const nebulaMap = useMemo(() => nebulaTexture(), []);
  const nebulae = useMemo(
    () =>
      centers.map((c) => {
        const m = new THREE.SpriteMaterial({ map: nebulaMap, color: getCluster(c.id).color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
        const sp = new THREE.Sprite(m);
        sp.position.set(c.x, c.y, c.z);
        // Clusters swell with everyone in them, drawn or not, so a bounded view still shows which "whys" are big.
        const total = (k: { id: string; count: number }) => k.count + (hidden?.byCluster[k.id] ?? 0);
        const growth = 0.8 + 0.45 * Math.sqrt(total(c) / Math.max(1, ...centers.map(total)));
        sp.scale.setScalar((c.spread * 4.2 + 6) * growth);
        return { id: c.id, sprite: sp };
      }),
    [centers, nebulaMap, hidden],
  );
  useEffect(() => () => nebulae.forEach((n) => n.sprite.material.dispose()), [nebulae]);

  // Dust: the people who aren't drawn, as a faint haze around each cluster. Density, not nodes: not tappable.
  const dust = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (const k of centers) {
      const n = Math.min(360, Math.round(Math.sqrt(hidden?.byCluster[k.id] ?? 0) * 5));
      if (!n) continue;
      c.set(getCluster(k.id).color);
      // Seeded per cluster so the haze doesn't shimmer between renders.
      let a = 0;
      for (let i = 0; i < k.id.length; i++) a = (Math.imul(a, 31) + k.id.charCodeAt(i)) | 0;
      const rand = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const gauss = () => (rand() + rand() + rand() - 1.5) * 1.6;
      for (let i = 0; i < n; i++) {
        pos.push(k.x + gauss() * k.spread * 1.5, k.y + gauss() * k.spread * 1.5, k.z + gauss() * k.spread);
        col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    return g;
  }, [centers, hidden]);
  const dustMat = useMemo(() => new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), []);
  useEffect(() => () => dust.dispose(), [dust]);
  useEffect(() => () => dustMat.dispose(), [dustMat]);

  // Bond: a curved thread from you to whoever is selected.
  const bondMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: bondVertex,
        fragmentShader: bondFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      }),
    [],
  );
  const bond = useMemo(() => {
    const a = meId ? points.get(meId) : undefined;
    const b = selectedId && selectedId !== meId && !isSongNode(selectedId) ? points.get(selectedId) : undefined;
    if (!a || !b) return null;
    const va = new THREE.Vector3(a.x, a.y, a.z);
    const vb = new THREE.Vector3(b.x, b.y, b.z);
    const mid = va.clone().lerp(vb, 0.5);
    const len = va.distanceTo(vb);
    const perp = new THREE.Vector3(-(vb.y - va.y), vb.x - va.x, 0).normalize().multiplyScalar(len * 0.18);
    const curve = new THREE.QuadraticBezierCurve3(va, mid.add(perp).setZ(mid.z + len * 0.12), vb);
    const pts = curve.getPoints(64);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const ca = new THREE.Color(getCluster(a.cluster).color);
    const cb = new THREE.Color(getCluster(b.cluster).color);
    const col = new Float32Array(pts.length * 3);
    const t = new Float32Array(pts.length);
    pts.forEach((_, i) => {
      const k = i / (pts.length - 1);
      const c = ca.clone().lerp(cb, k);
      col.set([c.r, c.g, c.b], i * 3);
      t[i] = k;
    });
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aT", new THREE.BufferAttribute(t, 1));
    return new THREE.Line(g, bondMat);
  }, [meId, selectedId, points, bondMat]);
  useEffect(() => () => bond?.geometry.dispose(), [bond]);

  // Threads: a line from you to everyone you've traded songs with. Under BOND_AT it's a faint hairline;
  // from BOND_AT it glows, beaded with soft light, and gets brighter the more you trade.
  const threadGroup = useMemo(() => {
    const group = new THREE.Group();
    const a = meId ? points.get(meId) : undefined;
    if (!a) return group;
    for (const t of threads) {
      const b = points.get(t.userId);
      if (!b) continue;
      const va = new THREE.Vector3(a.x, a.y, a.z);
      const vb = new THREE.Vector3(b.x, b.y, b.z);
      const mid = va.clone().lerp(vb, 0.5);
      const len = va.distanceTo(vb);
      const perp = new THREE.Vector3(-(vb.y - va.y), vb.x - va.x, 0).normalize().multiplyScalar(len * 0.14);
      const pts = new THREE.QuadraticBezierCurve3(va, mid.add(perp).setZ(mid.z + len * 0.1), vb).getPoints(48);
      const bonded = t.count >= BOND_AT;
      const strength = bonded ? Math.min(1, 0.55 + (t.count - BOND_AT) * 0.1) : 0.14;
      const color = new THREE.Color(getCluster(a.cluster).color).lerp(new THREE.Color(getCluster(b.cluster).color), 0.5);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: bonded ? 0.55 + strength * 0.4 : strength, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      group.add(line);
      if (!bonded) continue;
      for (let i = 4; i < pts.length - 3; i += 5) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebulaMap, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.22 + strength * 0.3 }));
        sp.position.copy(pts[i]);
        sp.scale.setScalar(1.6 + strength * 1.2);
        group.add(sp);
      }
    }
    return group;
  }, [threads, points, meId, nebulaMap]);
  useEffect(() => {
    threadGroup.visible = mode === "people";
    invalidate();
  }, [threadGroup, mode, invalidate]);
  useEffect(
    () => () =>
      threadGroup.traverse((o) => {
        const m = (o as THREE.Line | THREE.Sprite).material as THREE.Material | undefined;
        m?.dispose();
        (o as THREE.Line).geometry?.dispose();
      }),
    [threadGroup],
  );

  // Community galaxies: a glow, a spiral of dust, and a name you can see from home.
  const destColor = useMemo(() => new Map(destinations.map((d) => [d.id, d])), [destinations]);
  const destGlows = useMemo(
    () =>
      destPoints.map((d) => {
        const color = destColor.get(d.id)?.color ?? "#ffffff";
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebulaMap, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 }));
        glow.position.set(d.x, d.y, d.z);
        glow.scale.setScalar(d.radius * 3.4);
        const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebulaMap, color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
        core.position.set(d.x, d.y, d.z);
        core.scale.setScalar(d.radius * 0.7);
        return { id: d.id, glow, core };
      }),
    [destPoints, destColor, nebulaMap],
  );
  useEffect(
    () => () =>
      destGlows.forEach((g) => {
        g.glow.material.dispose();
        g.core.material.dispose();
      }),
    [destGlows],
  );
  const destDust = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (const d of destPoints) {
      c.set(destColor.get(d.id)?.color ?? "#ffffff");
      let a = 0;
      for (let i = 0; i < d.id.length; i++) a = (Math.imul(a, 31) + d.id.charCodeAt(i)) | 0;
      const rand = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      // Two loose spiral arms, so it reads as a galaxy of its own from far away.
      const twist = rand() * Math.PI * 2;
      for (let i = 0; i < 220; i++) {
        const t = Math.sqrt(rand());
        const arm = i % 2 ? Math.PI : 0;
        const ang = twist + arm + t * 4.2 + (rand() - 0.5) * 0.9;
        const r = t * d.radius * 1.25;
        pos.push(d.x + Math.cos(ang) * r, d.y + Math.sin(ang) * r, d.z + (rand() - 0.5) * 1.6);
        const k = 0.55 + rand() * 0.45;
        col.push(c.r * k, c.g * k, c.b * k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    return g;
  }, [destPoints, destColor]);
  const destDustMat = useMemo(
    () => new THREE.PointsMaterial({ size: 0.55, map: nebulaMap, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }),
    [nebulaMap],
  );
  useEffect(() => () => destDust.dispose(), [destDust]);
  useEffect(() => () => destDustMat.dispose(), [destDustMat]);
  // Names, drawn as fixed-size text sprites. They only earn their place once you've pulled back far enough to see the other galaxies.
  const destLabels = useMemo(
    () =>
      destPoints.map((d) => {
        const sp = textSprite(destColor.get(d.id)?.name ?? "");
        sp.position.set(d.x, d.y - d.radius * 1.3, d.z);
        return sp;
      }),
    [destPoints, destColor],
  );
  useEffect(
    () => () =>
      destLabels.forEach((sp) => {
        sp.material.map?.dispose();
        sp.material.dispose();
      }),
    [destLabels],
  );

  // Bridges: a lasting line from someone at home to the community you found them in. New ones fade in.
  const seenBridges = useRef(new Set<string>());
  const bridgeLines = useMemo(() => {
    const out: { key: string; line: THREE.Line; mat: THREE.ShaderMaterial; fresh: boolean }[] = [];
    for (const b of bridges) {
      const p = points.get(b.personId);
      const d = layout.destinations?.get(b.destinationId);
      if (!p || !d) continue;
      const key = `${b.personId}>${b.destinationId}`;
      const pts = arc(p, d, 0.1, 64);
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const ca = new THREE.Color(getCluster(p.cluster).color);
      const cb = new THREE.Color(destColor.get(d.id)?.color ?? "#ffffff");
      const col = new Float32Array(pts.length * 3);
      const t = new Float32Array(pts.length);
      pts.forEach((_, i) => {
        const k = i / (pts.length - 1);
        const c = ca.clone().lerp(cb, k);
        col.set([c.r, c.g, c.b], i * 3);
        t[i] = k;
      });
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.setAttribute("aT", new THREE.BufferAttribute(t, 1));
      const fresh = !seenBridges.current.has(key);
      const mat = new THREE.ShaderMaterial({
        vertexShader: bondVertex,
        fragmentShader: bondFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: fresh ? 0 : 0.8 } },
      });
      out.push({ key, line: new THREE.Line(g, mat), mat, fresh });
    }
    return out;
  }, [bridges, points, layout.destinations, destColor]);
  useEffect(
    () => () =>
      bridgeLines.forEach((b) => {
        b.line.geometry.dispose();
        b.mat.dispose();
      }),
    [bridgeLines],
  );

  // The trail a star leaves while it flies home.
  const TRAIL = 40;
  const trail = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    return new THREE.Line(g, mat);
  }, []);
  useEffect(
    () => () => {
      trail.geometry.dispose();
      (trail.material as THREE.Material).dispose();
    },
    [trail],
  );

  const stars = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(1500 * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // A shell all the way round, so there's sky behind the galaxy from every angle.
    for (let i = 0; i < 1500; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const rad = 260 + r() * 200;
      const s2 = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s2 * rad, u * rad, Math.sin(th) * s2 * rad], i * 3);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const starGroup = useRef<THREE.Group>(null);

  // Arrivals need a few seconds of frames for their fade and scale-in.
  const tween = (group: string, dur: number, update: (e: number) => void) =>
    new Promise<void>((resolve) => {
      tweens.current = tweens.current.filter((t) => {
        if (t.group !== group) return true;
        t.resolve();
        return false;
      });
      if (dur <= 0) {
        update(1);
        resolve();
        invalidate();
        return;
      }
      tweens.current.push({ start: performance.now(), dur, group, update, resolve });
      invalidate();
    });

  useEffect(() => {
    if (births.current.size) tween("birth", 2000, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tween is stable in behavior
  }, [nodeGeo]);

  // Focus: ease each star's dim weight toward its target rather than snapping.
  useEffect(() => {
    const attr = nodeGeo.getAttribute("aDim") as THREE.BufferAttribute;
    const from = Array.from(attr.array as Float32Array);
    const to = ordered.map((n) => dimForRef.current(n));
    tween("dim", 600, (e) => {
      to.forEach((v, i) => attr.setX(i, lerp(from[i] ?? 1, v, e)));
      attr.needsUpdate = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tween is stable in behavior
  }, [focusCluster, focusIds, mode, selectedId, nodeGeo, ordered]);

  /** Tween the orbit. Leaving out yaw/pitch keeps the angle the user is looking from; lift defaults to none. */
  const moveCamera = (to: CamMove, dur: number) => {
    vel.current = { yaw: 0, pitch: 0 };
    const from = { ...cam.current, yaw: wrapAngle(cam.current.yaw) };
    const yaw = to.yaw === undefined ? from.yaw : from.yaw + wrapAngle(to.yaw - from.yaw);
    const pitch = to.pitch ?? from.pitch;
    const lift = to.lift ?? 0;
    return tween("camera", dur, (e) => {
      cam.current = {
        x: lerp(from.x, to.x, e),
        y: lerp(from.y, to.y, e),
        z: lerp(from.z, to.z, e),
        dist: lerp(from.dist, to.dist, e),
        yaw: lerp(from.yaw, yaw, e),
        pitch: lerp(from.pitch, pitch, e),
        lift: lerp(from.lift, lift, e),
      };
    });
  };
  const fadeUniform = (u: { value: number }, to: number, dur: number, group: string) => {
    const from = u.value;
    return tween(group, dur, (e) => (u.value = lerp(from, to, e)));
  };

  // Fade the bond in whenever a new one is drawn.
  useEffect(() => {
    bondMat.uniforms.uOpacity.value = 0;
    if (bond) fadeUniform(bondMat.uniforms.uOpacity, 1, 900, "bond");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fadeUniform is stable in behavior
  }, [bond, bondMat]);

  useEffect(() => {
    for (const b of bridgeLines) {
      if (!b.fresh) continue;
      seenBridges.current.add(b.key);
      fadeUniform(b.mat.uniforms.uOpacity, 0.8, 1600, `bridge:${b.key}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fadeUniform is stable in behavior
  }, [bridgeLines]);

  /** A journey rather than a pan: the camera rises out of where it is, crosses, and settles in. */
  const travel = (to: CamMove, dur: number) => {
    vel.current = { yaw: 0, pitch: 0 };
    const from = { ...cam.current, yaw: wrapAngle(cam.current.yaw) };
    const yaw = to.yaw === undefined ? from.yaw : from.yaw + wrapAngle(to.yaw - from.yaw);
    const pitch = to.pitch ?? from.pitch;
    const lift = to.lift ?? 0;
    const span = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const hop = Math.max(0, span * 0.9 - Math.min(from.dist, to.dist) * 0.3);
    return tween("camera", dur, (e) => {
      cam.current = {
        x: lerp(from.x, to.x, e),
        y: lerp(from.y, to.y, e),
        z: lerp(from.z, to.z, e),
        dist: lerp(from.dist, to.dist, e) + Math.sin(Math.PI * e) * hop,
        yaw: lerp(from.yaw, yaw, e),
        pitch: lerp(from.pitch, pitch, e),
        lift: lerp(from.lift, lift, e),
      };
    });
  };

  const api = useRef<GalaxyApi>(null!);
  api.current = {
    igniteMe: async (duration = 1800) => {
      await Promise.all([
        fadeUniform(nodeMat.uniforms.uMe, 1, duration, "me"),
        moveCamera({ x: me?.x ?? 0, y: me?.y ?? 0, z: me?.z ?? 0, dist: 11, yaw: 0, pitch: 0 }, duration * 1.2),
      ]);
    },
    pullBackToOverview: async (duration = 2800) => {
      nodeMat.uniforms.uMe.value = 1;
      // With community galaxies around, the overview is the whole universe, not just home.
      const view = universe ?? { x: hub.x, y: hub.y, z: hub.z, dist: overviewDist };
      await Promise.all([
        moveCamera({ ...view, yaw: 0, pitch: 0 }, duration),
        fadeUniform(nodeMat.uniforms.uOthers, 1, duration * 0.85, "others"),
        fadeUniform(edgeMat.uniforms.uOpacity, 1, duration, "edges"),
      ]);
    },
    flyTo: async (userId, opts) => {
      const p = points.get(userId);
      if (!p) return;
      const dist = opts?.distance ?? Math.min(cam.current.dist, 18);
      // The tapped star becomes the new pivot; the angle you were looking from is kept.
      await moveCamera({ x: p.x, y: p.y, z: p.z, dist, lift: opts?.lift ?? 0 }, opts?.duration ?? 600);
    },
    recenter: () => moveCamera({ x: hub.x, y: hub.y, z: hub.z, dist: overviewDist, yaw: 0, pitch: 0 }, 700),
    flyToGroup: async (ids) => {
      const ps = ids.map((id) => points.get(id)).filter((p): p is LayoutPoint => !!p);
      if (!ps.length) return moveCamera({ x: hub.x, y: hub.y, z: hub.z, dist: overviewDist }, 900);
      const c = { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length };
      const extent = Math.max(4, ...ps.map((p) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z)));
      const dist = clamp((extent * 1.7) / Math.tan(((FOV / 2) * Math.PI) / 180), 16, overviewDist * 0.95);
      const lift = (extent * 0.1) / (2 * dist * Math.tan(((FOV / 2) * Math.PI) / 180));
      await moveCamera({ ...c, dist, lift }, 1000);
    },
    flyToCluster: async (cluster) => {
      const c = cluster ? centers.find((k) => k.id === cluster) : undefined;
      if (!c) return moveCamera({ x: hub.x, y: hub.y, z: hub.z, dist: overviewDist }, 900);
      // Fit the whole cluster with room for the UI above and below it.
      const dist = clamp((c.extent * 1.6) / Math.tan(((FOV / 2) * Math.PI) / 180), 18, overviewDist * 0.9);
      const lift = (c.extent * 0.1) / (2 * dist * Math.tan(((FOV / 2) * Math.PI) / 180));
      await moveCamera({ x: c.x, y: c.y, z: c.z, dist, lift }, 1000);
    },
    flyToDestination: async (id, opts) => {
      const d = layout.destinations?.get(id);
      if (!d) return;
      await travel({ x: d.x, y: d.y, z: d.z, dist: fitDist(d.radius * 1.15), yaw: 0, pitch: 0, lift: opts?.lift ?? 0 }, opts?.duration ?? 2600);
    },
    returnHome: async (duration = 2400) => {
      nodeMat.uniforms.uMe.value = 1;
      await Promise.all([
        travel({ x: hub.x, y: hub.y, z: hub.z, dist: overviewDist, yaw: 0, pitch: 0 }, duration),
        fadeUniform(nodeMat.uniforms.uOthers, 1, duration * 0.7, "others"),
        fadeUniform(edgeMat.uniforms.uOpacity, 1, duration, "edges"),
      ]);
    },
    flyIntoOrbit: async (personId, duration = 2600) => {
      const i = ordered.findIndex((n) => n.userId === personId);
      const from = posOf(personId);
      if (i < 0 || !from) return;
      const to = homeOrbitPoint({ ...ordered[i], orbit: ordered[i].orbit ?? 0 });
      const path = arc(from, to, 0.12, 120);
      const at = (e: number) => path[Math.min(path.length - 1, Math.round(e * (path.length - 1)))];
      const posAttr = nodeGeo.getAttribute("position") as THREE.BufferAttribute;
      const tPos = trail.geometry.getAttribute("position") as THREE.BufferAttribute;
      const tCol = trail.geometry.getAttribute("color") as THREE.BufferAttribute;
      const color = new THREE.Color(getCluster(ordered[i].cluster).color);
      const trailMat = trail.material as THREE.LineBasicMaterial;
      trailMat.opacity = 1;
      await tween(`orbit:${personId}`, duration, (e) => {
        const p = at(e);
        posAttr.setXYZ(i, p.x, p.y, p.z);
        posAttr.needsUpdate = true;
        moved.current.set(personId, { x: p.x, y: p.y, z: p.z });
        // The tail covers the last stretch of the path, brightest at the star.
        for (let k = 0; k < TRAIL; k++) {
          const q = at(Math.max(0, e - (k / TRAIL) * 0.22));
          tPos.setXYZ(k, q.x, q.y, q.z);
          const f = 1 - k / TRAIL;
          tCol.setXYZ(k, color.r * f, color.g * f, color.b * f);
        }
        tPos.needsUpdate = true;
        tCol.needsUpdate = true;
      });
      await tween("trail", 700, (e) => (trailMat.opacity = 1 - e));
    },
  };

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      igniteMe: (d) => api.current.igniteMe(d),
      pullBackToOverview: (d) => api.current.pullBackToOverview(d),
      flyTo: (id, o) => api.current.flyTo(id, o),
      recenter: () => api.current.recenter(),
      flyToCluster: (c) => api.current.flyToCluster(c),
      flyToGroup: (ids) => api.current.flyToGroup(ids),
      flyToDestination: (id, o) => api.current.flyToDestination(id, o),
      returnHome: (d) => api.current.returnHome(d),
      flyIntoOrbit: (id, d) => api.current.flyIntoOrbit(id, d),
    };
    onReady?.();
    return () => {
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once
  }, []);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectDestinationRef = useRef(onSelectDestination);
  onSelectDestinationRef.current = onSelectDestination;

  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;
    el.style.touchAction = "none";
    const pointers = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; t: number; moved: number } | null = null;
    let pinch = 0;
    let lastMove = 0;

    const pick = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const v = new THREE.Vector3();
      let best: string | null = null;
      let bestD = 40;
      for (const [id, laid] of points) {
        const p = moved.current.get(id) ?? laid;
        if (id !== meId && nodeMat.uniforms.uOthers.value < 0.5) continue;
        // Only the layer you're looking at can be tapped.
        if (id !== meId && isSongNode(id) !== (modeRef.current === "songs")) continue;
        v.set(p.x, p.y, p.z).project(camera);
        if (v.z > 1) continue;
        const d = Math.hypot(((v.x + 1) / 2) * rect.width - px, ((1 - v.y) / 2) * rect.height - py);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      return best;
    };

    /** A community galaxy under the pointer: generous, since it's a big soft target. */
    const pickDestination = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const v = new THREE.Vector3();
      let best: string | null = null;
      let bestD = 56;
      for (const d of layout.destinations?.values() ?? []) {
        v.set(d.x, d.y, d.z).project(camera);
        if (v.z > 1) continue;
        const dd = Math.hypot(((v.x + 1) / 2) * rect.width - (clientX - rect.left), ((1 - v.y) / 2) * rect.height - (clientY - rect.top));
        if (dd < bestD) {
          bestD = dd;
          best = d.id;
        }
      }
      return best;
    };

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      dragging.current = true;
      vel.current = { yaw: 0, pitch: 0 };
      tweens.current = tweens.current.filter((t) => (t.group === "camera" ? (t.resolve(), false) : true));
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        // Desktop hover: preview a star's name and show it's clickable.
        if (e.pointerType !== "mouse") return;
        const hit = pick(e.clientX, e.clientY);
        el.style.cursor = hit || (onSelectDestinationRef.current && pickDestination(e.clientX, e.clientY)) ? "pointer" : "grab";
        if (hit !== hovered.current) {
          hovered.current = hit;
          applyHighlightRef.current();
        }
        return;
      }
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      lastMove = performance.now();
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) cam.current.dist = clamp((cam.current.dist * pinch) / d, minDist, maxDist);
        pinch = d;
        if (down) down.moved = 99;
      } else {
        // Drag turns the galaxy around its pivot like a globe; it never slides off center.
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        if (down) down.moved += Math.abs(dx) + Math.abs(dy);
        const dYaw = -dx * ORBIT_SPEED;
        const dPitch = dy * ORBIT_SPEED;
        const c = cam.current;
        c.yaw += dYaw;
        c.pitch = clamp(c.pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT);
        vel.current = { yaw: vel.current.yaw * 0.5 + dYaw * 0.5, pitch: vel.current.pitch * 0.5 + dPitch * 0.5 };
      }
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (pointers.size === 0) {
        dragging.current = false;
        // A slow release shouldn't coast.
        if (down && performance.now() - lastMove > 80) vel.current = { yaw: 0, pitch: 0 };
        if (down && down.moved < 8 && performance.now() - down.t < 450) {
          const hit = pick(e.clientX, e.clientY);
          const dest = hit ? null : pickDestination(e.clientX, e.clientY);
          if (hit) api.current.flyTo(hit, { lift: hit === meId ? 0 : 0.1 }).then(() => onSelectRef.current?.(hit));
          else if (dest && onSelectDestinationRef.current) onSelectDestinationRef.current(dest);
          else onSelectRef.current?.(null);
        }
        down = null;
        invalidate();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current.dist = clamp(cam.current.dist * Math.exp(e.deltaY * 0.0012), minDist, maxDist);
      invalidate();
    };

    const onLeave = () => {
      if (!hovered.current) return;
      hovered.current = null;
      applyHighlightRef.current();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [interactive, gl, camera, points, meId, nodeMat, minDist, maxDist, invalidate, layout.destinations]);

  const offset = useMemo(() => new THREE.Vector3(), []);
  const euler = useMemo(() => new THREE.Euler(), []);

  useFrame(() => {
    const nowMs = performance.now();
    let active = false;
    tweens.current = tweens.current.filter((t) => {
      const e = clamp((nowMs - t.start) / t.dur, 0, 1);
      t.update(ease(e));
      if (e >= 1) {
        t.resolve();
        return false;
      }
      active = true;
      return true;
    });

    // Keep spinning briefly after a flick.
    const flying = tweens.current.some((t) => t.group === "camera");
    if (!dragging.current && !flying) {
      const c = cam.current;
      const v = vel.current;
      if (Math.abs(v.yaw) + Math.abs(v.pitch) > 0.0002) {
        c.yaw += v.yaw;
        c.pitch = clamp(c.pitch + v.pitch, -PITCH_LIMIT, PITCH_LIMIT);
        v.yaw *= 0.92;
        v.pitch *= 0.92;
        active = true;
      }
    }

    const c = cam.current;
    euler.set(-c.pitch, c.yaw, 0, "YXZ");
    offset.set(0, 0, c.dist).applyEuler(euler);
    camera.position.set(c.x + offset.x, c.y + offset.y, c.z + offset.z);
    camera.lookAt(c.x, c.y, c.z);
    // Shift the frame rather than the pivot, so a lifted star still turns in place.
    if (Math.abs(c.lift) > 1e-4) perspective.setViewOffset(size.width, size.height, 0, c.lift * size.height, size.width, size.height);
    else if (perspective.view?.enabled) perspective.clearViewOffset();

    const time = now();
    nodeMat.uniforms.uTime.value = time;
    nodeMat.uniforms.uScale.value = size.height / (2 * Math.tan(((perspective.fov / 2) * Math.PI) / 180));
    nodeMat.uniforms.uPixelRatio.value = gl.getPixelRatio();

    if (starGroup.current) {
      // The sky rides along with the pivot so it reads as infinitely far away.
      starGroup.current.position.set(c.x, c.y, c.z);
      // Pulled far back, the sky shell grows so the camera never ends up outside it.
      starGroup.current.scale.setScalar(Math.max(1, c.dist / 200));
    }
    // Community names fade in as you pull back past home, and out as you arrive in one.
    const far = clamp((c.dist - overviewDist * 1.2) / (overviewDist * 0.8), 0, 1);
    for (const sp of destLabels) sp.material.opacity = far;
    bondMat.uniforms.uTime.value = time;
    const others = nodeMat.uniforms.uOthers.value;
    for (const { id, sprite } of nebulae) {
      const focus = (!focusCluster ? 1 : id === focusCluster ? 1.5 : 0.25) * (mode === "songs" ? 0.3 : 1);
      sprite.material.opacity = 0.07 * others * focus;
    }
    dustMat.opacity = 0.4 * others * (mode === "songs" ? 0.2 : focusCluster ? 0.5 : 1);
    // New arrivals fade in; nothing else moves on its own.
    for (const born of births.current.values()) if (time - born < 2) active = true;
    if (active) invalidate();
  });

  return (
    <>
      <color attach="background" args={[BG]} />
      <group ref={starGroup}>
        <points geometry={stars}>
          <pointsMaterial size={1.4} sizeAttenuation={false} color="#c9cbef" transparent opacity={0.5} depthWrite={false} />
        </points>
      </group>
      {nebulae.map((n) => (
        <primitive key={n.id} object={n.sprite} />
      ))}
      <points geometry={dust} material={dustMat} />
      <lineSegments geometry={edgeGeo} material={edgeMat} />
      {bond ? <primitive object={bond} /> : null}
      <primitive object={threadGroup} />
      {destGlows.map((g) => (
        <group key={g.id}>
          <primitive object={g.glow} />
          <primitive object={g.core} />
        </group>
      ))}
      <points geometry={destDust} material={destDustMat} />
      {destLabels.map((sp) => (
        <primitive key={sp.uuid} object={sp} />
      ))}
      {bridgeLines.map((b) => (
        <primitive key={b.key} object={b.line} />
      ))}
      <primitive object={trail} />
      <points geometry={nodeGeo} material={nodeMat} />
    </>
  );
}

export default function GalaxyScene(props: GalaxyViewProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="demand"
      camera={{ fov: FOV, near: 0.1, far: 800, position: [0, 0, 60] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      className="!absolute inset-0"
      aria-hidden
    >
      <Scene {...props} />
    </Canvas>
  );
}
