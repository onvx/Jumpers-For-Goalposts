import React from "react";

// Procedural pixel-art manager avatar built from layered SVG shapes.
// Same project pattern as ClubBadge.jsx — no PNG/sprite assets, deterministic
// rendering from a small config object.
//
// Avatar shape: { skin, hair, eyes, mouth, accessory } — all integer indices
// into the constant arrays below.

// ─── Feature banks ────────────────────────────────────────────────────────────

// 6 skin tones — face fill colour
export const SKIN_TONES = [
  "#f9d4b1", "#e8b89a", "#c08660", "#8d5524",
  "#5c3317", "#d6b8a0",
];

// 8 hair styles — each is a function returning JSX paths
// Coordinates are in viewBox 0 0 64 64
export const HAIR_PATHS = [
  // 0: bald (no hair, scalp shows through)
  () => null,
  // 1: short crop (top-of-head cap)
  (col) => (
    <path d="M16 22 Q32 8 48 22 L48 26 Q32 18 16 26 Z" fill={col} />
  ),
  // 2: long flowing
  (col) => (
    <>
      <path d="M14 24 Q32 6 50 24 L50 30 Q32 22 14 30 Z" fill={col} />
      <path d="M14 26 Q12 40 16 50 L20 50 Q18 36 18 28 Z" fill={col} />
      <path d="M50 26 Q52 40 48 50 L44 50 Q46 36 46 28 Z" fill={col} />
    </>
  ),
  // 3: mohawk
  (col) => (
    <path d="M28 8 L36 8 L36 26 L28 26 Z" fill={col} />
  ),
  // 4: side part
  (col) => (
    <path d="M16 22 Q32 10 48 22 L48 26 Q40 18 30 22 L26 26 L16 26 Z" fill={col} />
  ),
  // 5: afro
  (col) => (
    <>
      <circle cx="32" cy="18" r="14" fill={col} />
      <circle cx="20" cy="22" r="8" fill={col} />
      <circle cx="44" cy="22" r="8" fill={col} />
    </>
  ),
  // 6: ponytail (top + back)
  (col) => (
    <>
      <path d="M16 22 Q32 8 48 22 L48 26 Q32 18 16 26 Z" fill={col} />
      <path d="M48 26 L56 30 L54 44 L48 36 Z" fill={col} />
    </>
  ),
  // 7: cap (flat hat)
  (col) => (
    <>
      <rect x="16" y="16" width="32" height="8" fill={col} />
      <rect x="14" y="22" width="36" height="3" fill={col} />
      <rect x="48" y="20" width="10" height="4" fill={col} />
    </>
  ),
];

// Hair colours — each hair style picks one
export const HAIR_COLOURS = [
  "#1a1a1a", "#3b2418", "#6b3410", "#a06020",
  "#d4a017", "#c0c0c0", "#ffffff", "#7e22ce",
];

// 5 eye styles — drawn as a left/right pair
export const EYE_PATHS = [
  // 0: round (open)
  () => (
    <>
      <circle cx="24" cy="34" r="2" fill="#1a1a1a" />
      <circle cx="40" cy="34" r="2" fill="#1a1a1a" />
    </>
  ),
  // 1: narrow (squint)
  () => (
    <>
      <rect x="22" y="33" width="5" height="1.5" fill="#1a1a1a" />
      <rect x="37" y="33" width="5" height="1.5" fill="#1a1a1a" />
    </>
  ),
  // 2: sunglasses
  () => (
    <>
      <rect x="20" y="31" width="9" height="5" rx="1" fill="#1a1a1a" />
      <rect x="35" y="31" width="9" height="5" rx="1" fill="#1a1a1a" />
      <rect x="29" y="33" width="6" height="1" fill="#1a1a1a" />
    </>
  ),
  // 3: wink
  () => (
    <>
      <circle cx="24" cy="34" r="2" fill="#1a1a1a" />
      <rect x="37" y="33" width="5" height="1.5" fill="#1a1a1a" />
    </>
  ),
  // 4: sleepy (half-lidded)
  () => (
    <>
      <path d="M22 33 Q24 35 26 33" stroke="#1a1a1a" strokeWidth="1.5" fill="none" />
      <path d="M38 33 Q40 35 42 33" stroke="#1a1a1a" strokeWidth="1.5" fill="none" />
    </>
  ),
];

