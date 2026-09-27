"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import { useAvatar } from "@/lib/avatar-store";
import { getCluster } from "@/lib/clusters";
import { useSession, type AvatarConfig } from "@/lib/session";
import { cn } from "@/lib/utils";

export const AVATAR_BACKGROUNDS = [
  "#252438", // Deep Indigo
  "#1e293b", // Slate
  "#1c3328", // Deep Forest
  "#3b2622", // Warm Cocoa
  "#2e1f3b", // Dark Purple
  "#1e3246", // Dark Blue
  "#2d3748", // Charcoal
  "#18181b", // Obsidian
];

export const AVATAR_SKIN_TONES = [
  "#f8d5b8", // Lightest
  "#f1c9a5", // Peach light
  "#e0a97f", // Soft Peach
  "#c68a5e", // Medium Olive
  "#a06a44", // Tan
  "#7a4b2e", // Deep Chestnut
  "#5a3520", // Espresso
  "#3b2112", // Dark Espresso
];

export const AVATAR_HAIR_COLORS = [
  "#1f1a17", // Black
  "#3a2a1e", // Dark Brown
  "#5b3a22", // Medium Brown
  "#8a5a2b", // Light Brown
  "#c9a15a", // Golden Blonde
  "#8c8c94", // Silver Gray
  "#7a2f2f", // Auburn Red
  "#2e3a5c", // Midnight Blue
  "#d67b93", // Soft Pink
  "#957bd6", // Lavender Purple
  "#2f7a5b", // Emerald Green
];

export const AVATAR_SHIRT_COLORS = [
  "#d8c7a3", // Cream
  "#c7d1cf", // Mint / Sage
  "#d9b8b0", // Soft Rose
  "#bfc8a6", // Muted Green
  "#c4b9d6", // Lavender
  "#e0d2b4", // Sand
  "#7f9bb5", // Slate Blue
  "#b5787f", // Terracotta
  "#4a2e4b", // Deep Plum
  "#2a4b4e", // Dark Teal
];

export type HairCategory = "all" | "short" | "long" | "hats";

export type HairStyleItem = {
  id: string;
  label: string;
  category: "short" | "long" | "hats";
};

export const HAIR_STYLES: HairStyleItem[] = [
  // Short styles
  { id: "short", label: "Short Crop", category: "short" },
  { id: "side-part", label: "Side Part", category: "short" },
  { id: "buzzed", label: "Buzzed", category: "short" },
  { id: "spiky", label: "Spiky", category: "short" },
  { id: "waves", label: "360 Waves", category: "short" },
  { id: "fade", label: "Fade Cut", category: "short" },
  { id: "bald", label: "Clean Bald", category: "short" },

  // Long & Updo styles
  { id: "long", label: "Long Waves", category: "long" },
  { id: "bun", label: "Top Bun", category: "long" },
  { id: "ponytail", label: "Ponytail", category: "long" },
  { id: "curly", label: "Curly Afro", category: "long" },
  { id: "dreads", label: "Dreads & Locs", category: "long" },
  { id: "braids", label: "Box Braids", category: "long" },

  // Hats & Headwear
  { id: "beanie", label: "Knit Beanie", category: "hats" },
  { id: "cap", label: "Baseball Cap", category: "hats" },
];

export const SHIRT_STYLES = [
  { id: "crewneck", label: "Crewneck" },
  { id: "hoodie", label: "Hoodie" },
  { id: "vneck", label: "V-Neck" },
  { id: "collared", label: "Collared" },
  { id: "tank", label: "Tank top" },
] as const;

export const FACIAL_HAIR_OPTIONS = [
  { id: "none", label: "None" },
  { id: "stubble", label: "Stubble" },
  { id: "beard", label: "Full beard" },
  { id: "mustache", label: "Mustache" },
  { id: "goatee", label: "Goatee" },
] as const;

export const EYEWEAR_OPTIONS = [
  { id: "none", label: "None" },
  { id: "round-glasses", label: "Round glasses" },
  { id: "square-glasses", label: "Square glasses" },
  { id: "sunglasses", label: "Sunglasses" },
  { id: "headphones", label: "Headphones" },
  { id: "earrings", label: "Earrings" },
] as const;

