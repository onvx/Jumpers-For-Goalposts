import { describe, it, expect } from "vitest";
import { archivePlayerSeason, deriveCupLabels } from "../careerLedger.js";

// === Fixtures ===============================================================

const SQUAD = [
  { id: "p1", name: "Remy Diaby",   position: "ST" },
  { id: "p2", name: "Iker Hernando", position: "CM" },
  { id: "p3", name: "Bob Bench",    position: "GK" },
];

const PLAYER_TIER_TEAM_ID = 0;

function tierStatsBlob(playersByPid) {
  const players = {};
  for (const [pid, fields] of Object.entries(playersByPid)) {
    players[pid] = {
      key: pid,
      playerId: pid,
      name: fields.name || "",
      teamId: fields.teamId ?? PLAYER_TIER_TEAM_ID,
      teamName: fields.teamName || "Player FC",
      position: fields.position || "ST",
      goals: fields.goals || 0,
      assists: fields.assists || 0,
      yellows: fields.yellows || 0,
      reds: fields.reds || 0,
    };
  }
  return { players, processedMatches: {} };
}

function seasonStats(byName) {
  // Shape mirrors the existing playerSeasonStats: name-keyed broad totals.
  const out = {};
  for (const [name, fields] of Object.entries(byName)) {
    out[name] = {
      goals: fields.goals || 0,
      assists: fields.assists || 0,
      apps: fields.apps || 0,
      motm: fields.motm || 0,
      yellows: fields.yellows || 0,
      reds: fields.reds || 0,
    };
  }
  return out;
}

const baseInput = (overrides = {}) => ({
  squad: SQUAD,
  playerSeasonStats: seasonStats({
    "Remy Diaby":    { goals: 10, assists: 4, apps: 18, motm: 3, yellows: 2, reds: 0 },
    "Iker Hernando": { goals: 1,  assists: 8, apps: 18, motm: 1, yellows: 1, reds: 0 },
  }),
  playerTierSeasonStats: tierStatsBlob({
    p1: { name: "Remy Diaby",    position: "ST", goals: 8, assists: 3, yellows: 2 },
    p2: { name: "Iker Hernando", position: "CM", goals: 1, assists: 7, yellows: 1 },
  }),
  seasonCupStatsByCup: {
    Clubman_Cup: tierStatsBlob({
      p1: { name: "Remy Diaby", position: "ST", goals: 2, assists: 1, teamName: "Player FC", teamId: "Player FC" },
    }),
  },
  cupLabels: { Clubman_Cup: "Clubman Cup" },
  playerRatingTracker: { p1: [7.5, 8.0, 7.0] },
  playerRatingNames: { p1: "Remy Diaby", p2: "Iker Hernando" },
  season: 3,
  tier: 8,
  leagueName: "Sunday League",
  ...overrides,
});

// =============================================================================

describe("archivePlayerSeason — broad totals (existing contract)", () => {
  it("creates fresh careers with broad season totals on first archive", () => {
    const next = archivePlayerSeason({}, baseInput());
    const remy = next["Remy Diaby"];
    expect(remy).toBeTruthy();
    expect(remy.goals).toBe(10);
    expect(remy.assists).toBe(4);
    expect(remy.apps).toBe(18);
    expect(remy.motm).toBe(3);
    expect(remy.yellows).toBe(2);
    expect(remy.reds).toBe(0);
    expect(remy.seasons).toHaveLength(1);
    expect(remy.seasons[0].season).toBe(3);
    expect(remy.seasons[0].avgRating).toBe(7.5); // (7.5+8+7)/3
    expect(remy.playerId).toBe("p1");
  });

  it("accumulates broad totals across multiple seasons", () => {
    const s1 = archivePlayerSeason({}, baseInput());
    const s2 = archivePlayerSeason(s1, baseInput({
      season: 4,
      playerSeasonStats: seasonStats({
        "Remy Diaby": { goals: 12, assists: 5, apps: 18, motm: 2, yellows: 1, reds: 0 },
      }),
      playerTierSeasonStats: tierStatsBlob({
        p1: { name: "Remy Diaby", position: "ST", goals: 11, assists: 4, yellows: 1 },
      }),
      seasonCupStatsByCup: {
        Clubman_Cup: tierStatsBlob({
          p1: { name: "Remy Diaby", position: "ST", goals: 1, assists: 1 },
        }),
      },
    }));
    const remy = s2["Remy Diaby"];
    expect(remy.goals).toBe(22);
    expect(remy.assists).toBe(9);
    expect(remy.apps).toBe(36);
    expect(remy.seasons).toHaveLength(2);
  });
});

