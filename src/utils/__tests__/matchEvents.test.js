import { describe, it, expect } from "vitest";
import { formatScorerName, buildGoalStrip, buildScorerDisplayMap, getSurname, getInitial } from "../matchEvents.js";

describe("formatScorerName", () => {
  it("converts 'First Last' to 'F. Last'", () => {
    expect(formatScorerName("Dwight Yorke")).toBe("D. Yorke");
  });

  it("leaves 'I. Surname' unchanged", () => {
    expect(formatScorerName("R. Keane")).toBe("R. Keane");
  });

  it("adds a missing dot to 'I Surname'", () => {
    expect(formatScorerName("R Keane")).toBe("R. Keane");
  });

  it("leaves single-word names alone", () => {
    expect(formatScorerName("Pele")).toBe("Pele");
  });

  it("uppercases the initial from a lowercase first name", () => {
    expect(formatScorerName("dwight Yorke")).toBe("D. Yorke");
  });

  it("handles multi-word surnames after the first space", () => {
    expect(formatScorerName("Paul van Dijk")).toBe("P. van Dijk");
  });

  it("handles empty / invalid input without throwing", () => {
    expect(formatScorerName("")).toBe("");
    expect(formatScorerName(null)).toBe("");
    expect(formatScorerName(undefined)).toBe("");
  });

  it("is idempotent — re-formatting produces the same result", () => {
    const once = formatScorerName("Dwight Yorke");
    expect(formatScorerName(once)).toBe(once);
  });
});

describe("buildGoalStrip", () => {
  const homeGoal = { type: "goal", side: "home", player: "Dwight Yorke", assister: "R. Keane", minute: 37 };
  const awayGoal = { type: "goal", side: "away", player: "P. Kelly", assister: null, minute: 74 };
  const shot = { type: "shot", side: "home", player: "Someone", minute: 12 };
  const card = { type: "card", side: "away", cardPlayer: "Smith", minute: 55 };
  const sub = { type: "sub", side: "home", playerOff: "A", playerOn: "B", minute: 60 };

  it("returns empty columns for empty input", () => {
    expect(buildGoalStrip([])).toEqual({ home: [], away: [] });
  });

  it("returns empty columns for non-array input", () => {
    expect(buildGoalStrip(null)).toEqual({ home: [], away: [] });
    expect(buildGoalStrip(undefined)).toEqual({ home: [], away: [] });
    expect(buildGoalStrip({})).toEqual({ home: [], away: [] });
  });

  it("picks only goals, ignoring cards/subs/shots", () => {
    const strip = buildGoalStrip([shot, card, sub, homeGoal, awayGoal]);
    expect(strip.home).toHaveLength(1);
    expect(strip.away).toHaveLength(1);
    expect(strip.home[0].player).toBe("Dwight Yorke");
    expect(strip.away[0].player).toBe("P. Kelly");
  });

  it("splits by side", () => {
    const g2 = { ...homeGoal, player: "Keane", minute: 62 };
    const strip = buildGoalStrip([homeGoal, awayGoal, g2]);
    expect(strip.home.map(g => g.player)).toEqual(["Dwight Yorke", "Keane"]);
    expect(strip.away.map(g => g.player)).toEqual(["P. Kelly"]);
  });

  it("preserves event order within each side", () => {
    const a = { type: "goal", side: "home", player: "A", minute: 10 };
    const b = { type: "goal", side: "home", player: "B", minute: 30 };
    const c = { type: "goal", side: "home", player: "C", minute: 20 };
    // Input order is the timeline order, not necessarily minute order.
    const strip = buildGoalStrip([a, b, c]);
    expect(strip.home.map(g => g.player)).toEqual(["A", "B", "C"]);
  });

  it("carries assister and minute fields through", () => {
    const strip = buildGoalStrip([homeGoal]);
    expect(strip.home[0]).toEqual({ player: "Dwight Yorke", assister: "R. Keane", minute: 37 });
  });

  it("ignores goals with unknown side", () => {
    const stray = { type: "goal", side: "neutral", player: "Mystery", minute: 50 };
    const strip = buildGoalStrip([stray, homeGoal]);
    expect(strip.home).toHaveLength(1);
    expect(strip.away).toHaveLength(0);
  });

  it("tolerates a missing assister", () => {
    const strip = buildGoalStrip([awayGoal]);
    expect(strip.away[0].assister).toBeNull();
  });
});

