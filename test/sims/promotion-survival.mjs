/**
 * Promotion Survival Analysis
 * Simulates what happens when a team from a lower tier enters a higher tier league.
 * - Does the promoted team immediately get relegated?
 * - How does their OVR compare to the new league?
 * - Does evolveAISquad help them catch up over multiple seasons?
 * - Yo-yo effect: if they survive, do they stabilize?
 */

import { simulateMatch, generateFixtures } from '../../src/utils/match.js';
import { generateAITeam, evolveAISquad, generateSquadPhilosophy } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';

const TRIALS = parseInt(process.argv[2]) || 200;
const MULTI_SEASON_TRIALS = 50;
const MAX_SEASONS = 10;

function starterAvgOVR(squad) {
  const starters = squad.filter(p => !p.isBench);
  if (starters.length === 0) return 0;
  return starters.reduce((s, p) => s + getOverall(p), 0) / starters.length;
}

function runLeagueSeason(teams) {
  const teamCount = teams.length;
  const fixtures = generateFixtures(teamCount);
  const table = teams.map((_, i) => ({
    teamIndex: i, played: 0, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, points: 0,
  }));

  for (const week of fixtures) {
    for (const fix of week) {
      const result = simulateMatch(teams[fix.home], teams[fix.away], null, null, false, 1.0, 0, null, 0, {});
      const hr = table[fix.home];
      const ar = table[fix.away];
      hr.played++; ar.played++;
      hr.goalsFor += result.homeGoals; hr.goalsAgainst += result.awayGoals;
      ar.goalsFor += result.awayGoals; ar.goalsAgainst += result.homeGoals;
      if (result.homeGoals > result.awayGoals) { hr.wins++; hr.points += 3; ar.losses++; }
      else if (result.homeGoals < result.awayGoals) { ar.wins++; ar.points += 3; hr.losses++; }
      else { hr.draws++; hr.points += 1; ar.draws++; ar.points += 1; }
    }
  }

  table.sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst));
  return table;
}

console.log(`\n=== PROMOTION SURVIVAL ANALYSIS ===\n`);

// Test various promotion scenarios
const scenarios = [
  { from: 11, to: 10, label: "T11 → T10" },
  { from: 10, to: 9, label: "T10 → T9" },
  { from: 9, to: 8, label: "T9 → T8" },
  { from: 8, to: 7, label: "T8 → T7" },
  { from: 7, to: 6, label: "T7 → T6" },
  { from: 6, to: 5, label: "T6 → T5" },
  { from: 5, to: 4, label: "T5 → T4" },
  { from: 4, to: 3, label: "T4 → T3" },
  { from: 3, to: 2, label: "T3 → T2" },
  { from: 2, to: 1, label: "T2 → T1" },
];

console.log(`--- Single Season: Where does the promoted team finish? (${TRIALS} trials each) ---\n`);
console.log(`  Scenario       | Prom OVR | League OVR | Gap  | Last | Bot 3 | Mid  | Top 3 | 1st  | Avg Pos`);
console.log(`  ---------------|----------|------------|------|------|-------|------|-------|------|--------`);

for (const sc of scenarios) {
  const destDef = LEAGUE_DEFS[sc.to];
  const positions = [];
  let totalPromOVR = 0;
  let totalLeagueOVR = 0;

  for (let trial = 0; trial < TRIALS; trial++) {
    // Generate the promoted team from the LOWER tier (strongest team, just won the league)
    const fromDef = LEAGUE_DEFS[sc.from];
    const promoted = generateAITeam("Promoted FC", "#4ade80", 0.85, fromDef.teams[0].trait, sc.from, 0, 0, null);

    // Generate the rest of the league from the HIGHER tier (minus one team = the relegated one)
    const destTeams = destDef.teams.slice(0, -1); // drop weakest
    const leagueTeams = [promoted];
    for (const t of destTeams) {
      leagueTeams.push(generateAITeam(t.name, t.color, t.strength, t.trait, sc.to, 0, 0, t.natMix));
    }

    const promOVR = starterAvgOVR(promoted.squad);
    const othersOVR = leagueTeams.slice(1).map(t => starterAvgOVR(t.squad));
    const avgOthers = othersOVR.reduce((s, v) => s + v, 0) / othersOVR.length;
    totalPromOVR += promOVR;
    totalLeagueOVR += avgOthers;

    // Run a season
    const table = runLeagueSeason(leagueTeams);
    const promPos = table.findIndex(r => r.teamIndex === 0) + 1;
    positions.push(promPos);
  }

  const teamCount = destDef.teams.length;
  const avgPos = positions.reduce((s, p) => s + p, 0) / positions.length;
  const last = positions.filter(p => p === teamCount).length / TRIALS * 100;
  const bot3 = positions.filter(p => p >= teamCount - 2).length / TRIALS * 100;
  const mid = positions.filter(p => p >= 4 && p <= teamCount - 3).length / TRIALS * 100;
  const top3 = positions.filter(p => p <= 3).length / TRIALS * 100;
  const first = positions.filter(p => p === 1).length / TRIALS * 100;
  const avgProm = totalPromOVR / TRIALS;
  const avgLeague = totalLeagueOVR / TRIALS;
  const gap = avgLeague - avgProm;

  console.log(`  ${sc.label.padEnd(15)} | ${avgProm.toFixed(1).padStart(8)} | ${avgLeague.toFixed(1).padStart(10)} | ${gap.toFixed(1).padStart(4)} | ${last.toFixed(0).padStart(4)}% | ${bot3.toFixed(0).padStart(5)}% | ${mid.toFixed(0).padStart(4)}% | ${top3.toFixed(0).padStart(5)}% | ${first.toFixed(0).padStart(4)}% | ${avgPos.toFixed(1).padStart(6)}`);
}