describe("archivePlayerSeason — per-competition breakdown", () => {
  it("splits goals/assists/yellows/reds by league tier and cup", () => {
    const next = archivePlayerSeason({}, baseInput());
    const remy = next["Remy Diaby"];
    expect(remy.competitions["league:T8"]).toMatchObject({
      type: "league", tier: 8, label: "Sunday League",
      goals: 8, assists: 3, yellows: 2, reds: 0,
    });
    expect(remy.competitions["Clubman_Cup"]).toMatchObject({
      type: "cup", label: "Clubman Cup",
      goals: 2, assists: 1, yellows: 0, reds: 0,
    });
  });

  it("season entry carries per-competition split too", () => {
    const next = archivePlayerSeason({}, baseInput());
    const remy = next["Remy Diaby"];
    const s = remy.seasons[0];
    expect(s.competitions.league).toMatchObject({
      key: "league:T8", tier: 8, goals: 8, assists: 3, yellows: 2,
    });
    expect(s.competitions.cups.Clubman_Cup).toMatchObject({
      key: "Clubman_Cup", type: "cup", goals: 2, assists: 1,
    });
  });

  it("does NOT split apps or motm per competition (canonical doesn't track them)", () => {
    const next = archivePlayerSeason({}, baseInput());
    const leagueComp = next["Remy Diaby"].competitions["league:T8"];
    expect(leagueComp.apps).toBeUndefined();
    expect(leagueComp.motm).toBeUndefined();
  });

  it("Div 8 and Div 7 stats stay separate when player moves tier", () => {
    const s1 = archivePlayerSeason({}, baseInput()); // Div 8, Remy 8 league goals
    const s2 = archivePlayerSeason(s1, baseInput({
      season: 4,
      tier: 7,
      leagueName: "Wessex League",
      playerSeasonStats: seasonStats({
        "Remy Diaby": { goals: 14, assists: 6, apps: 18, motm: 4 },
      }),
      playerTierSeasonStats: tierStatsBlob({
        p1: { name: "Remy Diaby", position: "ST", goals: 14, assists: 6 },
      }),
      seasonCupStatsByCup: {},
    }));
    const remy = s2["Remy Diaby"];
    expect(remy.competitions["league:T8"].goals).toBe(8);
    expect(remy.competitions["league:T7"].goals).toBe(14);
    expect(remy.competitions["league:T8"].label).toBe("Sunday League");
    expect(remy.competitions["league:T7"].label).toBe("Wessex League");
  });

  it("two cups stay separate", () => {
    const next = archivePlayerSeason({}, baseInput({
      seasonCupStatsByCup: {
        Clubman_Cup: tierStatsBlob({ p1: { name: "Remy Diaby", position: "ST", goals: 2 } }),
        Sub_Money_Cup: tierStatsBlob({ p1: { name: "Remy Diaby", position: "ST", goals: 5 } }),
      },
      cupLabels: { Clubman_Cup: "Clubman Cup", Sub_Money_Cup: "Sub Money Cup" },
    }));
    const remy = next["Remy Diaby"];
    expect(remy.competitions["Clubman_Cup"].goals).toBe(2);
    expect(remy.competitions["Sub_Money_Cup"].goals).toBe(5);
    expect(remy.competitions["Clubman_Cup"]).not.toBe(remy.competitions["Sub_Money_Cup"]);
  });

  it("accumulates the same competition across multiple seasons in the cumulative index", () => {
    const s1 = archivePlayerSeason({}, baseInput()); // T8: 8 goals
    const s2 = archivePlayerSeason(s1, baseInput({
      season: 4,
      playerSeasonStats: seasonStats({
        "Remy Diaby": { goals: 9, apps: 18, motm: 1 },
      }),
      playerTierSeasonStats: tierStatsBlob({
        p1: { name: "Remy Diaby", position: "ST", goals: 9 },
      }),
      seasonCupStatsByCup: {},
    }));
    const t8 = s2["Remy Diaby"].competitions["league:T8"];
    expect(t8.goals).toBe(17);
    expect(t8.seasons).toHaveLength(2);
    expect(t8.seasons[0]).toMatchObject({ season: 3, goals: 8 });
    expect(t8.seasons[1]).toMatchObject({ season: 4, goals: 9 });
  });
});

describe("archivePlayerSeason — old-careers migration safety", () => {
  it("preserves existing broad-only careers without a competitions field", () => {
    const old = {
      "Old Legend": {
        goals: 50, assists: 20, apps: 100, motm: 10, yellows: 8, reds: 1,
        seasons: [{ season: 1, goals: 50, assists: 20 }],
        // NOTE: no competitions field, no playerId
        retiredAttrs: { pace: 18, shooting: 19 },
        retiredSeason: 2,
      },
    };
    // Old legend isn't in the squad and isn't in playerSeasonStats, so it
    // should be left untouched.
    const next = archivePlayerSeason(old, baseInput());
    expect(next["Old Legend"]).toBe(old["Old Legend"]); // untouched reference
  });

  it("a current player with an old-style entry only gets the new season appended", () => {
    const old = {
      "Remy Diaby": {
        goals: 5, assists: 1, apps: 10, motm: 0, yellows: 0, reds: 0,
        seasons: [{ season: 1, goals: 5, assists: 1, apps: 10, motm: 0 }],
        // No competitions, no playerId
      },
    };
    const next = archivePlayerSeason(old, baseInput());
    const remy = next["Remy Diaby"];
    // Broad totals add to existing
    expect(remy.goals).toBe(15); // 5 + 10
    expect(remy.apps).toBe(28);  // 10 + 18
    // Existing season entry preserved, new one appended
    expect(remy.seasons).toHaveLength(2);
    expect(remy.seasons[0]).toMatchObject({ season: 1, goals: 5 });
    expect(remy.seasons[1].season).toBe(3);
    // New entry has competitions; old entry is left alone
    expect(remy.seasons[1].competitions).toBeTruthy();
    expect(remy.seasons[0].competitions).toBeUndefined();
    // New season stats fed the cumulative index from this point on
    expect(remy.competitions["league:T8"].goals).toBe(8);
    // playerId picked up
    expect(remy.playerId).toBe("p1");
  });
});

