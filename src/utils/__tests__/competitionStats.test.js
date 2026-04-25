import { describe, it, expect } from "vitest";
import {
  emptyCompetitionStats,
  accumulateMatchStats,
  getTopScorers,
  getTopAssisters,
  getMostYellows,
  getMostReds,
  leagueMatchId,
} from "../competitionStats.js";

// Test fixtures ---------------------------------------------------------------

const homeTeam = {
  id: 0, name: "City",
  squad: [
    { id: "p1", name: "John Smith", position: "ST" },
    { id: "p2", name: "Roy Keane",  position: "CM" },
    { id: "p3", name: "Bob",        position: "GK" },
  ],
};

const awayTeam = {
  id: 1, name: "Rovers",
  squad: [
    { id: "p4", name: "Kevin Smith", position: "ST" },
    { id: "p5", name: "Watkins",     position: "CB" },
    { id: "p6", name: "Carter",      position: "GK" },
  ],
};

const goalEvent = (overrides) => ({
  type: "goal", side: "home",
  playerId: "p1", player: "John Smith",
  minute: 30,
  ...overrides,
});

const cardEvent = (overrides) => ({
  type: "card", side: "home",
  cardPlayerId: "p2", cardPlayer: "Roy Keane",
  cardTeamName: "City",
  minute: 50,
  ...overrides,
});

function buildResult(events) {
  return { homeGoals: 0, awayGoals: 0, events };
}

const baseInput = (events, matchId = "league:S1:T7:MD0:M0") => ({
  matchId,
  result: buildResult(events),
  homeTeam, awayTeam,
});

// =============================================================================

describe("emptyCompetitionStats", () => {
  it("returns the canonical empty shape", () => {
    expect(emptyCompetitionStats()).toEqual({ players: {}, processedMatches: {} });
  });
});

describe("accumulateMatchStats — basic counting", () => {
  it("counts goals for both teams", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      goalEvent({ playerId: "p1", player: "John Smith", side: "home", minute: 10 }),
      goalEvent({ playerId: "p4", player: "Kevin Smith", side: "away", minute: 60 }),
    ]));
    expect(stats.players["p1"].goals).toBe(1);
    expect(stats.players["p4"].goals).toBe(1);
    expect(stats.players["p1"].teamId).toBe(0);
    expect(stats.players["p4"].teamId).toBe(1);
  });

  it("counts assists separately from goals", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      goalEvent({ playerId: "p1", player: "John Smith", assisterId: "p2", assister: "Roy Keane" }),
    ]));
    expect(stats.players["p1"].goals).toBe(1);
    expect(stats.players["p1"].assists).toBe(0);
    expect(stats.players["p2"].assists).toBe(1);
    expect(stats.players["p2"].goals).toBe(0);
  });

  it("separates yellow and red cards", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      cardEvent({ cardPlayerId: "p1", cardPlayer: "John Smith", minute: 20 }),
      cardEvent({ type: "red_card", cardPlayerId: "p2", cardPlayer: "Roy Keane", minute: 80 }),
    ]));
    expect(stats.players["p1"].yellows).toBe(1);
    expect(stats.players["p1"].reds).toBe(0);
    expect(stats.players["p2"].yellows).toBe(0);
    expect(stats.players["p2"].reds).toBe(1);
  });

  it("counts second-yellow red as one yellow + one red (countsAsYellow: true)", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      cardEvent({ cardPlayerId: "p1", cardPlayer: "John Smith", minute: 20 }),
      cardEvent({ type: "red_card", cardPlayerId: "p1", cardPlayer: "John Smith",
                  redReason: "second_yellow", countsAsYellow: true, minute: 75 }),
    ]));
    expect(stats.players["p1"].yellows).toBe(2);
    expect(stats.players["p1"].reds).toBe(1);
  });

  it("direct red is red only, no yellow", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      cardEvent({ type: "red_card", cardPlayerId: "p1", cardPlayer: "John Smith",
                  isDirectRed: true, minute: 40 }),
    ]));
    expect(stats.players["p1"].yellows).toBe(0);
    expect(stats.players["p1"].reds).toBe(1);
  });

  it("VAR-upgraded red (no countsAsYellow flag) is red only", () => {
    // Per the locked decision: VAR-upgraded yellows count as red only,
    // unless we deliberately set countsAsYellow.
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      cardEvent({ type: "red_card", cardPlayerId: "p1", cardPlayer: "John Smith", minute: 60 }),
    ]));
    expect(stats.players["p1"].yellows).toBe(0);
    expect(stats.players["p1"].reds).toBe(1);
  });
});

