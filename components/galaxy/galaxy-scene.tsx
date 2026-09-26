"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { getCluster } from "@/lib/clusters";
import type { LayoutPoint } from "@/lib/galaxy-layout";
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
  uniform float uTime;
  uniform float uOthers;
  uniform float uMe;
  uniform float uScale;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float birth = aBirth < 0.0 ? 1.0 : smoothstep(0.0, 1.8, uTime - aBirth);
    float pulse = aIsMe * 0.14 * sin(uTime * 1.7);
    float vis = mix(uOthers, uMe, aIsMe) * birth;
    float size = aSize * (1.0 + pulse + aHighlight * 0.45) * (0.3 + 0.7 * birth);
    gl_PointSize = max(size * uScale / -mv.z, 7.0 * vis) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
    vColor = color;
    vAlpha = vis * (0.75 + aHighlight * 0.25 + aIsMe * 0.25);
  }
`;

const nodeFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.26, 0.0, d);
    float halo = pow(1.0 - d, 2.6) * 0.6;
    vec3 c = vColor * (halo + core * 0.9) + vec3(core * 0.55);
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

type CamState = { x: number; y: number; z: number; dist: number };
type Tween = { start: number; dur: number; group: string; update: (e: number) => void; resolve: () => void };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function Scene({ nodes, edges, layout, extra, selectedId, onSelect, apiRef, initialPhase = "explore", interactive = true, onReady }: GalaxyViewProps) {
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
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now() reads a ref
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

  useEffect(() => {
    const hl = nodeGeo.getAttribute("aHighlight") as THREE.BufferAttribute;
    ordered.forEach((n, i) => hl.setX(i, n.userId === selectedId ? 1 : 0));
    hl.needsUpdate = true;
    const alpha = edgeGeo.getAttribute("aAlpha") as THREE.BufferAttribute;
    visibleEdges.forEach((e, i) => {
      const base = 0.05 + ((e.similarity - EDGE_MIN) / (1 - EDGE_MIN)) * 0.28;
      const touched = selectedId && (e.source === selectedId || e.target === selectedId);
      const a = touched ? 0.75 : selectedId ? base * 0.5 : base;
      alpha.setX(i * 2, a);
      alpha.setX(i * 2 + 1, a);
    });
    alpha.needsUpdate = true;
    invalidate();
  }, [selectedId, nodeGeo, edgeGeo, ordered, visibleEdges, invalidate]);

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
      await moveCamera({ x: p.x, y: p.y, z: p.z, dist: opts?.distance ?? Math.min(cam.current.dist, 18) }, opts?.duration ?? 600);
    },
    recenter: () => moveCamera({ x: 0, y: 0, z: 0, dist: overviewDist }, 700),
  };

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      igniteMe: (d) => api.current.igniteMe(d),
      pullBackToOverview: (d) => api.current.pullBackToOverview(d),
      flyTo: (id, o) => api.current.flyTo(id, o),
      recenter: () => api.current.recenter(),
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
      let bestD = 34;
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
      if (!prev) return;
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
          if (hit) api.current.flyTo(hit).then(() => onSelectRef.current?.(hit));
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

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [interactive, gl, camera, points, meId, nodeMat, layout.radius, minDist, maxDist, invalidate]);

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
    nodeMat.uniforms.uTime.value = time;
    nodeMat.uniforms.uScale.value = size.height / (2 * Math.tan(((perspective.fov / 2) * Math.PI) / 180));
    nodeMat.uniforms.uPixelRatio.value = gl.getPixelRatio();

    if (starGroup.current) {
      starGroup.current.position.set(c.x * 0.7, c.y * 0.7, 0);
      starGroup.current.rotation.z = time * 0.004;
    }
    if (active) invalidate();
  });

  const [labelsOn, setLabelsOn] = useState(initialPhase !== "dark");
  useEffect(() => {
    if (labelsOn) return;
    const id = setInterval(() => nodeMat.uniforms.uMe.value > 0.9 && setLabelsOn(true), 200);
    return () => clearInterval(id);
  }, [labelsOn, nodeMat]);

  const selected = selectedId ? points.get(selectedId) : undefined;

  return (
    <>
      <color attach="background" args={[BG]} />
      <group ref={starGroup}>
        <points geometry={stars}>
          <pointsMaterial size={1.4} sizeAttenuation={false} color="#c9cbef" transparent opacity={0.5} depthWrite={false} />
        </points>
      </group>
      <lineSegments geometry={edgeGeo} material={edgeMat} />
      <points geometry={nodeGeo} material={nodeMat} />
      {labelsOn && me ? (
        <Html position={[me.x, me.y - 1.6, me.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <span className="whitespace-nowrap text-xs font-semibold tracking-wide text-primary">You</span>
        </Html>
      ) : null}
      {selected && selectedId !== meId ? (
        <Html position={[selected.x, selected.y - 1.4, selected.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <span className="whitespace-nowrap text-xs font-semibold text-foreground">{nameById.get(selectedId!)}</span>
        </Html>
      ) : null}
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