export const EXPRESSION_OPTIONS = [
  { id: "smile", label: "Smile" },
  { id: "neutral", label: "Neutral" },
  { id: "grin", label: "Grin" },
  { id: "smirk", label: "Smirk" },
  { id: "tongue", label: "Tongue out" },
  { id: "chill", label: "Chill" },
] as const;

export const EYE_STYLE_OPTIONS = [
  { id: "normal", label: "Normal" },
  { id: "happy", label: "Happy" },
  { id: "wide", label: "Wide" },
  { id: "wink", label: "Wink" },
  { id: "starry", label: "Starry" },
] as const;

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function getDefaultAvatarConfig(name: string): AvatarConfig {
  const h = hash(name || "You");
  const bg = AVATAR_BACKGROUNDS[h % AVATAR_BACKGROUNDS.length];
  const skin = AVATAR_SKIN_TONES[(h >>> 3) % AVATAR_SKIN_TONES.length];
  const hair = AVATAR_HAIR_COLORS[(h >>> 6) % AVATAR_HAIR_COLORS.length];
  const shirt = AVATAR_SHIRT_COLORS[(h >>> 9) % AVATAR_SHIRT_COLORS.length];
  const styleIdx = (h >>> 12) % 6;
  const hairStyle = HAIR_STYLES[styleIdx].id as AvatarConfig["hairStyle"];
  const glasses = (h >>> 16) % 4 === 0;
  const smileIdx = (h >>> 18) % 3;
  const expression = smileIdx === 0 ? "smile" : smileIdx === 1 ? "neutral" : "grin";

  return {
    hairStyle,
    hairColor: hair,
    skinColor: skin,
    shirtStyle: "crewneck",
    shirtColor: shirt,
    facialHair: "none",
    eyewear: glasses ? "round-glasses" : "none",
    expression,
    eyeStyle: "normal",
    background: bg,
  };
}

/** Hair drawn behind the head */
function renderHairBack(style: string, color: string) {
  if (style === "long") {
    return <path d="M9 30c-2-14 3-25 11-25s13 11 11 25c0 6-3 8-4 8H13c-1 0-4-2-4-8z" fill={color} />;
  }
  if (style === "bun") {
    return <circle cx="20" cy="4" r="4.5" fill={color} />;
  }
  if (style === "ponytail") {
    return <path d="M26 12c4 0 7 3 6 8-1 4-4 6-5 6-1 0 .5-3 0-6s-2-5-1-8z" fill={color} />;
  }
  if (style === "dreads" || style === "braids") {
    return (
      <g fill={color}>
        <rect x="7" y="14" width="3" height="18" rx="1.5" />
        <rect x="30" y="14" width="3" height="18" rx="1.5" />
      </g>
    );
  }
  return null;
}