describe("accumulateMatchStats — apps and starts", () => {
  it("credits apps and starts to all squad players when no starters list provided", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([]));
    homeTeam.squad.forEach(p => {
      expect(stats.players[p.id].apps).toBe(1);
      expect(stats.players[p.id].starts).toBe(1);
    });
  });

  it("respects an explicit starters list for starts", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, {
      ...baseInput([]),
      starters: [
        { id: "p1", side: "home" },
        { id: "p2", side: "home" },
        { id: "p4", side: "away" },
      ],
    });
    expect(stats.players["p1"].starts).toBe(1);
    expect(stats.players["p2"].starts).toBe(1);
    expect(stats.players["p3"].starts).toBe(0); // GK on bench
    expect(stats.players["p3"].apps).toBe(1);   // still played (in squad)
    expect(stats.players["p4"].starts).toBe(1);
    expect(stats.players["p5"].starts).toBe(0); // bench
  });
});

describe("accumulateMatchStats — idempotency", () => {
  it("ignores the same matchId twice", () => {
    const stats = emptyCompetitionStats();
    const events = [goalEvent({ playerId: "p1", player: "John Smith" })];
    accumulateMatchStats(stats, baseInput(events, "league:S1:T7:MD0:M0"));
    accumulateMatchStats(stats, baseInput(events, "league:S1:T7:MD0:M0"));
    expect(stats.players["p1"].goals).toBe(1);
    expect(stats.players["p1"].apps).toBe(1);
  });

  it("processes different matchIds independently", () => {
    const stats = emptyCompetitionStats();
    const events = [goalEvent({ playerId: "p1", player: "John Smith" })];
    accumulateMatchStats(stats, baseInput(events, "league:S1:T7:MD0:M0"));
    accumulateMatchStats(stats, baseInput(events, "league:S1:T7:MD1:M0"));
    expect(stats.players["p1"].goals).toBe(2);
    expect(stats.players["p1"].apps).toBe(2);
  });

  it("marks a malformed match as processed so it isn't retried", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, { matchId: "league:S1:T7:MD0:M0", result: null, homeTeam, awayTeam });
    expect(stats.processedMatches["league:S1:T7:MD0:M0"]).toBe(true);
  });
});

describe("accumulateMatchStats — duplicate names", () => {
  it("handles two players with identical names but different IDs", () => {
    // John Smith on home team, John Smith on away team — different ids.
    const altAway = {
      id: 1, name: "Rovers",
      squad: [{ id: "p99", name: "John Smith", position: "ST" }],
    };
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, {
      matchId: "league:S1:T7:MD0:M0",
      result: buildResult([
        goalEvent({ playerId: "p1", player: "John Smith", side: "home" }),
        goalEvent({ playerId: "p99", player: "John Smith", side: "away" }),
      ]),
      homeTeam, awayTeam: altAway,
    });
    expect(stats.players["p1"].goals).toBe(1);
    expect(stats.players["p99"].goals).toBe(1);
    expect(stats.players["p1"].teamName).toBe("City");
    expect(stats.players["p99"].teamName).toBe("Rovers");
  });
});

