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
    const next = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      goalEvent({ playerId: "p1", player: "John Smith", side: "home", minute: 10 }),
      goalEvent({ playerId: "p4", player: "Kevin Smith", side: "away", minute: 60 }),
    ]));
    expect(next.players["p1"].goals).toBe(1);
    expect(next.players["p4"].goals).toBe(1);
    expect(next.players["p1"].teamId).toBe(0);
    expect(next.players["p4"].teamId).toBe(1);
  });

  it("counts assists separately from goals", () => {
    const next = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      goalEvent({ playerId: "p1", player: "John Smith", assisterId: "p2", assister: "Roy Keane" }),
    ]));
    expect(next.players["p1"].goals).toBe(1);
    expect(next.players["p1"].assists).toBe(0);
    expect(next.players["p2"].assists).toBe(1);
    expect(next.players["p2"].goals).toBe(0);
  });

  it("separates yellow and red cards", () => {
    const next = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      cardEvent({ cardPlayerId: "p1", cardPlayer: "John Smith", minute: 20 }),
      cardEvent({ type: "red_card", cardPlayerId: "p2", cardPlayer: "Roy Keane", minute: 80 }),
    ]));
    expect(next.players["p1"].yellows).toBe(1);
    expect(next.players["p1"].reds).toBe(0);
    expect(next.players["p2"].yellows).toBe(0);
    expect(next.players["p2"].reds).toBe(1);
  });

  it("counts second-yellow red as one yellow + one red (countsAsYellow: true)", () => {
    const next = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      cardEvent({ cardPlayerId: "p1", cardPlayer: "John Smith", minute: 20 }),
      cardEvent({ type: "red_card", cardPlayerId: "p1", cardPlayer: "John Smith",
                  redReason: "second_yellow", countsAsYellow: true, minute: 75 }),
    ]));
    expect(next.players["p1"].yellows).toBe(2);
    expect(next.players["p1"].reds).toBe(1);
  });

  it("direct red is red only, no yellow", () => {
    const next = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      cardEvent({ type: "red_card", cardPlayerId: "p1", cardPlayer: "John Smith",
                  isDirectRed: true, minute: 40 }),
    ]));
    expect(next.players["p1"].yellows).toBe(0);
    expect(next.players["p1"].reds).toBe(1);
  });

  it("VAR-upgraded red (no countsAsYellow flag) is red only", () => {
    const next = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      cardEvent({ type: "red_card", cardPlayerId: "p1", cardPlayer: "John Smith", minute: 60 }),
    ]));
    expect(next.players["p1"].yellows).toBe(0);
    expect(next.players["p1"].reds).toBe(1);
  });
});

describe("accumulateMatchStats — purity", () => {
  it("does not mutate the input stats object", () => {
    const stats = emptyCompetitionStats();
    const before = JSON.stringify(stats);
    const next = accumulateMatchStats(stats, baseInput([
      goalEvent({ playerId: "p1", player: "John Smith" }),
    ]));
    expect(JSON.stringify(stats)).toBe(before);
    expect(next).not.toBe(stats);
    expect(next.players).not.toBe(stats.players);
    expect(next.processedMatches).not.toBe(stats.processedMatches);
  });

  it("returns a fresh object with copy-on-write players", () => {
    const stats = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      goalEvent({ playerId: "p1", player: "John Smith" }),
    ], "league:S1:T7:MD0:M0"));
    const beforeP1 = stats.players["p1"];
    const next = accumulateMatchStats(stats, baseInput([
      goalEvent({ playerId: "p1", player: "John Smith" }),
    ], "league:S1:T7:MD1:M0"));
    expect(next.players["p1"]).not.toBe(beforeP1);
    expect(next.players["p1"].goals).toBe(2);
    expect(beforeP1.goals).toBe(1);
  });

  it("returns the same reference when matchId already processed", () => {
    const stats = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      goalEvent({ playerId: "p1" }),
    ], "league:S1:T7:MD0:M0"));
    const same = accumulateMatchStats(stats, baseInput([
      goalEvent({ playerId: "p1" }),
    ], "league:S1:T7:MD0:M0"));
    expect(same).toBe(stats);
  });
});

describe("accumulateMatchStats — idempotency", () => {
  it("ignores the same matchId twice", () => {
    const events = [goalEvent({ playerId: "p1", player: "John Smith" })];
    let stats = accumulateMatchStats(emptyCompetitionStats(), baseInput(events, "league:S1:T7:MD0:M0"));
    stats = accumulateMatchStats(stats, baseInput(events, "league:S1:T7:MD0:M0"));
    expect(stats.players["p1"].goals).toBe(1);
  });

  it("processes different matchIds independently", () => {
    const events = [goalEvent({ playerId: "p1", player: "John Smith" })];
    let stats = accumulateMatchStats(emptyCompetitionStats(), baseInput(events, "league:S1:T7:MD0:M0"));
    stats = accumulateMatchStats(stats, baseInput(events, "league:S1:T7:MD1:M0"));
    expect(stats.players["p1"].goals).toBe(2);
  });

  it("marks a malformed match as processed so it isn't retried", () => {
    const next = accumulateMatchStats(emptyCompetitionStats(), {
      matchId: "league:S1:T7:MD0:M0", result: null, homeTeam, awayTeam,
    });
    expect(next.processedMatches["league:S1:T7:MD0:M0"]).toBe(true);
  });
});