/** Hair drawn on top of the head */
function renderHairFront(style: string, color: string) {
  switch (style) {
    case "short":
      return <path d="M12.5 15c-.5-6 3-9 7.5-9s8 3 7.5 9c-2-3-5-4-7.5-4s-5.5 1-7.5 4z" fill={color} />;
    case "side-part":
      return <path d="M12 16c-1-7 3-10 8.5-10 5 0 8.5 3 7.5 10-1-4-4-6-7-6-3.5 0-7 1-9 6z" fill={color} />;
    case "curly":
      return (
        <g fill={color}>
          {[12, 15.5, 20, 24.5, 28].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 9 : 10.5} r="4" />
          ))}
        </g>
      );
    case "long":
      return <path d="M11.5 18c0-8 3-11.5 8.5-11.5S28.5 10 28.5 18c-3-2-6-5-8.5-8-1.5 3.5-4.5 6.5-8.5 8z" fill={color} />;
    case "bun":
      return <path d="M12 16c0-6 3-9 8-9s8 3 8 9c-2-3-5-4-8-4s-6 1-8 4z" fill={color} />;
    case "buzzed":
      return <path d="M13 14.5c0-5 3-7.5 7-7.5s7 2.5 7 7.5c-2-2.5-4.5-3.5-7-3.5s-5 1-7 3.5z" fill={color} opacity="0.8" />;
    case "spiky":
      return <path d="M12 16l2-8 3 4 3-6 3 5 3-4 2 9c-2-3-5-4-8-4s-6 1-8 4z" fill={color} />;
    case "fade":
      return <path d="M14 14.5c0-4 2.5-6.5 6-6.5s6 2.5 6 6.5c-2-2-4-2.5-6-2.5s-4 .5-6 2.5z" fill={color} />;
    case "dreads":
      return (
        <g fill={color}>
          <path d="M12 15c0-5 3-7.5 8-7.5s8 2.5 8 7.5c-2-2.5-5-3.5-8-3.5s-6 1-8 3.5z" />
          <rect x="11" y="15" width="2.5" height="10" rx="1" />
          <rect x="26.5" y="15" width="2.5" height="10" rx="1" />
        </g>
      );
    case "braids":
      return (
        <g fill={color}>
          <path d="M12 15c0-5 3-7.5 8-7.5s8 2.5 8 7.5c-2-2.5-5-3.5-8-3.5s-6 1-8 3.5z" />
          <rect x="10" y="15" width="2" height="14" rx="1" />
          <rect x="14" y="15" width="2" height="14" rx="1" />
          <rect x="24" y="15" width="2" height="14" rx="1" />
          <rect x="28" y="15" width="2" height="14" rx="1" />
        </g>
      );
    case "ponytail":
      return <path d="M12 16c0-6 3-9 8-9s8 3 8 9c-2-3-5-4-8-4s-6 1-8 4z" fill={color} />;
    case "waves":
      return (
        <path
          d="M12 16c0-6 3.5-9.5 8-9.5s8 3.5 8 9.5c-2.5-4-5.5-3.5-8-5.5-2.5 2-5.5 1.5-8 5.5z"
          fill={color}
        />
      );
    case "beanie":
      return (
        <g>
          <path d="M11 16c0-7 3.5-11 9-11s9 4 9 11z" fill={color} />
          <rect x="10" y="14" width="20" height="3.5" rx="1" fill={color} style={{ filter: "brightness(1.2)" }} />
        </g>
      );
    case "cap":
      return (
        <g>
          <path d="M10 16c0-6 4.5-9.5 10-9.5s10 3.5 10 9.5z" fill={color} />
          <path d="M7 16c0 0 6-2 13-2s13 2 13 2v2H7z" fill={color} style={{ filter: "brightness(0.85)" }} />
          <circle cx="20" cy="6.5" r="1" fill={color} style={{ filter: "brightness(1.3)" }} />
        </g>
      );
    case "bald":
    default:
      return null;
  }
}

/** Shirt geometry based on style */
function renderShirt(style: string, shirtColor: string, skinColor: string) {
  switch (style) {
    case "hoodie":
      return (
        <g>
          <path d="M5 40c0-8 6-11.5 15-11.5S35 32 35 40z" fill={shirtColor} />
          <path d="M14 28.5c2 2 4 3 6 3s4-1 6-3" fill="none" stroke="#00000030" strokeWidth="1.2" />
          <line x1="18" y1="31" x2="18" y2="36" stroke="#ffffff70" strokeWidth="0.8" strokeLinecap="round" />
          <line x1="22" y1="31" x2="22" y2="36" stroke="#ffffff70" strokeWidth="0.8" strokeLinecap="round" />
        </g>
      );
    case "vneck":
      return (
        <g>
          <path d="M5 40c0-8 6-11.5 15-11.5S35 32 35 40z" fill={shirtColor} />
          <polygon points="17,28.5 23,28.5 20,33.5" fill={skinColor} />
        </g>
      );
    case "collared":
      return (
        <g>
          <path d="M5 40c0-8 6-11.5 15-11.5S35 32 35 40z" fill={shirtColor} />
          <polygon points="16.5,28.5 20,32.5 15,30.5" fill="#ffffffd0" />
          <polygon points="23.5,28.5 20,32.5 25,30.5" fill="#ffffffd0" />
        </g>
      );
    case "tank":
      return <path d="M8.5 40c0-7 3.5-11.5 11.5-11.5S31.5 33 31.5 40z" fill={shirtColor} />;
    case "crewneck":
    default:
      return <path d="M5 40c0-8 6-11.5 15-11.5S35 32 35 40z" fill={shirtColor} />;
  }
}