// Multi-season: track a promoted team over multiple seasons with evolveAISquad
console.log(`\n--- Multi-Season Tracking: Promoted team over ${MAX_SEASONS} seasons (${MULTI_SEASON_TRIALS} trials) ---`);
console.log(`  Simulating T8 → T7 promotion with between-season evolution\n`);

const multiResults = [];

for (let trial = 0; trial < MULTI_SEASON_TRIALS; trial++) {
  const destTier = 7;
  const destDef = LEAGUE_DEFS[destTier];
  const fromDef = LEAGUE_DEFS[8];

  // Promoted team
  let promSquad = generateAITeam("Promoted FC", "#4ade80", 0.85, "gritty", 8, 0, 0, null).squad;
  const promPhilosophy = generateSquadPhilosophy("gritty");
  const trialLog = [];

  for (let season = 0; season < MAX_SEASONS; season++) {
    // Generate fresh opponents each season (they evolve independently)
    const leagueTeams = [{ name: "Promoted FC", color: "#4ade80", squad: promSquad, trait: "gritty", isPlayer: false }];
    for (const t of destDef.teams.slice(0, -1)) {
      leagueTeams.push(generateAITeam(t.name, t.color, t.strength, t.trait, destTier, 0, 0, t.natMix));
    }

    const promOVR = starterAvgOVR(promSquad);
    const othersOVR = leagueTeams.slice(1).map(t => starterAvgOVR(t.squad));
    const avgOthers = othersOVR.reduce((s, v) => s + v, 0) / othersOVR.length;

    const table = runLeagueSeason(leagueTeams);
    const promPos = table.findIndex(r => r.teamIndex === 0) + 1;
    const relegated = promPos === destDef.teams.length;

    trialLog.push({ season: season + 1, promOVR, avgOthers, position: promPos, relegated, squadSize: promSquad.length });

    if (relegated) break;

    // Evolve the promoted squad for next season — crucially using the DESTINATION tier for replacements
    promSquad = evolveAISquad(promSquad, destTier, "gritty", promPhilosophy, 0);
  }

  multiResults.push(trialLog);
}

// Aggregate multi-season results
console.log(`  Season | Survived | Avg OVR | League OVR | Gap  | Avg Position | Relegated`);
console.log(`  -------|----------|---------|------------|------|--------------|----------`);

for (let s = 0; s < MAX_SEASONS; s++) {
  const active = multiResults.filter(t => t.length > s);
  if (active.length === 0) break;
  const seasonData = active.map(t => t[s]);
  const survived = active.length;
  const avgOVR = seasonData.reduce((sum, d) => sum + d.promOVR, 0) / seasonData.length;
  const avgLeague = seasonData.reduce((sum, d) => sum + d.avgOthers, 0) / seasonData.length;
  const avgPos = seasonData.reduce((sum, d) => sum + d.position, 0) / seasonData.length;
  const relegated = seasonData.filter(d => d.relegated).length;

  console.log(`  ${String(s + 1).padStart(4)}   | ${String(survived).padStart(5)}/${MULTI_SEASON_TRIALS} | ${avgOVR.toFixed(1).padStart(7)} | ${avgLeague.toFixed(1).padStart(10)} | ${(avgLeague - avgOVR).toFixed(1).padStart(4)} | ${avgPos.toFixed(1).padStart(12)} | ${relegated}/${survived}`);
}

const survivedAll = multiResults.filter(t => t.length === MAX_SEASONS).length;
console.log(`\n  Survived all ${MAX_SEASONS} seasons: ${survivedAll}/${MULTI_SEASON_TRIALS} (${(survivedAll/MULTI_SEASON_TRIALS*100).toFixed(0)}%)`);
const relegatedS1 = multiResults.filter(t => t.length === 1).length;
const relegatedS2 = multiResults.filter(t => t.length === 2).length;
const relegatedS3 = multiResults.filter(t => t.length === 3).length;
console.log(`  Relegated in season 1: ${relegatedS1} | season 2: ${relegatedS2} | season 3: ${relegatedS3}`);
