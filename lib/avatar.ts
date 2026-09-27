/**
 * The illustrated face behind every profile icon, shared by the renderer (components/user-avatar.tsx),
 * the editor (components/avatar-customizer-sheet.tsx) and the save route (app/api/avatar), which uses
 * sanitizeFace to accept only known options. Stored as profiles.avatar; null means "the face
 * generated from their name", which is what everyone had before faces were editable.
 */

export const FACE_BACKGROUNDS = ["#3b3a52", "#4a3f45", "#33474a", "#4d4536", "#3e4a3a", "#48384f", "#3a4257", "#503f3a"];
export const FACE_SKIN = ["#f1c9a5", "#e0a97f", "#c68a5e", "#a06a44", "#7a4b2e", "#5a3520"];
export const FACE_HAIR = ["#1f1a17", "#3a2a1e", "#5b3a22", "#8a5a2b", "#c9a15a", "#8c8c94", "#7a2f2f", "#2e3a5c"];
export const FACE_SHIRTS = ["#d8c7a3", "#c7d1cf", "#d9b8b0", "#bfc8a6", "#c4b9d6", "#e0d2b4", "#7f9bb5", "#b5787f"];
export const HAIR_STYLES = ["Short", "Side part", "Curly", "Long", "Bun", "Buzzed"] as const;
export const EXPRESSIONS = ["Smile", "Neutral", "Grin"] as const;

/** Indexes into the lists above. */
export type Face = {
  background: number;
  skin: number;
  hair: number;
  shirt: number;
  hairStyle: number;
  glasses: boolean;
  expression: number;
};

/** A profile's icon: their face settings (null = generated from their name) and an optional photo that overrides it. */
export type AvatarInfo = { face: Face | null; photoUrl: string | null };

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The face generated from a name: stable per person. Exactly the icons people had before editing existed. */
export function faceFromName(name: string): Face {
  const h = hash(name);
  return {
    background: h % FACE_BACKGROUNDS.length,
    skin: (h >>> 3) % FACE_SKIN.length,
    hair: (h >>> 6) % FACE_HAIR.length,
    shirt: (h >>> 9) % FACE_SHIRTS.length,
    hairStyle: (h >>> 12) % HAIR_STYLES.length,
    glasses: (h >>> 16) % 4 === 0,
    expression: (h >>> 18) % EXPRESSIONS.length,
  };
}

/** A random face, for the editor's Shuffle. */
export function randomFace(): Face {
  const pick = (n: number) => Math.floor(Math.random() * n);
  return {
    background: pick(FACE_BACKGROUNDS.length),
    skin: pick(FACE_SKIN.length),
    hair: pick(FACE_HAIR.length),
    shirt: pick(FACE_SHIRTS.length),
    hairStyle: pick(HAIR_STYLES.length),
    glasses: Math.random() < 0.25,
    expression: pick(EXPRESSIONS.length),
  };
}

/** A Face from untrusted input (a request body, a stored row), or null if anything is out of range. */
export function sanitizeFace(input: unknown): Face | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const index = (key: string, n: number) => {
    const x = v[key];
    return typeof x === "number" && Number.isInteger(x) && x >= 0 && x < n ? x : null;
  };
  const face = {
    background: index("background", FACE_BACKGROUNDS.length),
    skin: index("skin", FACE_SKIN.length),
    hair: index("hair", FACE_HAIR.length),
    shirt: index("shirt", FACE_SHIRTS.length),
    hairStyle: index("hairStyle", HAIR_STYLES.length),
    expression: index("expression", EXPRESSIONS.length),
  };
  if (Object.values(face).some((x) => x === null) || typeof v.glasses !== "boolean") return null;
  return { ...(face as Omit<Face, "glasses">), glasses: v.glasses };
}

export const sameFace = (a: Face, b: Face) =>
  a.background === b.background && a.skin === b.skin && a.hair === b.hair && a.shirt === b.shirt && a.hairStyle === b.hairStyle && a.glasses === b.glasses && a.expression === b.expression;