describe("accumulateMatchStats — graceful fallbacks", () => {
  it("falls back to a composite key when an event has no id", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      // Name-only event (the kind we want to phase out, but tolerate)
      { type: "goal", side: "home", player: "Some Mystery", minute: 30 },
    ]));
    // Composite key should be created
    const compositeKey = Object.keys(stats.players).find(k => k.startsWith("c|"));
    expect(compositeKey).toBeTruthy();
    expect(stats.players[compositeKey].goals).toBe(1);
    expect(stats.players[compositeKey].name).toBe("Some Mystery");
  });

  it("ignores events with neither id nor name", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      { type: "goal", side: "home", minute: 30 }, // no player at all
    ]));
    // No goal recorded — but apps still credit from squad
    expect(Object.values(stats.players).every(p => p.goals === 0)).toBe(true);
  });

  it("ignores events with unknown side", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      { type: "goal", side: "neutral", playerId: "p1", player: "John Smith", minute: 30 },
    ]));
    expect(stats.players["p1"]?.goals || 0).toBe(0);
  });

  it("does not throw on null stats input", () => {
    expect(() => accumulateMatchStats(null, baseInput([]))).not.toThrow();
  });

  it("requires matchId — silently ignores without one", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, { result: buildResult([goalEvent()]), homeTeam, awayTeam });
    expect(Object.keys(stats.players).length).toBe(0);
    expect(Object.keys(stats.processedMatches).length).toBe(0);
  });
});

describe("selectors", () => {
  function buildSeason() {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      goalEvent({ playerId: "p1", player: "John Smith" }),
      goalEvent({ playerId: "p1", player: "John Smith", minute: 60 }),
      goalEvent({ playerId: "p4", player: "Kevin Smith", side: "away", minute: 80 }),
      cardEvent({ cardPlayerId: "p2", cardPlayer: "Roy Keane" }),
      cardEvent({ type: "red_card", cardPlayerId: "p5", cardPlayer: "Watkins", side: "away",
                  cardTeamName: "Rovers", minute: 70 }),
    ], "league:S1:T7:MD0:M0"));
    return stats;
  }

  it("getTopScorers sorts goals desc with deterministic tie-break", () => {
    const stats = buildSeason();
    const top = getTopScorers(stats);
    expect(top[0].playerId).toBe("p1");
    expect(top[0].goals).toBe(2);
    expect(top[1].playerId).toBe("p4");
  });

  it("getTopAssisters returns assist leaders only (filters zero)", () => {
    const stats = emptyCompetitionStats();
    accumulateMatchStats(stats, baseInput([
      goalEvent({ playerId: "p1", player: "John Smith", assisterId: "p2", assister: "Roy Keane" }),
    ]));
    const top = getTopAssisters(stats);
    expect(top.map(p => p.playerId)).toEqual(["p2"]);
  });

  it("getMostYellows and getMostReds are independent counts", () => {
    const stats = buildSeason();
    expect(getMostYellows(stats)[0].playerId).toBe("p2");
    expect(getMostReds(stats)[0].playerId).toBe("p5");
  });

  it("limit param caps results", () => {
    const stats = emptyCompetitionStats();
    for (let i = 0; i < 25; i++) {
      const id = `dummy${i}`;
      stats.players[id] = { key: id, playerId: id, name: `P${i}`, goals: 25 - i,
        assists: 0, yellows: 0, reds: 0, apps: 1, starts: 0, teamName: "X", teamId: 0, position: null };
    }
    expect(getTopScorers(stats, 5).length).toBe(5);
    expect(getTopScorers(stats, 5)[0].name).toBe("P0");
  });

  it("ties break by fewer apps then name asc", () => {
    const stats = emptyCompetitionStats();
    // Both score 5, B has fewer apps so ranks higher
    stats.players["a"] = { key: "a", playerId: "a", name: "Alpha", goals: 5, assists: 0,
      yellows: 0, reds: 0, apps: 10, starts: 10, teamName: "X", teamId: 0 };
    stats.players["b"] = { key: "b", playerId: "b", name: "Beta",  goals: 5, assists: 0,
      yellows: 0, reds: 0, apps: 5,  starts: 5,  teamName: "X", teamId: 0 };
    stats.players["c"] = { key: "c", playerId: "c", name: "Carl",  goals: 5, assists: 0,
      yellows: 0, reds: 0, apps: 5,  starts: 5,  teamName: "X", teamId: 0 };
    const top = getTopScorers(stats);
    expect(top.map(p => p.name)).toEqual(["Beta", "Carl", "Alpha"]);
  });
});

describe("leagueMatchId", () => {
  it("formats season/tier/matchweek/fixture", () => {
    expect(leagueMatchId({ season: 3, tier: 7, matchweekIdx: 12, fixtureIdx: 4 }))
      .toBe("league:S3:T7:MD12:M4");
  });
});