describe("archivePlayerSeason — playerId vs name keying", () => {
  it("merges into an existing entry by playerId even if the name has changed", () => {
    const old = {
      "Old Name": {
        playerId: "p1",
        goals: 7, assists: 2, apps: 10, motm: 1, yellows: 0, reds: 0,
        seasons: [{ season: 1, goals: 7 }],
        competitions: {},
      },
    };
    const next = archivePlayerSeason(old, baseInput());
    // Existing key is preserved (no blind duplication under the new name)
    expect(next["Old Name"]).toBeTruthy();
    expect(next["Remy Diaby"]).toBeUndefined();
    expect(next["Old Name"].goals).toBe(17); // 7 + 10
    expect(next["Old Name"].playerId).toBe("p1");
  });

  it("does not lose the playerId once recorded", () => {
    const s1 = archivePlayerSeason({}, baseInput());
    expect(s1["Remy Diaby"].playerId).toBe("p1");
    // Second archive without a squad entry (e.g. retired) — input.squad
    // empty, so playerId can't be re-derived. Existing playerId must stay.
    const s2 = archivePlayerSeason(s1, baseInput({
      squad: [],
      playerTierSeasonStats: null,
      seasonCupStatsByCup: {},
      playerSeasonStats: seasonStats({
        "Remy Diaby": { goals: 1, assists: 0, apps: 1, motm: 0 },
      }),
    }));
    expect(s2["Remy Diaby"].playerId).toBe("p1");
  });
});

describe("archivePlayerSeason — purity", () => {
  it("does not mutate the input playerCareers object", () => {
    const old = {
      "Remy Diaby": {
        goals: 5, assists: 1, apps: 10, motm: 0, yellows: 0, reds: 0,
        seasons: [{ season: 1, goals: 5 }],
      },
    };
    const before = JSON.stringify(old);
    archivePlayerSeason(old, baseInput());
    expect(JSON.stringify(old)).toBe(before);
  });
});

describe("archivePlayerSeason — composite-key fallback for id-less canonical events", () => {
  it("matches by composite key when one player's canonical entry lost its id", () => {
    // Realistic edge case: the squad has stable ids, but one player's
    // canonical entry came through name-only (e.g. an old event). The
    // helper still finds it via composite key, using teamId derived from
    // a sibling squad member's id-keyed entry.
    const tierBlob = {
      players: {
        // Iker's entry is id-keyed → tells the helper teamId is 0
        p2: { key: "p2", playerId: "p2", name: "Iker Hernando",
              teamId: 0, teamName: "Player FC", position: "CM",
              goals: 1, assists: 0, yellows: 0, reds: 0 },
        // Remy's entry is composite-keyed (no playerId)
        "c|0|Remy Diaby|ST": {
          key: "c|0|Remy Diaby|ST", playerId: null, name: "Remy Diaby",
          teamId: 0, teamName: "Player FC", position: "ST",
          goals: 4, assists: 1, yellows: 0, reds: 0,
        },
      },
      processedMatches: {},
    };
    const next = archivePlayerSeason({}, {
      ...baseInput(),
      playerTierSeasonStats: tierBlob,
      seasonCupStatsByCup: {},
      playerSeasonStats: seasonStats({
        "Remy Diaby": { goals: 4, assists: 1, apps: 5, motm: 0 },
        "Iker Hernando": { goals: 1, assists: 0, apps: 5, motm: 0 },
      }),
    });
    expect(next["Remy Diaby"].competitions["league:T8"].goals).toBe(4);
    expect(next["Iker Hernando"].competitions["league:T8"].goals).toBe(1);
  });
});

describe("deriveCupLabels", () => {
  it("includes the active cup's name", () => {
    expect(deriveCupLabels({ cupName: "Clubman Cup" })).toEqual({ Clubman_Cup: "Clubman Cup" });
  });

  it("merges extra sources of cupName strings", () => {
    expect(deriveCupLabels(null, { a: "Sub Money Cup", b: "Clubman Cup" })).toEqual({
      Sub_Money_Cup: "Sub Money Cup", Clubman_Cup: "Clubman Cup",
    });
  });
});
