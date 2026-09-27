import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The link-preview share card (app/opengraph-image.tsx, app/twitter-image.tsx): the logo mark on
 * the app's own dark background, nothing else. Rendered by Satori (next/og's ImageResponse), which
 * only supports a limited CSS color subset — plain hex, not the oklch() tokens in globals.css — so
 * the colors here are hand-matched approximations of --background/--foreground, not references.
 */

export const OG_SIZE = { width: 1200, height: 630 };

/** A few faint fixed points, echoing the app's starfield without trying to reproduce it exactly. */
const STARS: [number, number, number][] = [
  [8, 14, 3],
  [92, 20, 2],
  [16, 84, 2],
  [86, 78, 3],
  [50, 10, 2],
  [72, 42, 2],
  [26, 46, 2],
  [95, 58, 2],
];

export function renderOgImage() {
  const logo = readFileSync(join(process.cwd(), "public/nova-logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#15142a",
        position: "relative",
      }}
    >
      {STARS.map(([x, y, s], i) => (
        <div
          key={i}
          style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: s, height: s, borderRadius: 999, background: "rgba(240,239,244,0.55)" }}
        />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders its own <img>, not the DOM's */}
      <img src={logoSrc} width={190} height={136} />
      <div style={{ display: "flex", fontSize: 108, fontWeight: 600, color: "#F0EFF4", letterSpacing: -3, marginTop: 12 }}>Nova</div>
    </div>
  );
}
