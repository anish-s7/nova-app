"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { animate } from "animejs";
import { starColor } from "@/components/reading-sequence";
import type { Song } from "@/lib/types";

const GOLD = "#f3c98b";
const LINK_COLOR = "#8f8ad8";
const BG = "#0b0918";
const LINK_SEGMENTS = 20;

/** A winding top-to-bottom path through 3D space, so the shape reads as a constellation seen at an angle. */
function layout3D(n: number): THREE.Vector3[] {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return new THREE.Vector3(
      Math.sin(i * 1.9 + 0.6) * 1.55 + Math.cos(i * 4.3) * 0.2,
      2.1 - t * 4.2 + Math.sin(i * 3.1) * 0.3,
      Math.sin(i * 2.35 + 1.1) * 1.3,
    );
  });
}

/** Soft round glow, tinted by sprite color. Doubles as star, halo, comet, and core. */
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.4)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** A song title baked into a billboard sprite so it always faces the camera. */
function textSprite(text: string) {
  const px = 44;
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  g.font = `italic ${px}px Georgia, serif`;
  c.width = Math.ceil(g.measureText(text).width) + 16;
  c.height = Math.ceil(px * 1.5);
  g.font = `italic ${px}px Georgia, serif`;
  g.textBaseline = "middle";
  g.fillStyle = "rgba(236, 234, 250, 0.92)";
  g.fillText(text, 8, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 });
  const sp = new THREE.Sprite(mat);
  const h = 0.34;
  sp.scale.set((h * c.width) / c.height, h, 1);
  return sp;
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export type ReadingConstellationSceneProps = {
  songs: Song[];
  /** -1 covers only, 0..n-1 highlight index, >= highlightCount converge. */
  step: number;
  highlightCount: number;
  converging: boolean;
};

type Anim = ReturnType<typeof animate>;

