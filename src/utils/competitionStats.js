// Canonical competition-wide stats accumulator and selectors.
//
// Competition-agnostic — the accumulator and selectors are reused for both
// league and cup stats.
//
// Identity model: every player entry is keyed by player.id when available,
// with a deterministic composite fallback for events that lack an id.
// Names are display-only.
//
// Idempotency: every accumulation call requires a `matchId`; subsequent
// calls for the same id are no-ops. The processed-match set lives inside
// the stats blob so it travels with the data on save/load.

export function emptyCompetitionStats() {
  return { players: {}, processedMatches: {} };
}

function compositeFallbackKey(teamId, name, position) {
  // Deterministic composite for AI players whose events may not carry an id.
  // Lossy by design — name collisions within the same team+position will
  // collapse, which is acceptable since the alternative is fabricating ids.
  return `c|${teamId ?? "?"}|${name ?? "?"}|${position ?? "?"}`;
}

function playerKey({ playerId, teamId, name, position }) {
  if (playerId) return String(playerId);
  return compositeFallbackKey(teamId, name, position);
}

function ensurePlayer(stats, identity) {
  const key = playerKey(identity);
  let entry = stats.players[key];
  if (!entry) {
    entry = {
      key,
      playerId: identity.playerId || null,
      name: identity.name || "",
      teamId: identity.teamId || null,
      teamName: identity.teamName || "",
      position: identity.position || null,
      goals: 0, assists: 0, yellows: 0, reds: 0, apps: 0, starts: 0,
    };
    stats.players[key] = entry;
  } else {
    // Refresh the display fields in case a player has been renamed mid-season
    // or moved teams (loan, transfer). Identity (key) stays stable.
    if (identity.name) entry.name = identity.name;
    if (identity.teamName) entry.teamName = identity.teamName;
    if (identity.teamId != null) entry.teamId = identity.teamId;
    if (identity.position) entry.position = identity.position;
  }
  return entry;
}

/**
 * Apply a completed match's stat-bearing events to the canonical store.
 *
 * Idempotent: if `matchId` is already recorded as processed, no work is done
 * and the input stats object is returned unchanged.
 *
 * @param {object} stats           - existing canonical stats object
 * @param {object} input
 * @param {string} input.matchId   - required, unique per match per competition
 * @param {object} input.result    - simulateMatch return shape, must include `events`
 * @param {object} input.homeTeam  - { id, name, squad: [{ id, name, position }] }
 * @param {object} input.awayTeam  - same shape as homeTeam
 * @param {Array}  [input.starters]
 *        - optional list of { id, side } refs for starters this match
 *          (used to credit `starts`). If absent, starts is not incremented;
 *          apps still increments per side per appearing player.
 * @returns {object} the same stats object (mutated in place)
 */
