import { describe, it, expect } from "vitest";
import { simulateMatch } from "../utils/match.js";

// Regression suite for the #215 phase 1 contract:
// Every stat-bearing event from simulateMatch must carry the player's
// canonical id alongside the display name, AND that id must stay in
// lock-step with the name through every post-processing rewrite path
// (substitution scorer/assister/card reassignment, second-yellow type
// flip, red-card bonus goal injection).
//
// If `evt.player` ever changes but `evt.playerId` doesn't (or vice
// versa), the canonical stats accumulator credits the wrong player.

const POSITIONS = ["GK", "CB", "CB", "LB", "RB", "CM", "CM", "AM", "LW", "RW", "ST"];
const BENCH_POSITIONS = ["GK", "CB", "CM", "AM", "ST"];

function makeSquad(prefix = "p", ovr = 14) {
  const starters = POSITIONS.map((pos, i) => ({
    id: `${prefix}_${i}`,
    name: `${prefix.toUpperCase()}-${pos}-${i}`,
    position: pos,
    isBench: false,
    attrs: {
      pace: ovr, shooting: ovr, passing: ovr,
      defending: ovr, physical: ovr, technique: ovr, mental: ovr,
    },
  }));
  const bench = BENCH_POSITIONS.map((pos, i) => ({
    id: `${prefix}_b${i}`,
    name: `${prefix.toUpperCase()}-bench-${pos}-${i}`,
    position: pos,
    isBench: true,
    attrs: {
      pace: ovr, shooting: ovr, passing: ovr,
      defending: ovr, physical: ovr, technique: ovr, mental: ovr,
    },
  }));
  return [...starters, ...bench];
}

function makeTeam({ id, name, trait = null } = {}) {
  return {
    id, name: name || `Team-${id}`,
    isPlayer: false,
    trait,
    squad: makeSquad(`t${id}`),
  };
}

function runMatches(n = 50, opts = {}) {
  const results = [];
  for (let i = 0; i < n; i++) {
    const home = makeTeam({ id: 0, name: "Home", trait: opts.homeTrait });
    const away = makeTeam({ id: 1, name: "Away", trait: opts.awayTrait });
    const r = simulateMatch(home, away, null, null, false, 1.0, 0, null, 0, opts.modifiers || {});
    results.push({ home, away, r });
  }
  return results;
}

function findId(team, name) {
  return team.squad.find(p => p.name === name)?.id || null;
}

// =============================================================================

