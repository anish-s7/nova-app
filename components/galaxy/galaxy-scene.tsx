"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getCluster } from "@/lib/clusters";
import type { LayoutPoint } from "@/lib/galaxy-layout";
import { cn } from "@/lib/utils";
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
    float pulse = aIsMe * 0.14 * sin(uTime * 1.7);
    float twinkle = (1.0 - aIsMe) * 0.1 * sin(uTime * 1.3 + aPhase);
    float vis = mix(uOthers, uMe, aIsMe) * birth;
    float dim = mix(0.14, 1.0, aDim);
    float hl = clamp(aHighlight, 0.0, 1.0);
    float size = aSize * (1.0 + pulse + twinkle + hl * 0.4) * (0.3 + 0.7 * birth) * mix(0.7, 1.0, aDim);
    gl_PointSize = max(size * uScale / -mv.z, 7.0 * vis) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
    vColor = color;
    vAlpha = vis * dim * (0.75 + hl * 0.25 + aIsMe * 0.25);
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
    float halo = pow(1.0 - d, 2.6) * 0.6;
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

/** The bond between you and the selected star: a steady thread with light flowing toward them. */
const bondFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vT;
  void main() {
    float p = fract(vT * 2.0 - uTime * 0.55);
    float glow = smoothstep(0.0, 0.12, p) * smoothstep(0.32, 0.12, p);
    float ends = smoothstep(0.0, 0.08, vT) * smoothstep(1.0, 0.92, vT);
    gl_FragColor = vec4(vColor * (0.35 + glow * 1.2) * ends * uOpacity, 1.0);
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

export type ClusterCenter = { id: string; x: number; y: number; z: number; spread: number; extent: number; count: number };

/** Where each "why" lives in the layout, and how far it spreads. Your own star is left out so it doesn't drag a cluster. */
export function clusterCenters(points: Map<string, LayoutPoint>, meId?: string): ClusterCenter[] {
  const groups = new Map<string, LayoutPoint[]>();
  for (const p of points.values()) {
    if (p.id === meId) continue;
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

type CamState = { x: number; y: number; z: number; dist: number };
type Tween = { start: number; dur: number; group: string; update: (e: number) => void; resolve: () => void };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Pins a DOM label under a world-space point. Plain DOM instead of drei's <Html>, whose nested React root crashes on unmount under React 19. */
function placeLabel(el: HTMLElement | null, at: THREE.Vector3 | null, camera: THREE.Camera, width: number, height: number, text?: string, opacity = 1) {
  if (!el) return;
  if (text !== undefined && el.textContent !== text) el.textContent = text;
  if (!at || opacity <= 0.01) {
    el.style.opacity = "0";
    el.style.visibility = "hidden";
    return;
  }
  const v = at.project(camera);
  const hidden = v.z > 1;
  el.style.opacity = hidden ? "0" : String(opacity);
  el.style.visibility = hidden ? "hidden" : "visible";
  el.style.transform = `translate(${((v.x + 1) / 2) * width}px, ${((1 - v.y) / 2) * height}px) translate(-50%, -50%)`;
}

/** Cluster names: projected, nudged apart when they collide, and kept inside the frame. */
function layoutClusterLabels(items: { el: HTMLElement | null; at: THREE.Vector3; opacity: number }[], width: number, height: number) {
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const shown = items
    .filter((i) => i.el)
    .map((i) => ({ ...i, x: ((i.at.x + 1) / 2) * width, y: ((1 - i.at.y) / 2) * height }))
    .sort((a, b) => a.y - b.y);
  for (const i of shown) {
    const el = i.el!;
    if (i.opacity <= 0.01 || i.at.z > 1) {
      el.style.opacity = "0";
      el.style.visibility = "hidden";
      continue;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = clamp(i.x, w / 2 + 8, width - w / 2 - 8);
    let y = i.y;
    for (const p of placed) {
      if (Math.abs(p.x - x) < (p.w + w) / 2 + 4 && Math.abs(p.y - y) < (p.h + h) / 2 + 2) y = p.y + (p.h + h) / 2 + 2;
    }
    placed.push({ x, y, w, h });
    el.style.visibility = "visible";
    el.style.opacity = String(i.opacity);
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }
}

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
  meLabelRef,
  selectedLabelRef,
  hoverLabelRef,
  clusterLabelRefs,
}: GalaxyViewProps & {
  meLabelRef: RefObject<HTMLSpanElement | null>;
  selectedLabelRef: RefObject<HTMLSpanElement | null>;
  hoverLabelRef: RefObject<HTMLSpanElement | null>;
  clusterLabelRefs: RefObject<Map<string, HTMLButtonElement>>;
}) {
  const { camera, gl, size, invalidate } = useThree();
  const perspective = camera as THREE.PerspectiveCamera;

  const points = useMemo(() => {
    const m = new Map<string, LayoutPoint>(layout.points);
    for (const p of extra) m.set(p.id, p);
    return m;
  }, [layout, extra]);

  const meId = nodes.find((n) => n.isMe)?.userId;
  const nameById = useMemo(() => new Map(nodes.map((n) => [n.userId, n.name])), [nodes]);

  const t0 = useRef(performance.now());
  const now = () => (performance.now() - t0.current) / 1000;
  const births = useRef(new Map<string, number>());
  const known = useRef(new Set(layout.points.keys()));

  const overviewDist = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    const half = Math.atan(Math.tan(((FOV / 2) * Math.PI) / 180) * aspect);
    return (layout.radius * 1.05) / Math.tan(half);
  }, [layout.radius, size.width, size.height]);
  const minDist = 7;
  const maxDist = overviewDist * 1.35;

  const me = meId ? points.get(meId) : undefined;
  const cam = useRef<CamState>(
    initialPhase === "dark" ? { x: me?.x ?? 0, y: me?.y ?? 0, z: me?.z ?? 0, dist: 7 } : { x: 0, y: 0, z: 0, dist: overviewDist },
  );
  const tilt = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const tweens = useRef<Tween[]>([]);
  const dragging = useRef(false);

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
      const p = points.get(node.userId)!;
      pos.set([p.x, p.y, p.z], i * 3);
      c.set(getCluster(node.cluster).color);
      col.set([c.r, c.g, c.b], i * 3);
      sizeA[i] = node.isMe ? 3.4 : 2.1;
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
    g.setAttribute("aDim", new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
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
  const simToMe = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of edges) {
      if (e.source === meId) m.set(e.target, e.similarity);
      else if (e.target === meId) m.set(e.source, e.similarity);
    }
    return m;
  }, [edges, meId]);

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
    const inFocus = (id: string) => !focusCluster || clusterOf.get(id) === focusCluster;
    visibleEdges.forEach((e, i) => {
      const base = 0.04 + ((e.similarity - EDGE_MIN) / (1 - EDGE_MIN)) * 0.24;
      const mine = e.source === meId || e.target === meId;
      const touched = selectedId && (e.source === selectedId || e.target === selectedId);
      let a = touched ? 0.7 : selectedId ? base * 0.35 : mine ? base * 1.6 : base;
      if (!touched && focusCluster) a *= inFocus(e.source) && inFocus(e.target) ? 1.8 : 0.15;
      alpha.setX(i * 2, a);
      alpha.setX(i * 2 + 1, a);
    });
    alpha.needsUpdate = true;
    invalidate();
  }, [selectedId, focusCluster, nodeGeo, edgeGeo, ordered, visibleEdges, clusterOf, meId, invalidate]);

  // Nebulae: one soft cloud per cluster so the map reads before any star is tapped.
  const nebulaMap = useMemo(() => nebulaTexture(), []);
  const nebulae = useMemo(
    () =>
      centers.map((c) => {
        const m = new THREE.SpriteMaterial({ map: nebulaMap, color: getCluster(c.id).color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
        const sp = new THREE.Sprite(m);
        sp.position.set(c.x, c.y, c.z - 2);
        sp.scale.setScalar(c.spread * 4.2 + 6);
        return { id: c.id, sprite: sp };
      }),
    [centers, nebulaMap],
  );
  useEffect(() => () => nebulae.forEach((n) => n.sprite.material.dispose()), [nebulae]);

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
    const b = selectedId && selectedId !== meId ? points.get(selectedId) : undefined;
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

  const stars = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(1500 * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1500; i++) pos.set([(r() - 0.5) * 420, (r() - 0.5) * 420, -60 - r() * 220], i * 3);
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
    const to = ordered.map((n) => (!focusCluster || n.cluster === focusCluster || n.isMe || n.userId === selectedId ? 1 : 0));
    tween("dim", 600, (e) => {
      to.forEach((v, i) => attr.setX(i, lerp(from[i] ?? 1, v, e)));
      attr.needsUpdate = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tween is stable in behavior
  }, [focusCluster, selectedId, nodeGeo, ordered]);

  const moveCamera = (to: CamState, dur: number) => {
    const from = { ...cam.current };
    return tween("camera", dur, (e) => {
      cam.current = { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e), z: lerp(from.z, to.z, e), dist: lerp(from.dist, to.dist, e) };
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

  const api = useRef<GalaxyApi>(null!);
  api.current = {
    igniteMe: async (duration = 1800) => {
      await Promise.all([
        fadeUniform(nodeMat.uniforms.uMe, 1, duration, "me"),
        moveCamera({ x: me?.x ?? 0, y: me?.y ?? 0, z: me?.z ?? 0, dist: 11 }, duration * 1.2),
      ]);
    },
    pullBackToOverview: async (duration = 2800) => {
      nodeMat.uniforms.uMe.value = 1;
      await Promise.all([
        moveCamera({ x: 0, y: 0, z: 0, dist: overviewDist }, duration),
        fadeUniform(nodeMat.uniforms.uOthers, 1, duration * 0.85, "others"),
        fadeUniform(edgeMat.uniforms.uOpacity, 1, duration, "edges"),
      ]);
    },
    flyTo: async (userId, opts) => {
      const p = points.get(userId);
      if (!p) return;
      const dist = opts?.distance ?? Math.min(cam.current.dist, 18);
      const lift = (opts?.lift ?? 0) * 2 * dist * Math.tan(((FOV / 2) * Math.PI) / 180);
      await moveCamera({ x: p.x, y: p.y - lift, z: p.z, dist }, opts?.duration ?? 600);
    },
    recenter: () => moveCamera({ x: 0, y: 0, z: 0, dist: overviewDist }, 700),
    flyToCluster: async (cluster) => {
      const c = cluster ? centers.find((k) => k.id === cluster) : undefined;
      if (!c) return moveCamera({ x: 0, y: 0, z: 0, dist: overviewDist }, 900);
      // Fit the whole cluster with room for the UI above and below it.
      const fit = (c.extent * 1.6) / Math.tan(((FOV / 2) * Math.PI) / 180);
      await moveCamera({ x: c.x, y: c.y - c.extent * 0.1, z: c.z, dist: clamp(fit, 18, overviewDist * 0.9) }, 1000);
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
    };
    onReady?.();
    return () => {
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once
  }, []);

  // Slow ambient drift and the pulse on my star; paused while the tab is hidden.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) invalidate();
    }, 1000 / 24);
    return () => clearInterval(id);
  }, [invalidate]);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;
    el.style.touchAction = "none";
    const pointers = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; t: number; moved: number } | null = null;
    let pinch = 0;

    const worldPerPixel = () => (2 * cam.current.dist * Math.tan(((FOV / 2) * Math.PI) / 180)) / el.clientHeight;

    const pick = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const v = new THREE.Vector3();
      let best: string | null = null;
      let bestD = 40;
      for (const [id, p] of points) {
        if (id !== meId && nodeMat.uniforms.uOthers.value < 0.5) continue;
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

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      dragging.current = true;
      tweens.current = tweens.current.filter((t) => (t.group === "camera" ? (t.resolve(), false) : true));
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        // Desktop hover: preview a star's name and show it's clickable.
        if (e.pointerType !== "mouse") return;
        const hit = pick(e.clientX, e.clientY);
        el.style.cursor = hit ? "pointer" : "grab";
        if (hit !== hovered.current) {
          hovered.current = hit;
          applyHighlightRef.current();
        }
        return;
      }
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) cam.current.dist = clamp((cam.current.dist * pinch) / d, minDist, maxDist);
        pinch = d;
        if (down) down.moved = 99;
      } else {
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        if (down) down.moved += Math.abs(dx) + Math.abs(dy);
        const wpp = worldPerPixel();
        cam.current.x = clamp(cam.current.x - dx * wpp, -layout.radius * 1.3, layout.radius * 1.3);
        cam.current.y = clamp(cam.current.y + dy * wpp, -layout.radius * 1.3, layout.radius * 1.3);
        tilt.current.ty = clamp(tilt.current.ty - dx * 0.006, -0.22, 0.22);
        tilt.current.tx = clamp(tilt.current.tx + dy * 0.006, -0.22, 0.22);
      }
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (pointers.size === 0) {
        dragging.current = false;
        if (down && down.moved < 8 && performance.now() - down.t < 450) {
          const hit = pick(e.clientX, e.clientY);
          if (hit) api.current.flyTo(hit, { lift: hit === meId ? 0 : 0.1 }).then(() => onSelectRef.current?.(hit));
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
  }, [interactive, gl, camera, points, meId, nodeMat, layout.radius, minDist, maxDist, invalidate]);

  // "You" appears once your star has ignited; checked per frame so no React state is involved.
  const labelsOn = useRef(initialPhase !== "dark");
  const labelPos = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => invalidate(), [selectedId, invalidate]);

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

    const tl = tilt.current;
    if (!dragging.current) {
      tl.tx *= 0.9;
      tl.ty *= 0.9;
    }
    tl.x += (tl.tx - tl.x) * 0.12;
    tl.y += (tl.ty - tl.y) * 0.12;
    if (Math.abs(tl.x) + Math.abs(tl.y) + Math.abs(tl.tx) + Math.abs(tl.ty) > 0.0005) active = true;

    const c = cam.current;
    euler.set(tl.x, tl.y, 0);
    offset.set(0, 0, c.dist).applyEuler(euler);
    camera.position.set(c.x + offset.x, c.y + offset.y, c.z + offset.z);
    camera.lookAt(c.x, c.y, c.z);

    const time = now();
    if (!labelsOn.current && nodeMat.uniforms.uMe.value > 0.9) labelsOn.current = true;
    nodeMat.uniforms.uTime.value = time;
    nodeMat.uniforms.uScale.value = size.height / (2 * Math.tan(((perspective.fov / 2) * Math.PI) / 180));
    nodeMat.uniforms.uPixelRatio.value = gl.getPixelRatio();

    if (starGroup.current) {
      starGroup.current.position.set(c.x * 0.7, c.y * 0.7, 0);
      starGroup.current.rotation.z = time * 0.004;
    }
    bondMat.uniforms.uTime.value = time;
    const others = nodeMat.uniforms.uOthers.value;
    for (const { id, sprite } of nebulae) {
      const focus = !focusCluster ? 1 : id === focusCluster ? 1.5 : 0.25;
      sprite.material.opacity = 0.2 * others * focus;
    }
    // Cluster names read at overview distance and fade as you fly in among the stars.
    const zoomFade = clamp((c.dist - 16) / 14, 0, 1) * clamp((others - 0.5) * 2, 0, 1);
    layoutClusterLabels(
      centers.map((k) => ({
        el: clusterLabelRefs.current.get(k.id) ?? null,
        at: labelPos.set(k.x, k.y + k.spread + 2.4, k.z).project(camera).clone(),
        opacity: zoomFade * (!focusCluster || focusCluster === k.id ? 1 : 0),
      })),
      size.width,
      size.height,
    );
    const hov = hovered.current && hovered.current !== selectedId && hovered.current !== meId ? points.get(hovered.current) : undefined;
    placeLabel(hoverLabelRef.current, hov ? labelPos.set(hov.x, hov.y - 1.4, hov.z) : null, camera, size.width, size.height, hov ? (nameById.get(hov.id) ?? "") : undefined);

    const meLabel = labelsOn.current && me ? labelPos.set(me.x, me.y - 1.6, me.z) : null;
    placeLabel(meLabelRef.current, meLabel, camera, size.width, size.height);
    const sel = selectedId && selectedId !== meId ? points.get(selectedId) : undefined;
    placeLabel(
      selectedLabelRef.current,
      sel ? labelPos.set(sel.x, sel.y - 1.4, sel.z) : null,
      camera,
      size.width,
      size.height,
      sel ? `${nameById.get(selectedId!) ?? ""}${simToMe.has(selectedId!) ? ` · ${Math.round(simToMe.get(selectedId!)! * 100)}% same why` : ""}` : undefined,
    );

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
      <lineSegments geometry={edgeGeo} material={edgeMat} />
      {bond ? <primitive object={bond} /> : null}
      <points geometry={nodeGeo} material={nodeMat} />
    </>
  );
}

