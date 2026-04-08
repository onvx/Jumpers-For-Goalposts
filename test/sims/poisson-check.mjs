/**
 * Poisson Distribution Sanity Check
 * The match engine uses poissonGoals(xG) to convert expected goals to actual.
 * Is the output actually Poisson-distributed? Is the cap at 8 compressing results?
 */

import { simulateMatch } from '../../src/utils/match.js';
import { generateAITeam } from '../../src/utils/player.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';

const N = parseInt(process.argv[2]) || 50000;

// Also test the poissonGoals function directly if accessible
// It's not exported, but we can infer from match results

console.log(`\n=== POISSON DISTRIBUTION CHECK (${N} matches) ===\n`);

// Test at various xG levels by controlling team strengths
const xgScenarios = [
  { label: "Low xG (~0.8)", homeTier: 8, awayTier: 8, homeStr: 0.5, awayStr: 0.5 },
  { label: "Mid xG (~1.2)", homeTier: 5, awayTier: 5, homeStr: 0.6, awayStr: 0.6 },
  { label: "High xG (~1.8)", homeTier: 1, awayTier: 5, homeStr: 0.9, awayStr: 0.3 },
  { label: "Very high xG (mismatch)", homeTier: 1, awayTier: 11, homeStr: 0.95, awayStr: 0.3 },
];

function poissonPMF(k, lambda) {
  // P(X=k) = e^(-λ) * λ^k / k!
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) {
    result *= lambda / i;
  }
  return result;
}

