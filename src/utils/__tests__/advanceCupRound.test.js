import { describe, it, expect } from "vitest";
import { advanceCupRound } from "../league.js";

// Minimal team factory — just enough for simulateMatch to run end-to-end and
// emit events. Eleven starters + a few benchers.
function makeTeam(id, prefix) {
  const positions = ["GK", "CB", "CB", "LB", "RB", "CM", "CM", "AM", "LW", "RW", "ST"];
  const benchPositions = ["GK", "CB", "CM", "AM", "ST"];
  const attrs = { pace: 14, shooting: 14, passing: 14, defending: 14, physical: 14, technique: 14, mental: 14 };
  const starters = positions.map((pos, i) => ({
    id: `${prefix}_${i}`, name: `${prefix.toUpperCase()}-${pos}-${i}`, position: pos, isBench: false, attrs,
  }));
  const bench = benchPositions.map((pos, i) => ({
    id: `${prefix}_b${i}`, name: `${prefix.toUpperCase()}-bench-${pos}-${i}`, position: pos, isBench: true, attrs,
  }));
  return { name: `Team-${id}`, color: "#fff", strength: 0.5, squad: [...starters, ...bench], tier: 1 };
}

function makeCup(home, away) {
  return {
    cupName: "Test Cup",
    currentRound: 0,
    rounds: [
      {
        name: "Round 1",
        matches: [{ home: { name: home.name, tier: 1 }, away: { name: away.name, tier: 1 } }],
        matchweek: 0,
      },
      { name: "Round 2", matches: [], matchweek: 4 },
    ],
    seededTeams: [],
    playerEliminated: false,
  };
}

describe("advanceCupRound — onAIMatchSimulated callback", () => {
  it("fires the handler when teamLookup returns squad-bearing teams", () => {
    const home = makeTeam("home", "h");
    const away = makeTeam("away", "a");
    const lookup = (name) => name === home.name ? home : name === away.name ? away : null;

    const calls = [];
    const handler = (h, a, result, roundIdx) => {
      calls.push({ homeName: h.name, awayName: a.name, hasEvents: Array.isArray(result.events), roundIdx });
    };

    advanceCupRound(makeCup(home, away), [], [], [], lookup, handler);

    expect(calls).toHaveLength(1);
    expect(calls[0].homeName).toBe(home.name);
    expect(calls[0].awayName).toBe(away.name);
    expect(calls[0].hasEvents).toBe(true);
    expect(calls[0].roundIdx).toBe(0);
  });

  it("does NOT fire the handler when teamLookup returns null (strength fallback)", () => {
    const home = makeTeam("home", "h");
    const away = makeTeam("away", "a");
    // Lookup returns null for everything — advanceCupRound falls back to the
    // strength-formula path which produces no events.
    const lookup = () => null;

    const calls = [];
    advanceCupRound(makeCup(home, away), [], [], [], lookup, (...args) => calls.push(args));

    expect(calls).toHaveLength(0);
  });

  it("does NOT fire the handler for player-team matches", () => {
    const home = makeTeam("home", "h");
    const away = makeTeam("away", "a");
    const cup = makeCup(home, away);
    cup.rounds[0].matches[0].home.isPlayer = true;

    const calls = [];
    const lookup = (name) => name === home.name ? home : away;
    advanceCupRound(cup, [], [], [], lookup, (...args) => calls.push(args));

    expect(calls).toHaveLength(0);
  });

  it("works when no handler is supplied (back-compat)", () => {
    const home = makeTeam("home", "h");
    const away = makeTeam("away", "a");
    const lookup = (name) => name === home.name ? home : away;
    expect(() => advanceCupRound(makeCup(home, away), [], [], [], lookup)).not.toThrow();
  });
});
