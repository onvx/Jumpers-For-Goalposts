import { describe, it, expect } from "vitest";
import { collectSeasonEndAchievements } from "../league.js";

// Bag Man (top scorer plays for the player's team) and Tactical Foul (most
// booked player is on the player's team) now read directly from the canonical
// seasonLeagueStats. These tests pin that behavior.

function makeLeague(playerTeamIdx = 0) {
  return {
    teams: [
      { name: "Player FC", isPlayer: playerTeamIdx === 0 },
      { name: "AI United",  isPlayer: playerTeamIdx === 1 },
    ],
    table: [
      { teamIndex: 0, points: 30, goalsFor: 20, goalsAgainst: 10, won: 10, drawn: 0, lost: 0, played: 10 },
      { teamIndex: 1, points: 10, goalsFor: 10, goalsAgainst: 20, won: 3, drawn: 1, lost: 6, played: 10 },
    ],
  };
}

function statsBlob(players) {
  return { players, processedMatches: {} };
}

const baseInput = (extras = {}) => ({
  position: 1, currentTier: 1, moveType: "stayed", newTier: 1,
  lastSeasonMove: null, beatenTeams: new Set(), unlockedAchievements: new Set(),
  clubHistory: { seasonArchive: [] }, wonCupThisSeason: false,
  squad: [], prevSeasonSquadIds: null, seasonNumber: 2,
  dynastyCupBracket: null, cup: null,
  league: makeLeague(0),
  leagueResults: {},
  playerSeasonStats: {},
  ...extras,
});

describe("collectSeasonEndAchievements — Bag Man via canonical", () => {
  it("unlocks bag_man when top scorer's teamId is the player's team idx", () => {
    const seasonLeagueStats = statsBlob({
      "p1": { key: "p1", name: "Striker", teamId: 0, teamName: "Player FC", goals: 25, assists: 0, yellows: 0, reds: 0 },
      "p2": { key: "p2", name: "Other",   teamId: 1, teamName: "AI United", goals: 18, assists: 0, yellows: 0, reds: 0 },
    });
    const achs = collectSeasonEndAchievements(baseInput({ seasonLeagueStats }));
    expect(achs).toContain("bag_man");
  });

  it("does NOT unlock bag_man when an AI team's player is top scorer", () => {
    const seasonLeagueStats = statsBlob({
      "p1": { key: "p1", name: "Striker", teamId: 0, teamName: "Player FC", goals: 18, assists: 0, yellows: 0, reds: 0 },
      "p2": { key: "p2", name: "Other",   teamId: 1, teamName: "AI United", goals: 25, assists: 0, yellows: 0, reds: 0 },
    });
    const achs = collectSeasonEndAchievements(baseInput({ seasonLeagueStats }));
    expect(achs).not.toContain("bag_man");
  });

  it("does NOT unlock bag_man when seasonLeagueStats is empty", () => {
    const achs = collectSeasonEndAchievements(baseInput({ seasonLeagueStats: statsBlob({}) }));
    expect(achs).not.toContain("bag_man");
  });

  it("respects already-unlocked state", () => {
    const seasonLeagueStats = statsBlob({
      "p1": { key: "p1", name: "Striker", teamId: 0, teamName: "Player FC", goals: 25, assists: 0, yellows: 0, reds: 0 },
    });
    const achs = collectSeasonEndAchievements(baseInput({
      seasonLeagueStats,
      unlockedAchievements: new Set(["bag_man"]),
    }));
    expect(achs).not.toContain("bag_man");
  });
});

describe("collectSeasonEndAchievements — Tactical Foul via canonical", () => {
  it("unlocks tactical_foul when most-booked player is on the player's team", () => {
    const seasonLeagueStats = statsBlob({
      "p1": { key: "p1", name: "Bruiser", teamId: 0, teamName: "Player FC", goals: 0, assists: 0, yellows: 8, reds: 1 },
      "p2": { key: "p2", name: "Other",   teamId: 1, teamName: "AI United", goals: 0, assists: 0, yellows: 5, reds: 0 },
    });
    const achs = collectSeasonEndAchievements(baseInput({ seasonLeagueStats }));
    expect(achs).toContain("tactical_foul");
  });

  it("counts yellows + reds combined for ranking", () => {
    // Player team: 5y + 0r = 5 cards. AI: 6y + 0r = 6 cards. AI wins.
    const seasonLeagueStats = statsBlob({
      "p1": { key: "p1", name: "Bruiser", teamId: 0, teamName: "Player FC", goals: 0, assists: 0, yellows: 5, reds: 0 },
      "p2": { key: "p2", name: "Other",   teamId: 1, teamName: "AI United", goals: 0, assists: 0, yellows: 6, reds: 0 },
    });
    const achs = collectSeasonEndAchievements(baseInput({ seasonLeagueStats }));
    expect(achs).not.toContain("tactical_foul");
  });
});