// 5 mouth styles
export const MOUTH_PATHS = [
  // 0: smile
  () => <path d="M26 44 Q32 49 38 44" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />,
  // 1: smirk
  () => <path d="M26 45 Q32 47 38 43" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />,
  // 2: neutral
  () => <line x1="27" y1="45" x2="37" y2="45" stroke="#1a1a1a" strokeWidth="1.6" strokeLinecap="round" />,
  // 3: frown
  () => <path d="M26 47 Q32 42 38 47" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />,
  // 4: open (shouting)
  () => <ellipse cx="32" cy="46" rx="3" ry="2.5" fill="#1a1a1a" />,
];

// 5 accessories: 0 = none
export const ACCESSORY_PATHS = [
  // 0: none
  () => null,
  // 1: moustache
  () => <path d="M25 42 Q28 44 32 42 Q36 44 39 42 L39 41 Q36 43 32 41 Q28 43 25 41 Z" fill="#1a1a1a" />,
  // 2: scarf (across neck)
  () => <rect x="14" y="56" width="36" height="6" fill="#dc2626" />,
  // 3: headphones (band over head)
  () => (
    <>
      <path d="M14 28 Q32 12 50 28" stroke="#1a1a1a" strokeWidth="2.5" fill="none" />
      <rect x="11" y="28" width="6" height="8" rx="2" fill="#1a1a1a" />
      <rect x="47" y="28" width="6" height="8" rx="2" fill="#1a1a1a" />
    </>
  ),
  // 4: earring
  () => (
    <>
      <circle cx="14" cy="40" r="1.5" fill="#facc15" />
      <circle cx="50" cy="40" r="1.5" fill="#facc15" />
    </>
  ),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function randomAvatar() {
  return {
    skin: Math.floor(Math.random() * SKIN_TONES.length),
    hair: Math.floor(Math.random() * HAIR_PATHS.length),
    hairColour: Math.floor(Math.random() * HAIR_COLOURS.length),
    eyes: Math.floor(Math.random() * EYE_PATHS.length),
    mouth: Math.floor(Math.random() * MOUTH_PATHS.length),
    accessory: Math.floor(Math.random() * ACCESSORY_PATHS.length),
  };
}

export const FEATURE_COUNTS = {
  skin: SKIN_TONES.length,
  hair: HAIR_PATHS.length,
  hairColour: HAIR_COLOURS.length,
  eyes: EYE_PATHS.length,
  mouth: MOUTH_PATHS.length,
  accessory: ACCESSORY_PATHS.length,
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Procedural manager avatar.
 * @param {object} avatar - { skin, hair, hairColour, eyes, mouth, accessory }
 * @param {number} size - rendered px (square)
 */
export function ManagerAvatar({ avatar, size = 64 }) {
  if (!avatar) return null;
  const skinFill = SKIN_TONES[avatar.skin % SKIN_TONES.length];
  const hairFill = HAIR_COLOURS[(avatar.hairColour ?? 0) % HAIR_COLOURS.length];
  const hair = HAIR_PATHS[avatar.hair % HAIR_PATHS.length];
  const eyes = EYE_PATHS[avatar.eyes % EYE_PATHS.length];
  const mouth = MOUTH_PATHS[avatar.mouth % MOUTH_PATHS.length];
  const accessory = ACCESSORY_PATHS[avatar.accessory % ACCESSORY_PATHS.length];

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0, imageRendering: "pixelated" }}
    >
      {/* Background frame */}
      <rect x="0" y="0" width="64" height="64" fill="#0f172a" />
      <rect x="0" y="0" width="64" height="64" fill="none" stroke="#334155" strokeWidth="1" />
      {/* Neck */}
      <rect x="26" y="48" width="12" height="10" fill={skinFill} />
      {/* Face */}
      <ellipse cx="32" cy="34" rx="16" ry="18" fill={skinFill} />
      {/* Eyes */}
      {eyes()}
      {/* Mouth */}
      {mouth()}
      {/* Hair (over face) */}
      {hair && hair(hairFill)}
      {/* Accessory (top layer) */}
      {accessory()}
    </svg>
  );
}
