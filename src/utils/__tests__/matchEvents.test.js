import { describe, it, expect } from "vitest";
import { formatScorerName, buildGoalStrip } from "../matchEvents.js";

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
