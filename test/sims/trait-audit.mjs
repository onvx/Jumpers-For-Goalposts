/**
 * Comprehensive Trait Audit
 * Tests every trait against every other trait to build a full picture:
 * - xG multiplier effects (pre-Poisson)
 * - Post-Poisson margin caps (the real culprit)
 * - Goal timing patterns
 * - Card generation
 * - Scorer concentration (stars)
 * - Overall win/draw/loss by trait
 * - Identify which traits are OP, which are useless, which distort the game
 */

import { simulateMatch } from '../../src/utils/match.js';
import { generateAITeam } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';

const N = parseInt(process.argv[2]) || 3000;
const TIER = 5; // test at mid-tier where OVR differences are meaningful

const TRAITS = ['dominant', 'stars', 'free_scoring', 'defensive', 'physical', 'methodical', 'flair', 'gritty', 'set_piece'];

// ====== PART 1: Each trait vs neutral (gritty as baseline, since it has fewest xG modifiers) ======
console.log(`\n=== TRAIT AUDIT (${N} matches per pairing, Tier ${TIER}) ===\n`);

console.log(`--- Part 1: Each Trait vs Gritty Baseline (equal OVR) ---\n`);
console.log(`  Trait          | Win%   | Draw%  | Loss%  | GF/m  | GA/m  | Total  | Cards/m | Top scorer % | Notes`);
console.log(`  ---------------|--------|--------|--------|-------|-------|--------|---------|-------------|------`);

for (const trait of TRAITS) {
  const team = generateAITeam("Test FC", "#fff", 0.7, trait, TIER, 0, 0);
  const opp = generateAITeam("Baseline", "#000", 0.7, "gritty", TIER, 0, 0);

  let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0, cards = 0;
  let topScorerGoals = 0, totalTeamGoals = 0;
  const scorelines = {};
  const goalMinutes = { early: 0, mid: 0, late: 0 }; // 1-30, 31-60, 61-90

  for (let i = 0; i < N; i++) {
    const isHome = i % 2 === 0;
    const home = isHome ? team : opp;
    const away = isHome ? opp : team;
    const result = simulateMatch(home, away, null, null, false, 1.0, 0, null, 0, {});

    const tg = isHome ? result.homeGoals : result.awayGoals;
    const og = isHome ? result.awayGoals : result.homeGoals;
    gf += tg; ga += og;
    if (tg > og) wins++; else if (tg < og) losses++; else draws++;
    totalTeamGoals += tg;

    // Track top scorer concentration
    const side = isHome ? "home" : "away";
    if (result.scorers) {
      let maxGoals = 0;
      for (const [key, count] of Object.entries(result.scorers)) {
        if (key.startsWith(side + "|") && count > maxGoals) maxGoals = count;
      }
      topScorerGoals += maxGoals;
    }

    // Cards
    if (result.events) {
      for (const e of result.events) {
        if ((e.type === 'card' || e.type === 'red_card') && e.cardTeamName === team.name) cards++;
      }
    }

    // Goal timing
    if (result.events) {
      for (const e of result.events) {
        if (e.type === 'goal' && e.side === side) {
          if (e.minute <= 30) goalMinutes.early++;
          else if (e.minute <= 60) goalMinutes.mid++;
          else goalMinutes.late++;
        }
      }
    }

    const key = `${tg}-${og}`;
    scorelines[key] = (scorelines[key] || 0) + 1;
  }

  const topScorerPct = totalTeamGoals > 0 ? (topScorerGoals / totalTeamGoals * 100).toFixed(0) : '0';
  const timingNote = gf > 0 ? `E:${(goalMinutes.early/gf*100).toFixed(0)} M:${(goalMinutes.mid/gf*100).toFixed(0)} L:${(goalMinutes.late/gf*100).toFixed(0)}` : '';
  const notes = [];
  if (draws / N > 0.35) notes.push('HIGH DRAWS');
  if (gf / N < 1.0) notes.push('LOW SCORING');
  if (ga / N < 0.8) notes.push('STINGY');
  if (topScorerPct > 60) notes.push('STAR RELIANT');
  if (cards / N > 0.8) notes.push('CARD HAPPY');

  console.log(`  ${trait.padEnd(15)} | ${(wins/N*100).toFixed(1).padStart(5)}% | ${(draws/N*100).toFixed(1).padStart(5)}% | ${(losses/N*100).toFixed(1).padStart(5)}% | ${(gf/N).toFixed(2).padStart(5)} | ${(ga/N).toFixed(2).padStart(5)} | ${((gf+ga)/N).toFixed(2).padStart(6)} | ${(cards/N).toFixed(2).padStart(7)} | ${topScorerPct.padStart(11)}% | ${notes.join(', ')}`);
}