describe("accumulateMatchStats — duplicate names", () => {
  it("handles two players with identical names but different IDs", () => {
    const altAway = {
      id: 1, name: "Rovers",
      squad: [{ id: "p99", name: "John Smith", position: "ST" }],
    };
    const next = accumulateMatchStats(emptyCompetitionStats(), {
      matchId: "league:S1:T7:MD0:M0",
      result: buildResult([
        goalEvent({ playerId: "p1", player: "John Smith", side: "home" }),
        goalEvent({ playerId: "p99", player: "John Smith", side: "away" }),
      ]),
      homeTeam, awayTeam: altAway,
    });
    expect(next.players["p1"].goals).toBe(1);
    expect(next.players["p99"].goals).toBe(1);
    expect(next.players["p1"].teamName).toBe("City");
    expect(next.players["p99"].teamName).toBe("Rovers");
  });
});

describe("accumulateMatchStats — graceful fallbacks", () => {
  it("falls back to a composite key when an event has no id", () => {
    const next = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      { type: "goal", side: "home", player: "Some Mystery", minute: 30 },
    ]));
    const compositeKey = Object.keys(next.players).find(k => k.startsWith("c|"));
    expect(compositeKey).toBeTruthy();
    expect(next.players[compositeKey].goals).toBe(1);
    expect(next.players[compositeKey].name).toBe("Some Mystery");
  });

  it("ignores events with neither id nor name", () => {
    const next = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      { type: "goal", side: "home", minute: 30 },
    ]));
    expect(Object.keys(next.players).length).toBe(0);
  });

  it("ignores events with unknown side", () => {
    const next = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      { type: "goal", side: "neutral", playerId: "p1", player: "John Smith", minute: 30 },
    ]));
    expect(next.players["p1"]?.goals || 0).toBe(0);
  });

  it("does not throw on null stats input", () => {
    expect(() => accumulateMatchStats(null, baseInput([]))).not.toThrow();
  });

  it("requires matchId — silently ignores without one", () => {
    const stats = emptyCompetitionStats();
    const next = accumulateMatchStats(stats, { result: buildResult([goalEvent()]), homeTeam, awayTeam });
    expect(next).toBe(stats);
  });
});

describe("selectors", () => {
  function buildSeason() {
    return accumulateMatchStats(emptyCompetitionStats(), baseInput([
      goalEvent({ playerId: "p1", player: "John Smith" }),
      goalEvent({ playerId: "p1", player: "John Smith", minute: 60 }),
      goalEvent({ playerId: "p4", player: "Kevin Smith", side: "away", minute: 80 }),
      cardEvent({ cardPlayerId: "p2", cardPlayer: "Roy Keane" }),
      cardEvent({ type: "red_card", cardPlayerId: "p5", cardPlayer: "Watkins", side: "away",
                  cardTeamName: "Rovers", minute: 70 }),
    ], "league:S1:T7:MD0:M0"));
  }

  it("getTopScorers sorts goals desc with deterministic tie-break", () => {
    const top = getTopScorers(buildSeason());
    expect(top[0].playerId).toBe("p1");
    expect(top[0].goals).toBe(2);
    expect(top[1].playerId).toBe("p4");
  });

  it("getTopAssisters returns assist leaders only (filters zero)", () => {
    const next = accumulateMatchStats(emptyCompetitionStats(), baseInput([
      goalEvent({ playerId: "p1", player: "John Smith", assisterId: "p2", assister: "Roy Keane" }),
    ]));
    const top = getTopAssisters(next);
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
        assists: 0, yellows: 0, reds: 0, teamName: "X", teamId: 0, position: null };
    }
    expect(getTopScorers(stats, 5).length).toBe(5);
    expect(getTopScorers(stats, 5)[0].name).toBe("P0");
  });

  it("ties break by name asc", () => {
    const stats = emptyCompetitionStats();
    stats.players["a"] = { key: "a", playerId: "a", name: "Alpha", goals: 5, assists: 0,
      yellows: 0, reds: 0, teamName: "X", teamId: 0 };
    stats.players["b"] = { key: "b", playerId: "b", name: "Beta",  goals: 5, assists: 0,
      yellows: 0, reds: 0, teamName: "X", teamId: 0 };
    stats.players["c"] = { key: "c", playerId: "c", name: "Carl",  goals: 5, assists: 0,
      yellows: 0, reds: 0, teamName: "X", teamId: 0 };
    const top = getTopScorers(stats);
    expect(top.map(p => p.name)).toEqual(["Alpha", "Beta", "Carl"]);
  });
});

describe("leagueMatchId", () => {
  it("formats season/tier/matchweek/fixture", () => {
    expect(leagueMatchId({ season: 3, tier: 7, matchweekIdx: 12, fixtureIdx: 4 }))
      .toBe("league:S3:T7:MD12:M4");
  });
});