describe("getSurname", () => {
  it("returns the last word", () => {
    expect(getSurname("Dwight Yorke")).toBe("Yorke");
    expect(getSurname("Paul van Dijk")).toBe("Dijk");
  });
  it("returns the whole string for single-word names", () => {
    expect(getSurname("Pele")).toBe("Pele");
  });
  it("returns empty for empty/invalid input", () => {
    expect(getSurname("")).toBe("");
    expect(getSurname(null)).toBe("");
  });
});

describe("getInitial", () => {
  it("uppercases the first letter of the first word", () => {
    expect(getInitial("dwight Yorke")).toBe("D");
    expect(getInitial("Paul van Dijk")).toBe("P");
  });
  it("returns empty for single-word names", () => {
    expect(getInitial("Pele")).toBe("");
  });
});

describe("buildScorerDisplayMap", () => {
  const goal = (player) => ({ type: "goal", side: "home", player, minute: 30 });

  it("returns surname-only when no collision", () => {
    const events = [goal("Dwight Yorke")];
    const players = [
      { name: "Dwight Yorke", position: "ST" },
      { name: "Roy Keane",    position: "CM" },
    ];
    expect(buildScorerDisplayMap(events, players)["Dwight Yorke"]).toBe("Yorke");
  });

  it("uses Initial. Surname when surname collides but initials differ", () => {
    const events = [goal("John Smith"), goal("Kevin Smith")];
    const players = [
      { name: "John Smith",  position: "ST" },
      { name: "Kevin Smith", position: "CB" },
    ];
    const map = buildScorerDisplayMap(events, players);
    expect(map["John Smith"]).toBe("J. Smith");
    expect(map["Kevin Smith"]).toBe("K. Smith");
  });

  it("falls back to position tag when initial+surname still collides", () => {
    const events = [goal("John Smith"), goal("Jacob Smith")];
    const players = [
      { name: "John Smith",  position: "ST" },
      { name: "Jacob Smith", position: "CB" },
    ];
    const map = buildScorerDisplayMap(events, players);
    expect(map["John Smith"]).toBe("J. Smith (ST)");
    expect(map["Jacob Smith"]).toBe("J. Smith (CB)");
  });

  it("handles surnames colliding across opposing teams", () => {
    const homeGoal = { type: "goal", side: "home", player: "John Smith", minute: 10 };
    const awayGoal = { type: "goal", side: "away", player: "Kevin Smith", minute: 50 };
    const players = [
      { name: "John Smith",  position: "ST" },
      { name: "Kevin Smith", position: "GK" },
    ];
    const map = buildScorerDisplayMap([homeGoal, awayGoal], players);
    expect(map["John Smith"]).toBe("J. Smith");
    expect(map["Kevin Smith"]).toBe("K. Smith");
  });

  it("returns full name when a single-word scorer collides with another player", () => {
    // Edge case: single-name scorer can't be initialised.
    const events = [goal("Pele")];
    const players = [
      { name: "Pele",         position: "ST" },
      { name: "Diego Pele",   position: "CM" },
    ];
    expect(buildScorerDisplayMap(events, players)["Pele"]).toBe("Pele");
  });

  it("returns empty map for no events", () => {
    expect(buildScorerDisplayMap([], [{ name: "X", position: "ST" }])).toEqual({});
  });

  it("tolerates null squad input", () => {
    const map = buildScorerDisplayMap([goal("Dwight Yorke")], null);
    expect(map["Dwight Yorke"]).toBe("Yorke");
  });

  it("ignores non-goal events", () => {
    const card = { type: "card", side: "home", cardPlayer: "John Smith", minute: 20 };
    const map = buildScorerDisplayMap([card], [{ name: "John Smith", position: "ST" }]);
    expect(map).toEqual({});
  });
});