// ====== PART 2: Mirror Matchups (trait vs same trait) ======
console.log(`\n--- Part 2: Mirror Matchups (trait vs itself) ---\n`);
console.log(`  Trait          | Goals/m | Draw% | Var/Mean | 0-0%  | 1-0/0-1% | 2+ margin% | Notes`);
console.log(`  ---------------|---------|-------|----------|-------|----------|------------|------`);

for (const trait of TRAITS) {
  const team = generateAITeam("Home", "#fff", 0.7, trait, TIER, 0, 0);
  const opp = generateAITeam("Away", "#000", 0.7, trait, TIER, 0, 0);

  let totalGoals = 0, draws = 0;
  const goalDist = {};
  let zeroZero = 0, oneNil = 0, bigMargin = 0;

  for (let i = 0; i < N; i++) {
    const result = simulateMatch(team, opp, null, null, false, 1.0, 0, null, 0, {});
    const total = result.homeGoals + result.awayGoals;
    totalGoals += total;
    goalDist[total] = (goalDist[total] || 0) + 1;
    if (result.homeGoals === result.awayGoals) draws++;
    if (result.homeGoals === 0 && result.awayGoals === 0) zeroZero++;
    if ((result.homeGoals === 1 && result.awayGoals === 0) || (result.homeGoals === 0 && result.awayGoals === 1)) oneNil++;
    if (Math.abs(result.homeGoals - result.awayGoals) >= 2) bigMargin++;
  }

  const mean = totalGoals / N;
  const variance = Object.entries(goalDist).reduce((s, [k, v]) => s + v * Math.pow(parseInt(k) - mean, 2), 0) / N;
  const ratio = variance / mean;

  const notes = [];
  if (ratio < 0.7) notes.push('COMPRESSED');
  if (draws / N > 0.35) notes.push('DRAW FEST');
  if (mean < 1.8) notes.push('BORING');
  if (bigMargin / N < 0.1) notes.push('NO BLOWOUTS');
  if (zeroZero / N > 0.12) notes.push('LOTS OF 0-0');

  console.log(`  ${trait.padEnd(15)} | ${mean.toFixed(2).padStart(7)} | ${(draws/N*100).toFixed(1).padStart(5)}% | ${ratio.toFixed(3).padStart(8)} | ${(zeroZero/N*100).toFixed(1).padStart(5)}% | ${(oneNil/N*100).toFixed(1).padStart(8)}% | ${(bigMargin/N*100).toFixed(1).padStart(10)}% | ${notes.join(', ')}`);
}

// ====== PART 3: Trait Power Rankings (round-robin tournament) ======
console.log(`\n--- Part 3: Trait Power Rankings (round-robin, ${N/3|0} matches per pairing) ---\n`);

const traitPoints = {};
const traitGD = {};
TRAITS.forEach(t => { traitPoints[t] = 0; traitGD[t] = 0; });

for (let i = 0; i < TRAITS.length; i++) {
  for (let j = i + 1; j < TRAITS.length; j++) {
    const t1 = TRAITS[i], t2 = TRAITS[j];
    const team1 = generateAITeam("T1", "#fff", 0.7, t1, TIER, 0, 0);
    const team2 = generateAITeam("T2", "#000", 0.7, t2, TIER, 0, 0);
    const matchesPerPair = Math.floor(N / 3);

    let w1 = 0, w2 = 0, d = 0, gf1 = 0, gf2 = 0;
    for (let m = 0; m < matchesPerPair; m++) {
      const isHome = m % 2 === 0;
      const home = isHome ? team1 : team2;
      const away = isHome ? team2 : team1;
      const result = simulateMatch(home, away, null, null, false, 1.0, 0, null, 0, {});
      const g1 = isHome ? result.homeGoals : result.awayGoals;
      const g2 = isHome ? result.awayGoals : result.homeGoals;
      gf1 += g1; gf2 += g2;
      if (g1 > g2) w1++; else if (g2 > g1) w2++; else d++;
    }
    traitPoints[t1] += w1 * 3 + d;
    traitPoints[t2] += w2 * 3 + d;
    traitGD[t1] += gf1 - gf2;
    traitGD[t2] += gf2 - gf1;
  }
}

const ranked = TRAITS.sort((a, b) => traitPoints[b] - traitPoints[a] || traitGD[b] - traitGD[a]);
console.log(`  Rank | Trait          | Points | GD`);
console.log(`  -----|----------------|--------|----`);
ranked.forEach((t, i) => {
  console.log(`  ${String(i + 1).padStart(4)} | ${t.padEnd(14)} | ${String(traitPoints[t]).padStart(6)} | ${traitGD[t] >= 0 ? '+' : ''}${traitGD[t]}`);
});
