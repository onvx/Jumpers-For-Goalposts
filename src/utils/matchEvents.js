// Pure helpers for deriving matchday UI state from match events.

/**
 * Normalize a scorer name to "Initial. Surname" form.
 *
 * Examples:
 *   "Dwight Yorke"  -> "D. Yorke"
 *   "R. Keane"      -> "R. Keane"   (already initialised, left alone)
 *   "R Keane"       -> "R. Keane"   (bare initial, dot added)
 *   "Pele"          -> "Pele"       (single name, left alone)
 *   "De Bruyne"     -> "D. Bruyne"  (2-letter prefix treated as first name)
 */
export function formatScorerName(name) {
  if (!name || typeof name !== "string") return name || "";
  const trimmed = name.trim();
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return trimmed;
  const first = trimmed.slice(0, spaceIdx);
  const rest = trimmed.slice(spaceIdx + 1).trim();
  if (!rest) return trimmed;
  // Already a single-letter initial (e.g. "R" or "R.") — leave as-is, just ensure trailing dot.
  if (/^[A-Za-z]\.?$/.test(first)) {
    return first.endsWith(".") ? `${first} ${rest}` : `${first}. ${rest}`;
  }
  // Normal first name → initialise.
  return `${first[0].toUpperCase()}. ${rest}`;
}

/**
 * Build a { home, away } summary of goals from a match event stream.
 *
 * Inputs: any array of match events (result.events, shownEvents, etc.).
 * Only considers `evt.type === "goal"` with a truthy `evt.side` in ("home","away").
 *
 * Returns:
 *   {
 *     home: [{ player, assister, minute }, ...],
 *     away: [{ player, assister, minute }, ...]
 *   }
 *
 * Preserves event order, so the live feed and the strip stay in sync.
 * Never throws; returns empty arrays for malformed input.
 */
export function buildGoalStrip(events) {
  const out = { home: [], away: [] };
  if (!Array.isArray(events)) return out;
  for (const evt of events) {
    if (!evt || evt.type !== "goal") continue;
    if (evt.side !== "home" && evt.side !== "away") continue;
    out[evt.side].push({
      player: evt.player || "",
      assister: evt.assister || null,
      minute: typeof evt.minute === "number" ? evt.minute : null,
    });
  }
  return out;
}
