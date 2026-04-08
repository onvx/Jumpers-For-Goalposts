/**
 * Lone Star Effect
 * If you invest heavily in one player (breakouts, training, tickets),
 * does individual brilliance translate to team results?
 * Tests: one high-OVR player on an otherwise average team vs balanced teams.
 */

import { simulateMatch } from '../../src/utils/match.js';
import { generateAITeam } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';
import { ATTRIBUTES } from '../../src/data/training.js';

const N = parseInt(process.argv[2]) || 5000;

function starterAvgOVR(team) {
  const starters = team.squad.filter(p => !p.isBench);
  return starters.reduce((s, p) => s + getOverall(p), 0) / starters.length;
}

function makeStarTeam(tier, starOVR, starPosition) {
  const team = generateAITeam("Star FC", "#ffd700", 0.5, "gritty", tier, 0, 0, null);
  // Find the player in the target position and boost them
  const starIdx = team.squad.findIndex(p => p.position === starPosition && !p.isBench);
  if (starIdx === -1) return team;

  const star = { ...team.squad[starIdx], attrs: { ...team.squad[starIdx].attrs } };
  // Set all attrs to starOVR level
  ATTRIBUTES.forEach(({ key }) => {
    star.attrs[key] = starOVR;
  });
  team.squad[starIdx] = star;
  return team;
}

console.log(`\n=== LONE STAR EFFECT (${N} matches per scenario) ===\n`);

// Test at tier 7 (mid-range, OVR 7-9)
const tier = 7;
const def = LEAGUE_DEFS[tier];
const opponent = generateAITeam(def.teams[0].name, def.teams[0].color, def.teams[0].strength, def.teams[0].trait, tier, 0, 0);
const oppOVR = starterAvgOVR(opponent);

console.log(`  Opponent: ${opponent.name} (avg OVR ${oppOVR.toFixed(1)})\n`);

const scenarios = [
  { label: "Balanced team (str 0.5)", makeFn: () => generateAITeam("Balanced FC", "#888", 0.5, "gritty", tier, 0, 0, null), desc: "No star" },
  { label: "Balanced team (str 0.7)", makeFn: () => generateAITeam("Good FC", "#888", 0.7, "gritty", tier, 0, 0, null), desc: "No star, stronger" },
  { label: "Star ST (OVR 14) on avg team", makeFn: () => makeStarTeam(tier, 14, "ST"), desc: "+6 OVR star striker" },
  { label: "Star ST (OVR 18) on avg team", makeFn: () => makeStarTeam(tier, 18, "ST"), desc: "+10 OVR star striker" },
  { label: "Star CM (OVR 14) on avg team", makeFn: () => makeStarTeam(tier, 14, "CM"), desc: "+6 OVR star midfielder" },
  { label: "Star CB (OVR 14) on avg team", makeFn: () => makeStarTeam(tier, 14, "CB"), desc: "+6 OVR star defender" },
  { label: "Star GK (OVR 14) on avg team", makeFn: () => makeStarTeam(tier, 14, "GK"), desc: "+6 OVR star keeper" },
  { label: "Star LW (OVR 14) on avg team", makeFn: () => makeStarTeam(tier, 14, "LW"), desc: "+6 OVR star winger" },
  { label: "Two stars (ST+CM OVR 14)", makeFn: () => { const t = makeStarTeam(tier, 14, "ST"); const cm = t.squad.findIndex(p => p.position === "CM" && !p.isBench); if (cm >= 0) { t.squad[cm] = { ...t.squad[cm], attrs: {} }; ATTRIBUTES.forEach(({ key }) => { t.squad[cm].attrs[key] = 14; }); } return t; }, desc: "Two +6 OVR stars" },
  { label: "Three stars (ST+CM+CB OVR 14)", makeFn: () => { const t = makeStarTeam(tier, 14, "ST"); for (const pos of ["CM", "CB"]) { const idx = t.squad.findIndex(p => p.position === pos && !p.isBench); if (idx >= 0) { t.squad[idx] = { ...t.squad[idx], attrs: {} }; ATTRIBUTES.forEach(({ key }) => { t.squad[idx].attrs[key] = 14; }); } } return t; }, desc: "Three +6 OVR stars" },
];

