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

// Internal helpers for surname / initial extraction. Exported for tests.
export function getSurname(name) {
  if (!name || typeof name !== "string") return "";
  const trimmed = name.trim();
  if (!trimmed) return "";
  const lastSpace = trimmed.lastIndexOf(" ");
  return lastSpace === -1 ? trimmed : trimmed.slice(lastSpace + 1);
}

export function getInitial(name) {
  if (!name || typeof name !== "string") return "";
  const trimmed = name.trim();
  if (!trimmed) return "";
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) return ""; // single name — no initial
  const first = trimmed.slice(0, firstSpace);
  return first[0] ? first[0].toUpperCase() : "";
}

/**
 * Build a Map of full player name -> compact display name for mobile
 * scorer ledgers, applying smart disambiguation across the match's
 * combined squad pool.
 *
 * Rules (from least to most disambiguated):
 *   1. Default: surname only ("Watkins")
 *   2. If two+ players in the match share that surname:
 *      use "Initial. Surname" ("J. Smith")
 *   3. If "Initial. Surname" still collides:
 *      add position ("J. Smith (ST)")
 *   4. Single-name players (no space) just return their name.
 *
 * @param {Array}  events           - match event stream
 * @param {Array}  allMatchPlayers  - squad pool covering home + away,
 *                                    each entry { name, position }
 * @returns {Object} { [fullName]: displayName }
 */
export function buildScorerDisplayMap(events, allMatchPlayers) {
  const out = {};
  const players = Array.isArray(allMatchPlayers) ? allMatchPlayers.filter(p => p && p.name) : [];

  // Group players by surname (case-sensitive — generated names are consistent)
  const surnameGroups = {};
  for (const p of players) {
    const sn = getSurname(p.name);
    if (!sn) continue;
    if (!surnameGroups[sn]) surnameGroups[sn] = [];
    surnameGroups[sn].push(p);
  }

  // Collect unique scorer names from events
  const scorerNames = new Set();
  if (Array.isArray(events)) {
    for (const evt of events) {
      if (!evt || evt.type !== "goal") continue;
      if (evt.player) scorerNames.add(evt.player);
    }
  }

  for (const fullName of scorerNames) {
    const sn = getSurname(fullName);
    if (!sn) { out[fullName] = fullName; continue; }
    const group = surnameGroups[sn] || [];

    // Tier 1 — unique surname in the match: surname only.
    if (group.length <= 1) {
      out[fullName] = sn;
      continue;
    }

    const initial = getInitial(fullName);
    if (!initial) {
      // Single-name player whose surname collides with someone else — fall back to full name.
      out[fullName] = fullName;
      continue;
    }

    // Tier 2 — surname collides but initial disambiguates.
    const sameInitial = group.filter(p => getInitial(p.name) === initial);
    if (sameInitial.length <= 1) {
      out[fullName] = `${initial}. ${sn}`;
      continue;
    }

    // Tier 3 — initial+surname still collides; add position.
    const me = group.find(p => p.name === fullName);
    const pos = me?.position;
    out[fullName] = pos ? `${initial}. ${sn} (${pos})` : `${initial}. ${sn}`;
  }

  return out;
}