/** Facial hair overlays */
function renderFacialHair(facialHair: string, hairColor: string) {
  switch (facialHair) {
    case "stubble":
      return <path d="M16 23.5c1 1.5 2 2 4 2s3-.5 4-2c0 2-1.5 3.5-4 3.5s-4-1.5-4-3.5z" fill={hairColor} opacity="0.3" />;
    case "beard":
      return <path d="M13.5 19.5c0 4.5 2.5 7.5 6.5 7.5s6.5-3 6.5-7.5c0 0-2 1.2-6.5 1.2s-6.5-1.2-6.5-1.2z" fill={hairColor} />;
    case "mustache":
      return <path d="M16.5 22.2c1.2-.5 2.2 0 3.5 0s2.3-.5 3.5 0c.5.5-.8 1.4-3.5 1.4s-4-1-3.5-1.4z" fill={hairColor} />;
    case "goatee":
      return (
        <g fill={hairColor}>
          <path d="M16.5 22.2c1.2-.5 2.2 0 3.5 0s2.3-.5 3.5 0c.5.5-.8 1.4-3.5 1.4s-4-1-3.5-1.4z" />
          <rect x="18" y="24" width="4" height="3" rx="1" />
        </g>
      );
    case "none":
    default:
      return null;
  }
}

/** Eye style options */
function renderEyes(eyeStyle: string) {
  switch (eyeStyle) {
    case "happy":
      return (
        <g fill="none" stroke="#241c18" strokeWidth="0.9" strokeLinecap="round">
          <path d="M15.5 18q1.5-1.5 3 0" />
          <path d="M21.5 18q1.5-1.5 3 0" />
        </g>
      );
    case "wide":
      return (
        <g fill="#241c18">
          <circle cx="17" cy="18" r="1.3" />
          <circle cx="23" cy="18" r="1.3" />
          <circle cx="16.6" cy="17.6" r="0.4" fill="#ffffff" />
          <circle cx="22.6" cy="17.6" r="0.4" fill="#ffffff" />
        </g>
      );
    case "wink":
      return (
        <g>
          <circle cx="17" cy="18" r="0.9" fill="#241c18" />
          <path d="M21.5 18.5q1.5-1.5 3 0" fill="none" stroke="#241c18" strokeWidth="0.9" strokeLinecap="round" />
        </g>
      );
    case "starry":
      return (
        <g fill="#241c18">
          <path d="M17 16.5l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4z" />
          <path d="M23 16.5l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4z" />
        </g>
      );
    case "normal":
    default:
      return (
        <g fill="#241c18">
          <circle cx="17" cy="18" r="0.9" />
          <circle cx="23" cy="18" r="0.9" />
        </g>
      );
  }
}

/** Expression / mouth geometry */
function renderExpression(expression: string) {
  switch (expression) {
    case "neutral":
      return <path d="M18 22.8h4" fill="none" stroke="#241c18" strokeWidth="0.8" strokeLinecap="round" />;
    case "grin":
      return <path d="M17.5 22.3q2.5 3 5 0z" fill="#241c18" />;
    case "smirk":
      return <path d="M17.5 22.8q2.5 0 4.5-1.2" fill="none" stroke="#241c18" strokeWidth="0.8" strokeLinecap="round" />;
    case "tongue":
      return (
        <g>
          <path d="M17.5 22.3q2.5 3 5 0z" fill="#241c18" />
          <path d="M19 23.5c0 1 1 1.5 2 1.5s2-.5 2-1.5z" fill="#e86b7b" />
        </g>
      );
    case "chill":
      return <path d="M17.5 22.5q2.5 1 5 0" fill="none" stroke="#241c18" strokeWidth="0.8" strokeLinecap="round" />;
    case "smile":
    default:
      return <path d="M17.5 22.5q2.5 2 5 0" fill="none" stroke="#241c18" strokeWidth="0.8" strokeLinecap="round" />;
  }
}

