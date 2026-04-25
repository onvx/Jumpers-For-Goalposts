import { describe, it, expect } from "vitest";
import {
  emptyCompetitionStats,
  accumulateMatchStats,
  accumulateCupMatch,
  rollIntoAllTime,
  getTopScorers,
  getTopAssisters,
  getMostYellows,
  getMostReds,
  leagueMatchId,
  cupMatchId,
  cupKey,
  makeCupAIMatchHandler,
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

describe("cupMatchId", () => {
  it("formats season/cupName/round/home-away", () => {
    expect(cupMatchId({ season: 2, cupName: "Clubman Cup", roundIdx: 3, home: "Real Sociedad", away: "Bayern" }))
      .toBe("cup:S2:Clubman_Cup:R3:Real_Sociedad-Bayern");
  });

  it("sanitises non-alphanumeric chars in names", () => {
    expect(cupMatchId({ season: 1, cupName: "Sub Money Cup", roundIdx: 0, home: "FC O'Brien", away: "1.FC Köln" }))
      .toBe("cup:S1:Sub_Money_Cup:R0:FC_O_Brien-1_FC_K_ln");
  });

  it("home/away order produces different ids", () => {
    const a = cupMatchId({ season: 1, cupName: "Cup", roundIdx: 0, home: "A", away: "B" });
    const b = cupMatchId({ season: 1, cupName: "Cup", roundIdx: 0, home: "B", away: "A" });
    expect(a).not.toBe(b);
  });
});

describe("cupKey", () => {
  it("slugs the cup name into a stable index key", () => {
    expect(cupKey("Clubman Cup")).toBe("Clubman_Cup");
    expect(cupKey("Sub Money Cup")).toBe("Sub_Money_Cup");
    expect(cupKey("Global Cup")).toBe("Global_Cup");
  });

  it("collapses non-alphanumerics", () => {
    expect(cupKey("FA-Cup!")).toBe("FA_Cup");
    expect(cupKey("  Padded  ")).toBe("Padded");
  });

  it("handles missing names without throwing", () => {
    expect(cupKey(undefined)).toBe("_");
    expect(cupKey(null)).toBe("_");
  });
});

describe("makeCupAIMatchHandler — routes by cupKey", () => {
  it("writes events into seasonCupStatsByCup[cupKey] for the named cup", () => {
    const home = { name: "Athletic", squad: [{ id: "ah1", name: "Iker", position: "ST" }] };
    const away = { name: "Sporting", squad: [{ id: "sa1", name: "Diogo", position: "CM" }] };
    let store = {};
    const setSeasonCupStatsByCup = (updater) => { store = updater(store); };
    const handler = makeCupAIMatchHandler(setSeasonCupStatsByCup, 1, "Clubman Cup");
    handler(home, away, {
      homeGoals: 2, awayGoals: 0,
      events: [
        { type: "goal", side: "home", playerId: "ah1", player: "Iker", minute: 30 },
        { type: "goal", side: "home", playerId: "ah1", player: "Iker", minute: 70 },
      ],
    }, 0);
    expect(store["Clubman_Cup"].players["ah1"].goals).toBe(2);
    expect(store["Sub_Money_Cup"]).toBeUndefined();
  });

  it("different cup names accumulate into different slots", () => {
    const home = { name: "City", squad: [{ id: "p1", name: "Joe", position: "ST" }] };
    const away = { name: "Rovers", squad: [{ id: "p2", name: "Mike", position: "ST" }] };
    let store = {};
    const set = (u) => { store = u(store); };
    makeCupAIMatchHandler(set, 1, "Clubman Cup")(home, away, {
      homeGoals: 1, awayGoals: 0,
      events: [{ type: "goal", side: "home", playerId: "p1", player: "Joe", minute: 30 }],
    }, 0);
    makeCupAIMatchHandler(set, 1, "Sub Money Cup")(home, away, {
      homeGoals: 0, awayGoals: 1,
      events: [{ type: "goal", side: "away", playerId: "p2", player: "Mike", minute: 60 }],
    }, 0);
    expect(store["Clubman_Cup"].players["p1"].goals).toBe(1);
    expect(store["Sub_Money_Cup"].players["p2"].goals).toBe(1);
    expect(store["Clubman_Cup"].players["p2"]).toBeUndefined();
    expect(store["Sub_Money_Cup"].players["p1"]).toBeUndefined();
  });
});

describe("rollIntoAllTime", () => {
  function seasonWith(players) {
    return { players, processedMatches: {} };
  }

  it("folds a season's player entries into an empty all-time blob", () => {
    const season = seasonWith({
      "p1": { key: "p1", playerId: "p1", name: "Alice", teamId: 0, teamName: "City",
              goals: 5, assists: 2, yellows: 1, reds: 0, position: "ST" },
    });
    const allTime = rollIntoAllTime(emptyCompetitionStats(), season);
    expect(allTime.players["p1"].goals).toBe(5);
    expect(allTime.players["p1"].assists).toBe(2);
    expect(allTime.players["p1"].yellows).toBe(1);
    expect(allTime.players["p1"].teamName).toBe("City");
  });

  it("adds onto existing all-time totals for the same key", () => {
    let allTime = rollIntoAllTime(emptyCompetitionStats(), seasonWith({
      "p1": { key: "p1", playerId: "p1", name: "Alice", teamId: 0, teamName: "City",
              goals: 5, assists: 2, yellows: 1, reds: 0 },
    }));
    allTime = rollIntoAllTime(allTime, seasonWith({
      "p1": { key: "p1", playerId: "p1", name: "Alice", teamId: 0, teamName: "City",
              goals: 7, assists: 3, yellows: 0, reds: 1 },
    }));
    expect(allTime.players["p1"].goals).toBe(12);
    expect(allTime.players["p1"].assists).toBe(5);
    expect(allTime.players["p1"].yellows).toBe(1);
    expect(allTime.players["p1"].reds).toBe(1);
  });

  it("returns the same all-time reference when the season is empty", () => {
    const allTime = emptyCompetitionStats();
    expect(rollIntoAllTime(allTime, emptyCompetitionStats())).toBe(allTime);
  });

  it("does not carry processedMatches from season", () => {
    const allTime = emptyCompetitionStats();
    const season = { players: { "p1": { key: "p1", name: "A", goals: 1, assists: 0, yellows: 0, reds: 0 } }, processedMatches: { "match-x": true } };
    const next = rollIntoAllTime(allTime, season);
    expect(next.processedMatches["match-x"]).toBeUndefined();
  });
});

describe("rollIntoAllTime — tier-scoped usage", () => {
  // The store now keeps a tier-scoped map (`allTimeLeagueStatsByTier`); the
  // tests below pin the contract that callers compose by passing the right
  // tier slot in/out. Different tiers are completely isolated.
  it("crediting a season into one tier slot does not affect a different tier", () => {
    const byTier = {
      7: { players: { "p1": { key: "p1", name: "Rookie", teamName: "Athletic",
                              goals: 4, assists: 0, yellows: 0, reds: 0 } }, processedMatches: {} },
    };
    const seasonAtTier8 = { players: { "p2": { key: "p2", name: "Vet", teamName: "City",
                                               goals: 3, assists: 0, yellows: 0, reds: 0 } }, processedMatches: {} };
    const next = { ...byTier, 8: rollIntoAllTime(byTier[8], seasonAtTier8) };
    expect(next[7].players["p1"].goals).toBe(4);
    expect(next[8].players["p2"].goals).toBe(3);
    expect(next[7].players["p2"]).toBeUndefined();
    expect(next[8].players["p1"]).toBeUndefined();
  });
});

describe("accumulateCupMatch", () => {
  const cupHome = {
    name: "Athletic", squad: [{ id: "ah1", name: "Iker", position: "ST" }],
  };
  const cupAway = {
    name: "Sporting", squad: [{ id: "sa1", name: "Diogo", position: "CM" }],
  };
  const cupResult = {
    homeGoals: 1, awayGoals: 0,
    events: [
      { type: "goal", side: "home", playerId: "ah1", player: "Iker", minute: 30 },
      { type: "card", side: "away", cardPlayerId: "sa1", cardPlayer: "Diogo", minute: 60 },
    ],
  };

  it("credits cup goals and cards using the team-name fallback id", () => {
    const next = accumulateCupMatch(emptyCompetitionStats(), {
      home: cupHome, away: cupAway, result: cupResult,
      season: 1, cupName: "Clubman", roundIdx: 0,
    });
    expect(next.players["ah1"].goals).toBe(1);
    expect(next.players["ah1"].teamId).toBe("Athletic");
    expect(next.players["sa1"].yellows).toBe(1);
    expect(next.players["sa1"].teamId).toBe("Sporting");
  });

  it("is idempotent across same cup matchId", () => {
    let stats = accumulateCupMatch(emptyCompetitionStats(), {
      home: cupHome, away: cupAway, result: cupResult,
      season: 1, cupName: "Clubman", roundIdx: 0,
    });
    const same = accumulateCupMatch(stats, {
      home: cupHome, away: cupAway, result: cupResult,
      season: 1, cupName: "Clubman", roundIdx: 0,
    });
    expect(same).toBe(stats);
    expect(stats.players["ah1"].goals).toBe(1);
  });

  it("returns input unchanged when home, away or result is missing", () => {
    const stats = emptyCompetitionStats();
    expect(accumulateCupMatch(stats, { home: null, away: cupAway, result: cupResult, season: 1, cupName: "Cup", roundIdx: 0 })).toBe(stats);
    expect(accumulateCupMatch(stats, { home: cupHome, away: null, result: cupResult, season: 1, cupName: "Cup", roundIdx: 0 })).toBe(stats);
    expect(accumulateCupMatch(stats, { home: cupHome, away: cupAway, result: null, season: 1, cupName: "Cup", roundIdx: 0 })).toBe(stats);
  });
});