function Scene({ songs, step, highlightCount, converging }: ReadingConstellationSceneProps) {
  const { invalidate } = useThree();
  const positions = useMemo(() => layout3D(songs.length), [songs.length]);
  // Keyed on which songs these are, not the array: the parent passes a fresh array on every render
  // (e.g. each time a song finishes saving mid-animation). Keying on the array rebuilt every star and
  // label sprite at opacity 0, and the once-only kindle animation below never reached the new ones,
  // so the stars and titles vanished while the reading was still in progress.
  const songKey = songs.map((s) => `${s.id}\u0000${s.title}`).join("\u0001");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- songKey captures everything read from songs
  const colors = useMemo(() => songs.map(starColor), [songKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- songKey captures everything read from songs
  const names = useMemo(() => songs.map((s) => (s.title.length > 24 ? `${s.title.slice(0, 23)}…` : s.title)), [songKey]);
  const glow = useMemo(() => glowTexture(), []);
  useEffect(() => () => glow.dispose(), [glow]);

  const stars = useMemo(
    () =>
      positions.map((p, i) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: colors[i], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        sp.position.copy(p);
        sp.scale.setScalar(0.32);
        return sp;
      }),
    [positions, colors, glow],
  );
  useEffect(() => () => stars.forEach((s) => s.material.dispose()), [stars]);

  const halos = useMemo(
    () =>
      positions.map((p, i) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: colors[i], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        sp.position.copy(p);
        sp.scale.setScalar(0.6);
        return sp;
      }),
    [positions, colors, glow],
  );
  useEffect(() => () => halos.forEach((h) => h.material.dispose()), [halos]);

  const nameSprites = useMemo(
    () =>
      names.map((n, i) => {
        const sp = textSprite(n);
        sp.position.set(positions[i].x, positions[i].y - 0.36, positions[i].z);
        return sp;
      }),
    [names, positions],
  );
  useEffect(
    () => () =>
      nameSprites.forEach((n) => {
        n.material.map?.dispose();
        n.material.dispose();
      }),
    [nameSprites],
  );

  const links = useMemo(
    () =>
      positions.slice(1).map((p, i) => {
        const a = positions[i];
        const pts = Array.from({ length: LINK_SEGMENTS + 1 }, (_, k) => a.clone().lerp(p, k / LINK_SEGMENTS));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        geo.setDrawRange(0, 0);
        const mat = new THREE.LineBasicMaterial({ color: LINK_COLOR, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        return { geo, mat, line: new THREE.Line(geo, mat) };
      }),
    [positions],
  );
  useEffect(
    () => () =>
      links.forEach((l) => {
        l.geo.dispose();
        l.mat.dispose();
      }),
    [links],
  );

  const curve = useMemo(() => (positions.length > 1 ? new THREE.CatmullRomCurve3(positions, false, "catmullrom", 0.5) : null), [positions]);

  const comet = useMemo(() => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: GOLD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    sp.scale.setScalar(0.26);
    return sp;
  }, [glow]);
  useEffect(() => () => comet.material.dispose(), [comet]);

  const core = useMemo(() => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: GOLD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    sp.scale.setScalar(0.6);
    return sp;
  }, [glow]);
  useEffect(() => () => core.material.dispose(), [core]);

  const rings = useMemo(
    () =>
      [0, 1].map(() => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: GOLD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        sp.scale.setScalar(0.4);
        return sp;
      }),
    [glow],
  );
  useEffect(() => () => rings.forEach((r) => r.material.dispose()), [rings]);

  // Ambient sky + kindle + comet pass. Runs once, independent of the highlight/converge state.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !positions.length) return;
    started.current = true;
    const anims: Anim[] = [];

    if (reduced()) {
      stars.forEach((s) => {
        s.scale.setScalar(1);
        s.material.opacity = 1;
      });
      halos.forEach((h) => {
        h.scale.setScalar(1);
        h.material.opacity = 0.55;
      });
      nameSprites.forEach((n) => (n.material.opacity = 1));
      links.forEach((l) => {
        l.mat.opacity = 0.5;
        l.geo.setDrawRange(0, LINK_SEGMENTS + 1);
      });
      invalidate();
      return;
    }

    stars.forEach((s, i) =>
      anims.push(
        animate(s.scale, { x: [0, 1], y: [0, 1], z: [0, 1], duration: 900, delay: 200 + i * 140, ease: "outElastic(1, .6)", onUpdate: () => invalidate() }),
        animate(s.material, { opacity: [0, 1], duration: 900, delay: 200 + i * 140, onUpdate: () => invalidate() }),
      ),
    );
    halos.forEach((h, i) =>
      anims.push(
        animate(h.scale, { x: [0.4, 1], y: [0.4, 1], z: [0.4, 1], duration: 1200, delay: 200 + i * 140, onUpdate: () => invalidate() }),
        animate(h.material, { opacity: [0, 0.55], duration: 1200, delay: 200 + i * 140, onUpdate: () => invalidate() }),
      ),
    );

    const stop = 1100;
    const t0 = 1400;
    if (curve && stars.length > 1) {
      comet.material.opacity = 0;
      anims.push(animate(comet.material, { opacity: [0, 1], duration: 400, delay: t0 - 100, onUpdate: () => invalidate() }));
      const prog = { t: 0 };
      anims.push(
        animate(prog, {
          t: 1,
          duration: stop * (stars.length - 1),
          delay: t0,
          ease: "inOutSine",
          onUpdate: () => {
            curve.getPointAt(Math.min(1, Math.max(0, prog.t)), comet.position);
            invalidate();
          },
          onComplete: () => anims.push(animate(comet.material, { opacity: 0, duration: 500, onUpdate: () => invalidate() })),
        }),
      );
    }

    if (nameSprites[0]) anims.push(animate(nameSprites[0].material, { opacity: [0, 1], duration: 700, delay: t0 + 100, onUpdate: () => invalidate() }));

    for (let b = 1; b < stars.length; b++) {
      const at = t0 + stop * b * 0.92;
      const link = links[b - 1];
      if (link) {
        link.mat.opacity = 0.75;
        const draw = { n: 0 };
        anims.push(
          animate(draw, {
            n: LINK_SEGMENTS + 1,
            duration: 900,
            delay: Math.max(0, at - 700),
            ease: "inOutQuad",
            onUpdate: () => {
              link.geo.setDrawRange(0, Math.round(draw.n));
              invalidate();
            },
          }),
        );
      }
      anims.push(animate(stars[b].scale, { x: [1, 1.5, 1], y: [1, 1.5, 1], z: [1, 1.5, 1], duration: 700, delay: at, ease: "outBack", onUpdate: () => invalidate() }));
      if (nameSprites[b]) anims.push(animate(nameSprites[b].material, { opacity: [0, 1], duration: 700, delay: at + 100, onUpdate: () => invalidate() }));
    }

    return () => anims.forEach((a) => a.pause());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount, driven by the memoized objects above
  }, [positions.length, curve, invalidate]);

  // Each highlight flares its link gold and pulses the two stars' halos.
  useEffect(() => {
    if (step < 0 || step >= highlightCount || reduced() || !links.length) return;
    const li = step % links.length;
    const link = links[li];
    const flareHalos = [halos[li], halos[li + 1]].filter((h): h is THREE.Sprite => !!h);
    const anims: Anim[] = [];
    const from = new THREE.Color(LINK_COLOR);
    const to = new THREE.Color(GOLD);
    anims.push(animate(link.mat.color, { r: [from.r, to.r], g: [from.g, to.g], b: [from.b, to.b], duration: 700, alternate: true, loop: 2, onUpdate: () => invalidate() }));
    flareHalos.forEach((h) => {
      anims.push(animate(h.scale, { x: [1, 1.7, 1], y: [1, 1.7, 1], z: [1, 1.7, 1], duration: 1400, ease: "outExpo", onUpdate: () => invalidate() }));
      anims.push(animate(h.material, { opacity: [0.55, 1, 0.55], duration: 1400, ease: "outExpo", onUpdate: () => invalidate() }));
    });
    return () => anims.forEach((a) => a.pause());
  }, [step, highlightCount, links, halos, invalidate]);

  // Converge: every star slides into the origin and blooms into one point of light.
  useEffect(() => {
    if (!converging || reduced()) return;
    const anims: Anim[] = [];
    nameSprites.forEach((n) => anims.push(animate(n.material, { opacity: 0, duration: 500, onUpdate: () => invalidate() })));
    links.forEach((l) => anims.push(animate(l.mat, { opacity: 0, duration: 900, onUpdate: () => invalidate() })));

    [...stars, ...halos].forEach((o, i) => {
      const k = i % positions.length;
      anims.push(animate(o.position, { x: 0, y: 0, z: 0, duration: 1500, delay: k * 40, ease: "inOutCubic", onUpdate: () => invalidate() }));
      anims.push(animate(o.material, { opacity: 0, duration: 1500, delay: k * 40, ease: "inOutCubic", onUpdate: () => invalidate() }));
      if (i < stars.length) anims.push(animate(o.scale, { x: 0.2, y: 0.2, z: 0.2, duration: 1500, delay: k * 40, ease: "inOutCubic", onUpdate: () => invalidate() }));
    });

    core.material.opacity = 0;
    core.scale.setScalar(0);
    anims.push(
      animate(core.scale, { x: 1, y: 1, z: 1, duration: 1400, delay: 1000, ease: "outExpo", onUpdate: () => invalidate() }),
      animate(core.material, { opacity: [0, 1], duration: 1400, delay: 1000, ease: "outExpo", onUpdate: () => invalidate() }),
    );
    rings.forEach((r, i) => {
      r.scale.setScalar(0.4);
      r.material.opacity = 0.7;
      anims.push(
        animate(r.scale, { x: 5, y: 5, z: 5, duration: 1600, delay: 1200 + i * 220, ease: "outQuart", onUpdate: () => invalidate() }),
        animate(r.material, { opacity: [0.7, 0], duration: 1600, delay: 1200 + i * 220, ease: "outQuart", onUpdate: () => invalidate() }),
      );
    });

    return () => anims.forEach((a) => a.pause());
  }, [converging, positions.length, stars, halos, nameSprites, links, core, rings, invalidate]);

  return (
    <>
      <color attach="background" args={[BG]} />
      <group rotation={[0.08, 0, 0]}>
        {halos.map((h, i) => (
          <primitive key={`halo-${songs[i].id}`} object={h} />
        ))}
        {stars.map((s, i) => (
          <primitive key={`star-${songs[i].id}`} object={s} />
        ))}
        {nameSprites.map((n, i) => (
          <primitive key={`name-${songs[i].id}`} object={n} />
        ))}
        {links.map((l, i) => (
          <primitive key={`link-${i}`} object={l.line} />
        ))}
        <primitive object={comet} />
        <primitive object={core} />
        {rings.map((r, i) => (
          <primitive key={`ring-${i}`} object={r} />
        ))}
      </group>
    </>
  );
}

export default function ReadingConstellationScene(props: ReadingConstellationSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="always"
      camera={{ fov: 42, near: 0.1, far: 60, position: [0, 0, 8.5] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      className="!absolute inset-0"
      aria-hidden
    >
      <SlowSpin>
        <Scene {...props} />
      </SlowSpin>
    </Canvas>
  );
}

/** Gently turns its children around Y so the constellation's depth reads, pausing while reduced motion is set. */
function SlowSpin({ children }: { children: React.ReactNode }) {
  const groupRef = useMemo(() => ({ current: null as THREE.Group | null }), []);
  useFrame((_, delta) => {
    if (!groupRef.current || reduced()) return;
    groupRef.current.rotation.y += delta * 0.06;
  });
  return (
    <group ref={(el) => (groupRef.current = el)}>
      <ambientLight intensity={0.6} />
      {children}
    </group>
  );
}