describe("simulateMatch event identity — phase 1 contract", () => {
  it("every goal event carries playerId that resolves to evt.player", () => {
    const runs = runMatches(50);
    let goalsSeen = 0;
    for (const { home, away, r } of runs) {
      for (const evt of r.events) {
        if (evt.type !== "goal") continue;
        goalsSeen++;
        const team = evt.side === "home" ? home : away;
        // playerId must exist
        expect(evt.playerId, `goal event missing playerId for ${evt.player}`).toBeTruthy();
        // playerId must point at a player in the scoring team's squad
        const found = team.squad.find(p => p.id === evt.playerId);
        expect(found, `playerId ${evt.playerId} not in ${team.name} squad`).toBeTruthy();
        // The id and the name must agree
        expect(found.name).toBe(evt.player);
        // teamId/teamName carried
        expect(evt.teamId).toBe(team.id);
        expect(evt.teamName).toBe(team.name);
      }
    }
    expect(goalsSeen).toBeGreaterThan(0); // sanity — we did see goals
  });

  it("every assister has assisterId resolving to evt.assister", () => {
    const runs = runMatches(50);
    let assistsSeen = 0;
    for (const { home, away, r } of runs) {
      for (const evt of r.events) {
        if (evt.type !== "goal" || !evt.assister) continue;
        assistsSeen++;
        const team = evt.side === "home" ? home : away;
        expect(evt.assisterId, `assist missing assisterId for ${evt.assister}`).toBeTruthy();
        const found = team.squad.find(p => p.id === evt.assisterId);
        expect(found).toBeTruthy();
        expect(found.name).toBe(evt.assister);
      }
    }
    expect(assistsSeen).toBeGreaterThan(0);
  });

  it("every card event (yellow + red) carries cardPlayerId", () => {
    // Run with high card frequency to make sure we see them.
    const runs = runMatches(50, { homeTrait: "physical", awayTrait: "physical" });
    let cardsSeen = 0;
    for (const { home, away, r } of runs) {
      for (const evt of r.events) {
        if (evt.type !== "card" && evt.type !== "red_card") continue;
        cardsSeen++;
        const team = evt.cardTeamName === home.name ? home : away;
        expect(evt.cardPlayerId, `card event missing cardPlayerId for ${evt.cardPlayer}`).toBeTruthy();
        const found = team.squad.find(p => p.id === evt.cardPlayerId);
        expect(found).toBeTruthy();
        expect(found.name).toBe(evt.cardPlayer);
      }
    }
    expect(cardsSeen).toBeGreaterThan(0);
  });

  it("second-yellow red carries redReason and countsAsYellow", () => {
    // Second yellows are stochastic. We hammer the test with a high-card
    // matchup so at least one is statistically likely; assert only when
    // we find one.
    const runs = runMatches(80, { homeTrait: "physical", awayTrait: "physical" });
    let foundSecondYellow = false;
    for (const { r } of runs) {
      const reds = r.events.filter(e => e.type === "red_card");
      for (const red of reds) {
        if (red.redReason === "second_yellow") {
          foundSecondYellow = true;
          expect(red.countsAsYellow).toBe(true);
          // Identity must still hold
          expect(red.cardPlayerId).toBeTruthy();
        }
        if (red.isDirectRed) {
          // Direct red must NOT have countsAsYellow
          expect(red.countsAsYellow).toBeFalsy();
        }
      }
    }
    // We don't *require* a second yellow in 80 sims (stochastic), but if
    // we got 0 across that many it's worth knowing — fail loud.
    expect(foundSecondYellow).toBe(true);
  });

  it("substitution rewrite keeps player <-> playerId in sync", () => {
    // Run many matches; for any goal where the named scorer is a sub,
    // the playerId must point at that same sub player (a bench id).
    const runs = runMatches(100);
    let rewrittenGoalsSeen = 0;
    for (const { home, away, r } of runs) {
      for (const evt of r.events) {
        if (evt.type !== "goal") continue;
        const team = evt.side === "home" ? home : away;
        const player = team.squad.find(p => p.id === evt.playerId);
        if (!player) continue;
        // If the scorer was originally a bench player, this goal had
        // either a fresh sub-pick (red-card bonus) or a substitution
        // rewrite. Either way: id must match the named player.
        if (player.isBench) {
          rewrittenGoalsSeen++;
          expect(player.name).toBe(evt.player);
          // Reverse-lookup by name to catch cross-wiring
          const byName = team.squad.find(p => p.name === evt.player);
          expect(byName.id).toBe(evt.playerId);
        }
      }
    }
    // Statistical sanity — across 100 matches we should have at least
    // a few sub-scored or rewritten goals
    expect(rewrittenGoalsSeen).toBeGreaterThan(0);
  });

  it("no event has a name without a matching id (or vice versa)", () => {
    const runs = runMatches(50, { homeTrait: "physical" });
    for (const { home, away, r } of runs) {
      for (const evt of r.events) {
        if (evt.type === "goal") {
          // Every goal MUST have both fields populated
          expect(typeof evt.player).toBe("string");
          expect(evt.playerId).toBeTruthy();
        }
        if (evt.type === "card" || evt.type === "red_card") {
          if (evt.cardPlayer) {
            expect(evt.cardPlayerId).toBeTruthy();
          }
        }
      }
    }
  });
});