export function accumulateMatchStats(stats, input) {
  if (!stats) return stats;
  if (!input || !input.matchId) return stats;
  if (stats.processedMatches?.[input.matchId]) return stats;
  if (!stats.processedMatches) stats.processedMatches = {};
  if (!stats.players) stats.players = {};

  const { result, homeTeam, awayTeam, starters } = input;
  if (!result || !Array.isArray(result.events)) {
    // Mark processed so a malformed match doesn't keep getting retried
    stats.processedMatches[input.matchId] = true;
    return stats;
  }

  const teamFor = (side) => side === "home" ? homeTeam : awayTeam;

  // Identity resolver — events should carry IDs at creation time but we
  // tolerate name-only events as a fallback.
  const identityFromEvent = (evt, idField, nameField) => {
    const team = teamFor(evt.side) || {};
    const id = evt[idField] || null;
    const name = evt[nameField] || "";
    let position = null;
    if (team.squad) {
      const found = id
        ? team.squad.find(p => p.id === id)
        : team.squad.find(p => p.name === name);
      if (found) position = found.position || null;
    }
    return {
      playerId: id,
      name,
      teamId: team.id ?? null,
      teamName: team.name || "",
      position,
    };
  };

  // === Apps + starts from explicit lists or squad fallback ===
  // Apps: any player who plays — we approximate by crediting the picked
  // squad of each side (starters + bench who came on). `starters` is the
  // authoritative source if provided; otherwise we credit starting XI only.
  const creditAppearance = (team, side, isStart) => {
    if (!team || !Array.isArray(team.squad)) return;
    for (const p of team.squad) {
      if (!p || !p.id) continue;
      const entry = ensurePlayer(stats, {
        playerId: p.id, name: p.name, teamId: team.id ?? null,
        teamName: team.name || "", position: p.position || null,
      });
      entry.apps += 1;
      if (isStart) entry.starts += 1;
    }
  };

  if (Array.isArray(starters) && starters.length > 0) {
    // Authoritative path: only credit listed starters' starts; apps are
    // credited per side per player who appeared (drawn from the squad).
    const starterIds = new Set(starters.filter(s => s && s.side === "home" && s.id).map(s => s.id));
    const awayStarterIds = new Set(starters.filter(s => s && s.side === "away" && s.id).map(s => s.id));
    [["home", homeTeam, starterIds], ["away", awayTeam, awayStarterIds]].forEach(([_side, team, idSet]) => {
      if (!team || !Array.isArray(team.squad)) return;
      for (const p of team.squad) {
        if (!p || !p.id) continue;
        const entry = ensurePlayer(stats, {
          playerId: p.id, name: p.name, teamId: team.id ?? null,
          teamName: team.name || "", position: p.position || null,
        });
        entry.apps += 1;
        if (idSet.has(p.id)) entry.starts += 1;
      }
    });
  } else {
    // Fallback: credit apps + starts for the full squad of each team.
    // The explicit-starters path above is the precise version when callers
    // can supply it; this fallback double-counts bench-who-didn't-play.
    creditAppearance(homeTeam, "home", true);
    creditAppearance(awayTeam, "away", true);
  }

  // === Goals + assists + cards ===
  for (const evt of result.events) {
    if (!evt || (evt.side !== "home" && evt.side !== "away")) continue;

    if (evt.type === "goal") {
      const scorer = identityFromEvent(evt, "playerId", "player");
      if (scorer.playerId || scorer.name) {
        ensurePlayer(stats, scorer).goals += 1;
      }
      if (evt.assister || evt.assisterId) {
        const assister = identityFromEvent(evt, "assisterId", "assister");
        if (assister.playerId || assister.name) {
          ensurePlayer(stats, assister).assists += 1;
        }
      }
      continue;
    }

    if (evt.type === "card" || evt.type === "red_card") {
      // Cards key off cardPlayerId / cardPlayer.
      const card = identityFromEvent(evt, "cardPlayerId", "cardPlayer");
      if (!card.playerId && !card.name) continue;
      const entry = ensurePlayer(stats, card);
      if (evt.type === "red_card") {
        entry.reds += 1;
        // Second-yellow rule: a yellow that becomes a red counts as both.
        if (evt.countsAsYellow === true) entry.yellows += 1;
      } else {
        entry.yellows += 1;
      }
    }
  }

  stats.processedMatches[input.matchId] = true;
  return stats;
}

// === Selectors ===

function topBy(stats, field, limit = 20) {
  if (!stats || !stats.players) return [];
  const entries = Object.values(stats.players).filter(p => (p[field] || 0) > 0);
  // Deterministic tie-break: by field desc, then apps asc (fewer games for
  // same value = more impressive), then name asc for full stability.
  entries.sort((a, b) => {
    if (b[field] !== a[field]) return b[field] - a[field];
    if (a.apps !== b.apps) return a.apps - b.apps;
    return (a.name || "").localeCompare(b.name || "");
  });
  return entries.slice(0, limit);
}

export function getTopScorers(stats, limit = 20) { return topBy(stats, "goals", limit); }
export function getTopAssisters(stats, limit = 20) { return topBy(stats, "assists", limit); }
export function getMostYellows(stats, limit = 20) { return topBy(stats, "yellows", limit); }
export function getMostReds(stats, limit = 20) { return topBy(stats, "reds", limit); }

// === MatchId helpers ===

/**
 * Canonical league match id for the current season.
 * Format: league:S{season}:T{tier}:MD{matchweekIdx}:M{fixtureIdx}
 *
 * matchweekIdx is the 0-indexed matchweek in the season's fixtures.
 * fixtureIdx is the 0-indexed position of the match within that
 * matchweek's fixtures array (so the same two teams in different
 * matchweeks get different ids).
 */
export function leagueMatchId({ season, tier, matchweekIdx, fixtureIdx }) {
  return `league:S${season}:T${tier}:MD${matchweekIdx}:M${fixtureIdx}`;
}

// Internal — exposed only for tests
export const __test = { playerKey, compositeFallbackKey };
