/**
 * Match Engine Statistical Analysis
 * Runs N simulated matches across various OVR gaps and collects:
 * - Goal distributions, scoreline shapes
 * - Card frequency (yellow, red)
 * - Rating distributions, MotM patterns
 * - Home advantage %, clean sheet rates
 * - Comeback probability
 */

import { simulateMatch } from '../../src/utils/match.js';
import { generateAITeam } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';

const N = parseInt(process.argv[2]) || 2000;
const VERBOSE = process.argv.includes('--verbose');

function buildTeam(tier) {
  const def = LEAGUE_DEFS[tier];
  // Pick a random team from the tier's roster for representative results
  const teamDef = def.teams[Math.floor(Math.random() * def.teams.length)];
  const team = generateAITeam(
    teamDef.name, teamDef.color, teamDef.strength,
    teamDef.trait, tier, 0, 0, teamDef.natMix
  );
  return team;
}

function avgOVR(squad) {
  if (!squad || squad.length === 0) return 0;
  return squad.reduce((s, p) => s + getOverall(p), 0) / squad.length;
}

// ---- Run simulations ----
console.log(`\n=== MATCH ENGINE STATS (${N} matches per scenario) ===\n`);

const scenarios = [
  { label: "T11 vs T11 (equal, low)", homeTier: 11, awayTier: 11 },
  { label: "T8 vs T8 (equal, mid)", homeTier: 8, awayTier: 8 },
  { label: "T5 vs T5 (equal, high)", homeTier: 5, awayTier: 5 },
  { label: "T1 vs T1 (equal, elite)", homeTier: 1, awayTier: 1 },
  { label: "T7 vs T9 (+2 tier gap)", homeTier: 7, awayTier: 9 },
  { label: "T5 vs T8 (+3 tier gap)", homeTier: 5, awayTier: 8 },
  { label: "T3 vs T7 (+4 tier gap)", homeTier: 3, awayTier: 7 },
  { label: "T1 vs T5 (+4 elite gap)", homeTier: 1, awayTier: 5 },
];

for (const sc of scenarios) {
  const stats = {
    homeWins: 0, draws: 0, awayWins: 0,
    totalHomeGoals: 0, totalAwayGoals: 0,
    cleanSheets: { home: 0, away: 0 },
    yellows: 0, reds: 0,
    comebacks: 0,
    scorelines: {},
    ratings: [],
    motmRatings: [],
    goalDistribution: {},
    matchGoalTotals: {},
  };

  const home = buildTeam(sc.homeTier);
  const away = buildTeam(sc.awayTier);
  const homeOVR = avgOVR(home.squad).toFixed(1);
  const awayOVR = avgOVR(away.squad).toFixed(1);

  for (let i = 0; i < N; i++) {
    const result = simulateMatch(home, away, null, null, false, 1.0, 0, null, 0, {});

    const hg = result.homeGoals;
    const ag = result.awayGoals;

    if (hg > ag) stats.homeWins++;
    else if (hg < ag) stats.awayWins++;
    else stats.draws++;

    stats.totalHomeGoals += hg;
    stats.totalAwayGoals += ag;

    if (ag === 0) stats.cleanSheets.home++;
    if (hg === 0) stats.cleanSheets.away++;

    if (result.comeback) stats.comebacks++;

    // Scoreline tracking
    const key = `${hg}-${ag}`;
    stats.scorelines[key] = (stats.scorelines[key] || 0) + 1;

    // Total goals per match
    const totalGoals = hg + ag;
    stats.matchGoalTotals[totalGoals] = (stats.matchGoalTotals[totalGoals] || 0) + 1;

    // Card counting from events
    if (result.events) {
      for (const e of result.events) {
        if (e.type === 'card') stats.yellows++;
        if (e.type === 'red_card') stats.reds++;
      }
    }

    // Rating distributions
    if (result.playerRatings) {
      for (const pr of result.playerRatings) {
        if (pr.rating) stats.ratings.push(pr.rating);
      }
    }

    // MotM rating
    if (result.playerRatings && result.motmName) {
      const motm = result.playerRatings.find(r => r.name === result.motmName);
      if (motm) stats.motmRatings.push(motm.rating);
    }
  }

  // Report
  console.log(`--- ${sc.label} ---`);
  console.log(`  Teams: ${home.name} (OVR ${homeOVR}) vs ${away.name} (OVR ${awayOVR})`);
  console.log(`  Results: H ${(stats.homeWins/N*100).toFixed(1)}% | D ${(stats.draws/N*100).toFixed(1)}% | A ${(stats.awayWins/N*100).toFixed(1)}%`);
  console.log(`  Goals/match: H ${(stats.totalHomeGoals/N).toFixed(2)} | A ${(stats.totalAwayGoals/N).toFixed(2)} | Total ${((stats.totalHomeGoals+stats.totalAwayGoals)/N).toFixed(2)}`);
  console.log(`  Clean sheets: H ${(stats.cleanSheets.home/N*100).toFixed(1)}% | A ${(stats.cleanSheets.away/N*100).toFixed(1)}%`);
  console.log(`  Cards/match: Yellow ${(stats.yellows/N).toFixed(2)} | Red ${(stats.reds/N).toFixed(4)}`);
  console.log(`  Comebacks: ${(stats.comebacks/N*100).toFixed(1)}%`);

  if (stats.ratings.length > 0) {
    const sorted = stats.ratings.sort((a,b) => a - b);
    const avg = sorted.reduce((s,v) => s+v, 0) / sorted.length;
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    console.log(`  Ratings: avg ${avg.toFixed(2)} | p10 ${p10.toFixed(1)} | p50 ${p50.toFixed(1)} | p90 ${p90.toFixed(1)}`);
  }
  if (stats.motmRatings.length > 0) {
    const avg = stats.motmRatings.reduce((s,v) => s+v, 0) / stats.motmRatings.length;
    console.log(`  MotM avg rating: ${avg.toFixed(2)}`);
  }

  // Top 5 scorelines
  const topScorelines = Object.entries(stats.scorelines)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k,v]) => `${k} (${(v/N*100).toFixed(1)}%)`)
    .join(', ');
  console.log(`  Top scorelines: ${topScorelines}`);

  // Goal total distribution
  const goalDist = Object.entries(stats.matchGoalTotals)
    .sort((a,b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([k,v]) => `${k}g:${(v/N*100).toFixed(0)}%`)
    .join(' ');
  console.log(`  Goals/match dist: ${goalDist}`);

  console.log('');
}
