/**
 * Rating vs Contribution Analysis (v2 — fixed: marks home as player team)
 * Do match ratings correlate with goals/assists?
 * Can a player get 8.0+ without contributing?
 * Does the rating system reward the right things?
 */

import { simulateMatch } from '../../src/utils/match.js';
import { generateAITeam } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';
import { STARTING_XI_POSITIONS } from '../../src/data/positions.js';

const N = parseInt(process.argv[2]) || 30000;

function buildMatchups() {
  const matchups = [];
  for (const tier of [11, 7, 5, 3, 1]) {
    const def = LEAGUE_DEFS[tier];
    for (let i = 0; i < 4; i++) {
      const h = def.teams[i % def.teams.length];
      const a = def.teams[(i + 3) % def.teams.length];
      const home = generateAITeam(h.name, h.color, h.strength, h.trait, tier, 0, 0, h.natMix);
      home.isPlayer = true; // mark as player team so ratings are generated
      const away = generateAITeam(a.name, a.color, a.strength, a.trait, tier, 0, 0, a.natMix);
      // Build a startingXI from home starters
      const startingXI = home.squad.filter(p => !p.isBench).map(p => p.id);
      matchups.push({ home, away, startingXI });
    }
  }
  return matchups;
}

const matchups = buildMatchups();
const performances = [];

for (let i = 0; i < N; i++) {
  const mu = matchups[i % matchups.length];
  const result = simulateMatch(mu.home, mu.away, mu.startingXI, [], false, 1.0, 0, null, 0, {});

  if (!result.playerRatings || result.playerRatings.length === 0) continue;

  for (const pr of result.playerRatings) {
    if (!pr.rating || !pr.name) continue;

    const player = mu.home.squad.find(p => p.name === pr.name);
    if (!player) continue;

    let goals = 0, assists = 0;
    if (result.scorers) goals = result.scorers[`home|${pr.name}`] || 0;
    if (result.assisters) assists = result.assisters[`home|${pr.name}`] || 0;

    const teamWon = result.homeGoals > result.awayGoals;
    const teamLost = result.homeGoals < result.awayGoals;
    const cleanSheet = result.awayGoals === 0;
    const isMotm = result.motmName === pr.name;
    const posType = ['GK'].includes(player.position) ? 'GK' : ['CB','LB','RB'].includes(player.position) ? 'DEF' : ['CM','AM'].includes(player.position) ? 'MID' : 'FWD';

    performances.push({
      name: pr.name, position: player.position, posType,
      ovr: getOverall(player), rating: pr.rating,
      goals, assists, contributed: goals + assists,
      teamWon, teamLost, cleanSheet, isMotm, isSub: pr.isSub,
    });
  }
}

console.log(`\n=== RATING vs CONTRIBUTION ANALYSIS (${performances.length} player performances) ===\n`);

// Rating by contribution level
console.log(`--- Average Rating by Goals + Assists ---`);
console.log(`  G+A | Count     | Avg Rating | Min  | Max  | Pct of all`);
console.log(`  ----|-----------|------------|------|------|----------`);
for (let ga = 0; ga <= 4; ga++) {
  const label = ga >= 4 ? "4+" : String(ga);
  const filtered = performances.filter(p => ga >= 4 ? p.contributed >= 4 : p.contributed === ga);
  if (filtered.length === 0) continue;
  const avg = filtered.reduce((s, p) => s + p.rating, 0) / filtered.length;
  const min = filtered.reduce((m, p) => Math.min(m, p.rating), 99);
  const max = filtered.reduce((m, p) => Math.max(m, p.rating), 0);
  console.log(`  ${label.padEnd(4)} | ${String(filtered.length).padStart(9)} | ${avg.toFixed(2).padStart(10)} | ${min.toFixed(1).padStart(4)} | ${max.toFixed(1).padStart(4)} | ${(filtered.length / performances.length * 100).toFixed(1)}%`);
}

// High ratings without contributing
console.log(`\n--- High Ratings Without Contributing ---`);
const high8 = performances.filter(p => p.rating >= 8.0);
const high8NoGA = high8.filter(p => p.contributed === 0);
console.log(`  Rated 8.0+: ${high8.length} (${(high8.length / performances.length * 100).toFixed(2)}% of all)`);
console.log(`  Of those, 0 G+A: ${high8NoGA.length} (${(high8NoGA.length / Math.max(1, high8.length) * 100).toFixed(1)}%)`);
if (high8NoGA.length > 0) {
  const posDist = {};
  high8NoGA.forEach(p => { posDist[p.position] = (posDist[p.position] || 0) + 1; });
  console.log(`  Positions of 8.0+ with 0 G+A: ${Object.entries(posDist).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' ')}`);
}