console.log(`  Scenario                          | Team OVR | Win%   | Draw%  | Loss%  | GF/m  | GA/m  | GD/m`);
console.log(`  ----------------------------------|----------|--------|--------|--------|-------|-------|------`);

for (const sc of scenarios) {
  let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
  let totalTeamOVR = 0;

  for (let i = 0; i < N; i++) {
    const team = sc.makeFn();
    totalTeamOVR += starterAvgOVR(team);

    // Alternate home/away for fairness
    const isHome = i % 2 === 0;
    const home = isHome ? team : opponent;
    const away = isHome ? opponent : team;
    const result = simulateMatch(home, away, null, null, false, 1.0, 0, null, 0, {});

    const teamGoals = isHome ? result.homeGoals : result.awayGoals;
    const oppGoals = isHome ? result.awayGoals : result.homeGoals;
    gf += teamGoals;
    ga += oppGoals;
    if (teamGoals > oppGoals) wins++;
    else if (teamGoals < oppGoals) losses++;
    else draws++;
  }

  const avgTeamOVR = totalTeamOVR / N;
  console.log(`  ${sc.label.padEnd(35)} | ${avgTeamOVR.toFixed(1).padStart(8)} | ${(wins/N*100).toFixed(1).padStart(5)}% | ${(draws/N*100).toFixed(1).padStart(5)}% | ${(losses/N*100).toFixed(1).padStart(5)}% | ${(gf/N).toFixed(2).padStart(5)} | ${(ga/N).toFixed(2).padStart(5)} | ${((gf-ga)/N).toFixed(2).padStart(5)}`);
}

// Deeper: does the star player's POSITION matter for goal contribution?
console.log(`\n--- Star Player Goal Contribution by Position ---`);
console.log(`  Testing OVR 16 star in each position on a T7 avg team, ${N} matches\n`);

const positionTests = ["GK", "CB", "LB", "RB", "CM", "AM", "LW", "RW", "ST"];
console.log(`  Position | Team OVR | Star scores (%) | Star assists (%) | Win% | Notes`);
console.log(`  ---------|----------|-----------------|------------------|------|------`);

for (const pos of positionTests) {
  const team = makeStarTeam(tier, 16, pos);
  const teamOVR = starterAvgOVR(team);
  const starName = team.squad.find(p => p.position === pos && getOverall(p) >= 15)?.name;
  let wins = 0, starGoals = 0, starAssists = 0, totalGoals = 0;

  for (let i = 0; i < N; i++) {
    const isHome = i % 2 === 0;
    const side = isHome ? "home" : "away";
    const home = isHome ? team : opponent;
    const away = isHome ? opponent : team;
    const result = simulateMatch(home, away, null, null, false, 1.0, 0, null, 0, {});

    const teamGoals = isHome ? result.homeGoals : result.awayGoals;
    const oppGoals = isHome ? result.awayGoals : result.homeGoals;
    if (teamGoals > oppGoals) wins++;
    totalGoals += teamGoals;

    if (starName && result.scorers) {
      const key = `${side}|${starName}`;
      starGoals += result.scorers[key] || 0;
    }
    if (starName && result.assisters) {
      const key = `${side}|${starName}`;
      starAssists += result.assisters[key] || 0;
    }
  }

  const goalPct = totalGoals > 0 ? (starGoals / totalGoals * 100).toFixed(1) : '0.0';
  const assistPct = totalGoals > 0 ? (starAssists / totalGoals * 100).toFixed(1) : '0.0';
  const note = pos === "GK" ? "(GK rarely scores)" : "";
  console.log(`  ${pos.padEnd(9)} | ${teamOVR.toFixed(1).padStart(8)} | ${goalPct.padStart(14)}% | ${assistPct.padStart(15)}% | ${(wins/N*100).toFixed(1).padStart(4)}% | ${note}`);
}