for (const sc of xgScenarios) {
  const hDef = LEAGUE_DEFS[sc.homeTier];
  const aDef = LEAGUE_DEFS[sc.awayTier];
  const home = generateAITeam(hDef.teams[0].name, hDef.teams[0].color, sc.homeStr, hDef.teams[0].trait, sc.homeTier, 0, 0);
  const away = generateAITeam(aDef.teams[0].name, aDef.teams[0].color, sc.awayStr, aDef.teams[0].trait, sc.awayTier, 0, 0);

  const homeGoalDist = {};
  const awayGoalDist = {};
  let totalHome = 0, totalAway = 0;

  for (let i = 0; i < N; i++) {
    const result = simulateMatch(home, away, null, null, false, 1.0, 0, null, 0, {});
    homeGoalDist[result.homeGoals] = (homeGoalDist[result.homeGoals] || 0) + 1;
    awayGoalDist[result.awayGoals] = (awayGoalDist[result.awayGoals] || 0) + 1;
    totalHome += result.homeGoals;
    totalAway += result.awayGoals;
  }

  const avgHome = totalHome / N;
  const avgAway = totalAway / N;

  console.log(`--- ${sc.label} ---`);
  console.log(`  Home avg goals: ${avgHome.toFixed(3)} | Away avg goals: ${avgAway.toFixed(3)}`);

  // Compare actual distribution to theoretical Poisson
  console.log(`\n  HOME goals distribution vs Poisson(λ=${avgHome.toFixed(2)}):`);
  console.log(`  Goals | Actual  | Poisson | Delta  | Flag`);
  console.log(`  ------|---------|---------|--------|-----`);
  for (let k = 0; k <= 8; k++) {
    const actual = (homeGoalDist[k] || 0) / N;
    const expected = poissonPMF(k, avgHome);
    const delta = actual - expected;
    const flag = Math.abs(delta) > 0.02 ? '***' : Math.abs(delta) > 0.01 ? '**' : Math.abs(delta) > 0.005 ? '*' : '';
    if (actual > 0.001 || expected > 0.001) {
      console.log(`  ${String(k).padStart(5)} | ${(actual * 100).toFixed(2).padStart(6)}% | ${(expected * 100).toFixed(2).padStart(6)}% | ${(delta >= 0 ? '+' : '') + (delta * 100).toFixed(2).padStart(5)}% | ${flag}`);
    }
  }

  console.log(`\n  AWAY goals distribution vs Poisson(λ=${avgAway.toFixed(2)}):`);
  console.log(`  Goals | Actual  | Poisson | Delta  | Flag`);
  console.log(`  ------|---------|---------|--------|-----`);
  for (let k = 0; k <= 8; k++) {
    const actual = (awayGoalDist[k] || 0) / N;
    const expected = poissonPMF(k, avgAway);
    const delta = actual - expected;
    const flag = Math.abs(delta) > 0.02 ? '***' : Math.abs(delta) > 0.01 ? '**' : Math.abs(delta) > 0.005 ? '*' : '';
    if (actual > 0.001 || expected > 0.001) {
      console.log(`  ${String(k).padStart(5)} | ${(actual * 100).toFixed(2).padStart(6)}% | ${(expected * 100).toFixed(2).padStart(6)}% | ${(delta >= 0 ? '+' : '') + (delta * 100).toFixed(2).padStart(5)}% | ${flag}`);
    }
  }

  // Check for cap compression at 8
  const homeOver8 = Object.entries(homeGoalDist).filter(([k]) => parseInt(k) > 8).reduce((s, [, v]) => s + v, 0);
  const awayOver8 = Object.entries(awayGoalDist).filter(([k]) => parseInt(k) > 8).reduce((s, [, v]) => s + v, 0);
  const homeAt8 = homeGoalDist[8] || 0;
  const awayAt8 = awayGoalDist[8] || 0;
  if (homeAt8 > 0 || homeOver8 > 0) {
    console.log(`\n  Cap check: Home scored 8 goals ${homeAt8} times, >8 goals ${homeOver8} times`);
  }
  if (awayAt8 > 0 || awayOver8 > 0) {
    console.log(`  Cap check: Away scored 8 goals ${awayAt8} times, >8 goals ${awayOver8} times`);
  }

  // Variance check: Poisson should have variance = mean
  const homeVar = Object.entries(homeGoalDist).reduce((s, [k, v]) => s + v * Math.pow(parseInt(k) - avgHome, 2), 0) / N;
  const awayVar = Object.entries(awayGoalDist).reduce((s, [k, v]) => s + v * Math.pow(parseInt(k) - avgAway, 2), 0) / N;
  console.log(`\n  Variance check (should equal mean for Poisson):`);
  console.log(`    Home: mean=${avgHome.toFixed(3)}, var=${homeVar.toFixed(3)}, ratio=${(homeVar / avgHome).toFixed(3)} (1.0 = perfect)`);
  console.log(`    Away: mean=${avgAway.toFixed(3)}, var=${awayVar.toFixed(3)}, ratio=${(awayVar / avgAway).toFixed(3)} (1.0 = perfect)`);

  console.log('');
}

// Special test: very high xG to check cap
console.log(`--- Cap Test: Extremely mismatched (T1 best vs T11 weakest) ---`);
const capHome = generateAITeam("Cap Test", "#fff", 0.95, "dominant", 1, 0, 0);
const capAway = generateAITeam("Cap Opp", "#000", 0.15, "defensive", 11, 0, 0);
const capDist = {};
let capTotal = 0;
for (let i = 0; i < N; i++) {
  const r = simulateMatch(capHome, capAway, null, null, false, 1.0, 0, null, 0, {});
  capDist[r.homeGoals] = (capDist[r.homeGoals] || 0) + 1;
  capTotal += r.homeGoals;
}
console.log(`  Home avg goals: ${(capTotal / N).toFixed(2)}`);
console.log(`  Distribution: ${Object.entries(capDist).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).map(([k,v]) => `${k}g:${(v/N*100).toFixed(1)}%`).join(' ')}`);
const at8 = capDist[8] || 0;
const theoreticalAbove8 = 1 - Array.from({length: 9}, (_, k) => poissonPMF(k, capTotal / N)).reduce((s, v) => s + v, 0);
console.log(`  Scored exactly 8: ${(at8/N*100).toFixed(2)}% | Theoretical P(>8) if uncapped: ${(theoreticalAbove8 * 100).toFixed(2)}%`);