const high9 = performances.filter(p => p.rating >= 9.0);
const high9NoGA = high9.filter(p => p.contributed === 0);
console.log(`  Rated 9.0+: ${high9.length} | Of those, 0 G+A: ${high9NoGA.length} (${high9.length > 0 ? (high9NoGA.length / high9.length * 100).toFixed(1) : 0}%)`);

// Low ratings despite scoring
console.log(`\n--- Low Ratings Despite Contributing ---`);
const scored1 = performances.filter(p => p.goals >= 1);
const scored1Low = scored1.filter(p => p.rating < 6.0);
console.log(`  Scored 1+ goals: ${scored1.length} | Rated < 6.0: ${scored1Low.length} (${(scored1Low.length / Math.max(1, scored1.length) * 100).toFixed(2)}%)`);

const scored2 = performances.filter(p => p.goals >= 2);
const scored2Low = scored2.filter(p => p.rating < 7.0);
console.log(`  Scored 2+ goals: ${scored2.length} | Rated < 7.0: ${scored2Low.length} (${(scored2Low.length / Math.max(1, scored2.length) * 100).toFixed(2)}%)`);

// MOTM analysis
console.log(`\n--- Man of the Match ---`);
const motms = performances.filter(p => p.isMotm);
if (motms.length > 0) {
  const motmGoals = motms.filter(p => p.goals > 0).length;
  const motmAssists = motms.filter(p => p.assists > 0).length;
  const motmNoContrib = motms.filter(p => p.contributed === 0).length;
  const motmAvgRating = motms.reduce((s, p) => s + p.rating, 0) / motms.length;
  console.log(`  Total MOTMs: ${motms.length}`);
  console.log(`  Avg rating: ${motmAvgRating.toFixed(2)}`);
  console.log(`  Scored: ${(motmGoals / motms.length * 100).toFixed(1)}% | Assisted: ${(motmAssists / motms.length * 100).toFixed(1)}% | 0 G+A: ${(motmNoContrib / motms.length * 100).toFixed(1)}%`);

  // MOTM by position
  const motmByPos = {};
  motms.forEach(m => { motmByPos[m.position] = (motmByPos[m.position] || 0) + 1; });
  console.log(`  By position: ${Object.entries(motmByPos).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${(v/motms.length*100).toFixed(1)}%`).join(' | ')}`);
}

// Rating by position
console.log(`\n--- Average Rating by Position ---`);
console.log(`  Position | Avg Rating | p10  | p50  | p90  | Count`);
console.log(`  ---------|------------|------|------|------|------`);
const byPos = {};
performances.forEach(p => { if (!byPos[p.position]) byPos[p.position] = []; byPos[p.position].push(p.rating); });
for (const [pos, ratings] of Object.entries(byPos).sort((a, b) => {
  return (b[1].reduce((s,r)=>s+r,0)/b[1].length) - (a[1].reduce((s,r)=>s+r,0)/a[1].length);
})) {
  const sorted = [...ratings].sort((a, b) => a - b);
  const avg = sorted.reduce((s, r) => s + r, 0) / sorted.length;
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  console.log(`  ${pos.padEnd(9)} | ${avg.toFixed(2).padStart(10)} | ${p10.toFixed(1).padStart(4)} | ${p50.toFixed(1).padStart(4)} | ${p90.toFixed(1).padStart(4)} | ${sorted.length}`);
}

// Win/loss impact
console.log(`\n--- Win/Loss Impact on Rating ---`);
for (const [label, filter] of [['Won', p => p.teamWon], ['Drew', p => !p.teamWon && !p.teamLost], ['Lost', p => p.teamLost]]) {
  const filtered = performances.filter(filter);
  const avg = filtered.reduce((s, p) => s + p.rating, 0) / filtered.length;
  console.log(`  ${label}: avg ${avg.toFixed(2)} (${filtered.length} performances)`);
}

// OVR vs rating correlation
console.log(`\n--- OVR vs Rating Correlation ---`);
console.log(`  OVR Bucket | Avg Rating | Count`);
console.log(`  -----------|------------|------`);
const ovrBuckets = {};
performances.forEach(p => {
  const bucket = Math.round(p.ovr / 2) * 2; // bucket by 2s
  if (!ovrBuckets[bucket]) ovrBuckets[bucket] = [];
  ovrBuckets[bucket].push(p.rating);
});
for (const [ovr, ratings] of Object.entries(ovrBuckets).sort((a,b) => parseInt(a[0]) - parseInt(b[0]))) {
  const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
  console.log(`  ${String(ovr).padStart(7)}    | ${avg.toFixed(2).padStart(10)} | ${ratings.length}`);
}