export default function GalaxyScene(props: GalaxyViewProps) {
  const meLabelRef = useRef<HTMLSpanElement>(null);
  const selectedLabelRef = useRef<HTMLSpanElement>(null);
  const hoverLabelRef = useRef<HTMLSpanElement>(null);
  const clusterLabelRefs = useRef(new Map<string, HTMLButtonElement>());
  const clusters = [...new Set(props.nodes.filter((n) => !n.isMe).map((n) => n.cluster))];
  const { interactive = true, onFocusCluster, focusCluster } = props;

  return (
    <>
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ fov: FOV, near: 0.1, far: 800, position: [0, 0, 60] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        className="!absolute inset-0"
        aria-hidden
      >
        <Scene {...props} meLabelRef={meLabelRef} selectedLabelRef={selectedLabelRef} hoverLabelRef={hoverLabelRef} clusterLabelRefs={clusterLabelRefs} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {clusters.map((id) => {
          const c = getCluster(id);
          return (
            <button
              key={id}
              type="button"
              tabIndex={-1}
              ref={(el) => {
                if (el) clusterLabelRefs.current.set(id, el);
                else clusterLabelRefs.current.delete(id);
              }}
              onClick={() => onFocusCluster?.(focusCluster === id ? null : id)}
              className={cn(
                "invisible absolute left-0 top-0 whitespace-nowrap rounded-full px-2 py-1 font-serif text-[13px] italic opacity-0",
                interactive && onFocusCluster && "pointer-events-auto hover:bg-white/5",
              )}
              style={{ color: c.color, textShadow: `0 0 12px ${c.color}66` }}
            >
              {c.label}
            </button>
          );
        })}
        <span ref={meLabelRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap text-xs font-semibold tracking-wide text-primary opacity-0">
          You
        </span>
        <span
          ref={selectedLabelRef}
          aria-hidden
          className="invisible absolute left-0 top-0 whitespace-nowrap rounded-full bg-background/70 px-2 py-0.5 text-xs font-semibold text-foreground opacity-0 backdrop-blur-sm"
        />
        <span ref={hoverLabelRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap text-xs font-medium text-foreground/80 opacity-0" />
      </div>
    </>
  );
}