/** Eyewear & accessories */
function renderEyewear(eyewear: string) {
  switch (eyewear) {
    case "round-glasses":
      return (
        <g fill="none" stroke="#241c18" strokeWidth="0.7">
          <circle cx="17" cy="18" r="2.5" />
          <circle cx="23" cy="18" r="2.5" />
          <path d="M19.5 18h1" />
        </g>
      );
    case "square-glasses":
      return (
        <g fill="none" stroke="#241c18" strokeWidth="0.7">
          <rect x="14.5" y="15.8" width="5" height="4.4" rx="1" />
          <rect x="20.5" y="15.8" width="5" height="4.4" rx="1" />
          <path d="M19.5 18h1" />
        </g>
      );
    case "sunglasses":
      return (
        <g fill="#241c18">
          <rect x="14" y="15.5" width="5.8" height="4.8" rx="1.2" />
          <rect x="20.2" y="15.5" width="5.8" height="4.8" rx="1.2" />
          <path d="M19.5 17h1" stroke="#241c18" strokeWidth="0.8" />
          <path d="M14.8 16.5l2 2" stroke="#ffffff50" strokeWidth="0.5" strokeLinecap="round" />
          <path d="M21 16.5l2 2" stroke="#ffffff50" strokeWidth="0.5" strokeLinecap="round" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M10 18c0-5.5 4.5-9.5 10-9.5s10 4 10 9.5" fill="none" stroke="#333a48" strokeWidth="1.6" />
          <rect x="9" y="15" width="3" height="7" rx="1.5" fill="#e86a5d" />
          <rect x="28" y="15" width="3" height="7" rx="1.5" fill="#e86a5d" />
        </g>
      );
    case "earrings":
      return (
        <g fill="none" stroke="#d4a359" strokeWidth="0.8">
          <circle cx="12.2" cy="20.5" r="1" />
          <circle cx="27.8" cy="20.5" r="1" />
        </g>
      );
    case "none":
    default:
      return null;
  }
}

/** Generative portrait SVG component supporting explicit config or name hash fallback */
export function Portrait({ name, config }: { name: string; config?: AvatarConfig }) {
  const merged = { ...getDefaultAvatarConfig(name), ...config };
  const shade = "#00000026";

  return (
    <svg viewBox="0 0 40 40" className="size-full">
      <rect width="40" height="40" fill={merged.background} />
      {renderHairBack(merged.hairStyle || "short", merged.hairColor || "#1f1a17")}
      {renderShirt(merged.shirtStyle || "crewneck", merged.shirtColor || "#d8c7a3", merged.skinColor || "#f1c9a5")}
      <rect x="17" y="23" width="6" height="7" rx="2" fill={merged.skinColor} />
      <rect x="17" y="23" width="6" height="3" fill={shade} />
      <ellipse cx="20" cy="18" rx="7.5" ry="8.5" fill={merged.skinColor} />
      <circle cx="12.6" cy="19" r="1.4" fill={merged.skinColor} />
      <circle cx="27.4" cy="19" r="1.4" fill={merged.skinColor} />
      {renderFacialHair(merged.facialHair || "none", merged.hairColor || "#1f1a17")}
      {renderHairFront(merged.hairStyle || "short", merged.hairColor || "#1f1a17")}
      {renderEyes(merged.eyeStyle || "normal")}
      {renderEyewear(merged.eyewear || "none")}
      {renderExpression(merged.expression || "smile")}
    </svg>
  );
}

export function FacePortrait({ face, name }: { face?: any; name?: string }) {
  return <Portrait name={name || "You"} />;
}

export function UserAvatar({
  name,
  cluster,
  userId,
  isMe = false,
  size = 44,
  ring = false,
  config,
  className,
}: {
  name: string;
  cluster: string;
  userId?: string;
  isMe?: boolean;
  size?: number;
  ring?: boolean;
  config?: AvatarConfig;
  className?: string;
}) {
  const session = useSession();
  const saved = useAvatar(isMe ? "me" : userId);
  const activeConfig = config ?? (isMe ? session.avatarConfig : undefined);
  const photo = activeConfig?.avatarUrl || saved?.photoUrl || undefined;

  if (photo) {
    return (
      <span
        style={{ "--tone": getCluster(cluster).color, width: size, height: size } as CSSProperties}
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold bg-muted relative",
          ring && "ring-2 ring-[color-mix(in_oklch,var(--tone)_60%,transparent)] ring-offset-2 ring-offset-background",
          className
        )}
      >
        <img src={photo ?? undefined} alt={name} className="size-full object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      style={{ "--tone": getCluster(cluster).color, width: size, height: size, fontSize: size * 0.3 } as CSSProperties}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        ring && "ring-2 ring-[color-mix(in_oklch,var(--tone)_60%,transparent)] ring-offset-2 ring-offset-background",
        className,
      )}
    >
      <Portrait name={name} config={activeConfig} />
    </span>
  );
}
