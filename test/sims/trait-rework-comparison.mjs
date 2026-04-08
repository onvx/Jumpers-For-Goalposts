/**
 * Trait Rework Comparison
 * Simulates the proposed trait changes WITHOUT modifying game code.
 * Reimplements simulateMatch locally with the new trait mechanics
 * to compare old vs new outcomes.
 */

import { generateAITeam } from '../../src/utils/player.js';
import { getOverall, rand } from '../../src/utils/calc.js';
import { POSITION_TYPES } from '../../src/data/positions.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';

const N = parseInt(process.argv[2]) || 5000;
const TIER = 5;

// Poisson sampler (real implementation from match.js)
function poissonGoals(expected) {
  let goals = 0, p = Math.exp(-expected), s = p, u = Math.random();
  while (u > s && goals < 12) { goals++; p *= expected / goals; s += p; }
  return goals;
}

function getTeamStrength(team) {
  const starters = team.squad.filter(p => !p.isBench);
  if (starters.length === 0) return 5;
  return starters.reduce((sum, p) => sum + getOverall(p), 0) / starters.length;
}

function avgOVR(squad) {
  const starters = squad.filter(p => !p.isBench);
  return starters.reduce((s, p) => s + getOverall(p), 0) / starters.length;
}

// =============================================
// NEW TRAIT SYSTEM — proposed rework
// =============================================
const NEW_TRAITS = {
  dominant:     { xgOwn: 1.1,  xgOpp: 0.93 },
  gritty:       { xgOwn: 1.0,  xgOpp: 1.0,  trailingBoost2H: 0.25 },
  methodical:   { xgOwn: 0.85, xgOpp: 0.82, leadingOppNerf2H: 0.15, leadingOppChance: 0.20 },
  defensive:    { xgOwn: 0.75, xgOpp: 0.7,  cleanSheetGoalChance: 0.30 },
  stars:        { xgOwn: 0.95, xgOpp: 0.9,  starScoresBoost: 0.15 },
  physical:     { xgOwn: 0.9,  xgOpp: 0.9,  secondHalfOwnBoost: 0.15, secondHalfOppNerf: 0.10 },
  flair:        { xgOwn: 1.05, xgOpp: 0.98, chaosChance: 0.15, chaosOwnBoost: 0.5, chaosOppBoost: 0.3 },
  free_scoring: { xgOwn: null, xgOpp: null,  varianceOwn: [0.7, 0.6], varianceOpp: [0.85, 0.3], minOwnXG: 1.0 },
  set_piece:    { xgOwn: 1.0,  xgOpp: 0.95, bonusXG: 0.15 },
};

// OLD TRAIT SYSTEM — current implementation
const OLD_TRAITS = {
  dominant:     { xgOwn: 1.1,  xgOpp: 0.9 },
  gritty:       { xgOwn: 1.0,  xgOpp: 1.0,  comebackChance: 0.4 },
  methodical:   { xgOwn: 0.9,  xgOpp: 0.9,  maxMargin: 1 },
  defensive:    { xgOwn: 0.8,  xgOpp: 0.75 },
  stars:        { xgOwn: 0.9,  xgOpp: 0.85 },
  physical:     { xgOwn: 0.85, xgOpp: 0.85, maxMargin: 2 },
  flair:        { xgOwn: 1.05, xgOpp: 0.95 },
  free_scoring: { xgOwn: null, xgOpp: null,  varianceOwn: [0.7, 0.6], varianceOpp: [0.85, 0.3] },
  set_piece:    { xgOwn: 1.0,  xgOpp: 0.95 },
};

function simulateNew(homeTeam, awayTeam, isHomePlayer) {
  const homeStr = getTeamStrength(homeTeam);
  const awayStr = getTeamStrength(awayTeam);
  const homeAdv = 0.2;

  let homeXG = Math.max(0.3, 1.2 + (homeStr - awayStr) * 0.16 + homeAdv);
  let awayXG = Math.max(0.3, 1.2 + (awayStr - homeStr) * 0.16);

  // Apply home team trait to xG
  const applyTrait = (trait, ownXG, oppXG) => {
    const t = NEW_TRAITS[trait];
    if (!t) return [ownXG, oppXG];

    if (trait === 'free_scoring') {
      const ownMult = t.varianceOwn[0] + Math.random() * t.varianceOwn[1];
      const oppMult = t.varianceOpp[0] + Math.random() * t.varianceOpp[1];
      return [Math.max(t.minOwnXG || 0.3, ownXG * ownMult), oppXG * oppMult];
    }

    let own = ownXG * (t.xgOwn || 1.0);
    let opp = oppXG * (t.xgOpp || 1.0);
    if (t.bonusXG) own += t.bonusXG;
    return [Math.max(0.2, own), Math.max(0.2, opp)];
  };

  // Apply home trait first, then away trait
  let [hxg] = applyTrait(homeTeam.trait, homeXG, awayXG);
  let [axg, haFromAway] = applyTrait(awayTeam.trait, awayXG, hxg);
  homeXG = haFromAway || hxg;
  awayXG = axg;

  // ---- TWO-PHASE GENERATION ----
  // First half: base xG / 2
  let homeGoals1H = poissonGoals(homeXG / 2);
  let awayGoals1H = poissonGoals(awayXG / 2);

  // Second half: modified xG / 2 based on traits and match state
  let home2HxG = homeXG / 2;
  let away2HxG = awayXG / 2;

  const score1H = { home: homeGoals1H, away: awayGoals1H };

  // Gritty trailing boost (second half only)
  const homeTrait = NEW_TRAITS[homeTeam.trait];
  const awayTrait = NEW_TRAITS[awayTeam.trait];

  if (homeTrait?.trailingBoost2H && score1H.home < score1H.away) {
    home2HxG *= (1 + homeTrait.trailingBoost2H);
  }
  if (awayTrait?.trailingBoost2H && score1H.away < score1H.home) {
    away2HxG *= (1 + awayTrait.trailingBoost2H);
  }

  // Physical second-half modifier
  if (homeTrait?.secondHalfOwnBoost) {
    home2HxG *= (1 + homeTrait.secondHalfOwnBoost);
    away2HxG *= (1 - (homeTrait.secondHalfOppNerf || 0));
  }
  if (awayTrait?.secondHalfOwnBoost) {
    away2HxG *= (1 + awayTrait.secondHalfOwnBoost);
    home2HxG *= (1 - (awayTrait.secondHalfOppNerf || 0));
  }

  // Methodical game management (leading team nerfs opponent)
  if (homeTrait?.leadingOppNerf2H && score1H.home > score1H.away && Math.random() < homeTrait.leadingOppChance) {
    away2HxG *= (1 - homeTrait.leadingOppNerf2H);
  }
  if (awayTrait?.leadingOppNerf2H && score1H.away > score1H.home && Math.random() < awayTrait.leadingOppChance) {
    home2HxG *= (1 - awayTrait.leadingOppNerf2H);
  }

  // Flair chaos game
  if (homeTrait?.chaosChance && Math.random() < homeTrait.chaosChance) {
    home2HxG += homeTrait.chaosOwnBoost / 2;
    away2HxG += homeTrait.chaosOppBoost / 2;
  }
  if (awayTrait?.chaosChance && Math.random() < awayTrait.chaosChance) {
    away2HxG += awayTrait.chaosOwnBoost / 2;
    home2HxG += awayTrait.chaosOppBoost / 2;
  }

  let homeGoals2H = poissonGoals(Math.max(0.15, home2HxG));
  let awayGoals2H = poissonGoals(Math.max(0.15, away2HxG));

  let homeGoals = homeGoals1H + homeGoals2H;
  let awayGoals = awayGoals1H + awayGoals2H;

  // Defensive clean sheet goal
  if (homeTrait?.cleanSheetGoalChance && awayGoals === 0 && homeGoals === 0 && Math.random() < homeTrait.cleanSheetGoalChance) {
    homeGoals++;
  }
  if (awayTrait?.cleanSheetGoalChance && homeGoals === 0 && awayGoals === 0 && Math.random() < awayTrait.cleanSheetGoalChance) {
    awayGoals++;
  }

  // Stars confidence boost — approximate: if star team scored in 1H, boost 2H
  // (simplified: just use the xG modifier, already applied above)

  return { homeGoals, awayGoals };
}

function simulateOld(homeTeam, awayTeam, isHomePlayer) {
  const homeStr = getTeamStrength(homeTeam);
  const awayStr = getTeamStrength(awayTeam);
  const homeAdv = 0.2;

  let homeXG = Math.max(0.3, 1.2 + (homeStr - awayStr) * 0.16 + homeAdv);
  let awayXG = Math.max(0.3, 1.2 + (awayStr - homeStr) * 0.16);

  const applyTrait = (trait, ownXG, oppXG) => {
    const t = OLD_TRAITS[trait];
    if (!t) return [ownXG, oppXG];
    if (trait === 'free_scoring') {
      const ownMult = t.varianceOwn[0] + Math.random() * t.varianceOwn[1];
      const oppMult = t.varianceOpp[0] + Math.random() * t.varianceOpp[1];
      return [ownXG * ownMult, oppXG * oppMult];
    }
    return [ownXG * (t.xgOwn || 1.0), oppXG * (t.xgOpp || 1.0)];
  };

  let [hxg] = applyTrait(homeTeam.trait, homeXG, awayXG);
  let [axg, haFromAway] = applyTrait(awayTeam.trait, awayXG, hxg);
  homeXG = Math.max(0.2, haFromAway || hxg);
  awayXG = Math.max(0.2, axg);

  let homeGoals = poissonGoals(homeXG);
  let awayGoals = poissonGoals(awayXG);

  // Post-Poisson caps (OLD system)
  const homeTrait = OLD_TRAITS[homeTeam.trait];
  const awayTrait = OLD_TRAITS[awayTeam.trait];

  if (homeTrait?.maxMargin && homeTeam.trait === 'physical' && awayGoals - homeGoals > homeTrait.maxMargin) homeGoals = awayGoals - homeTrait.maxMargin;
  if (awayTrait?.maxMargin && awayTeam.trait === 'physical' && homeGoals - awayGoals > awayTrait.maxMargin) awayGoals = homeGoals - awayTrait.maxMargin;
  if (homeTrait?.maxMargin && homeTeam.trait === 'methodical' && homeGoals - awayGoals > homeTrait.maxMargin) homeGoals = awayGoals + homeTrait.maxMargin;
  if (homeTrait?.maxMargin && homeTeam.trait === 'methodical' && awayGoals - homeGoals > homeTrait.maxMargin) awayGoals = homeGoals + homeTrait.maxMargin;
  if (awayTrait?.maxMargin && awayTeam.trait === 'methodical' && awayGoals - homeGoals > awayTrait.maxMargin) awayGoals = homeGoals + awayTrait.maxMargin;
  if (awayTrait?.maxMargin && awayTeam.trait === 'methodical' && homeGoals - awayGoals > awayTrait.maxMargin) homeGoals = awayGoals + awayTrait.maxMargin;

  if (homeTrait?.comebackChance && homeGoals < awayGoals && Math.random() < homeTrait.comebackChance) homeGoals++;
  if (awayTrait?.comebackChance && awayGoals < homeGoals && Math.random() < awayTrait.comebackChance) awayGoals++;

  return { homeGoals, awayGoals };
}

// ====== RUN COMPARISON ======
const TRAITS_LIST = ['dominant', 'stars', 'free_scoring', 'defensive', 'physical', 'methodical', 'flair', 'gritty', 'set_piece'];

console.log(`\n=== TRAIT REWORK: PLAYER (NO TRAIT) vs AI — OLD vs NEW (${N} matches each) ===\n`);
console.log(`  AI Trait       | OLD Win% | OLD Loss% | OLD Draw% | NEW Win% | NEW Loss% | NEW Draw% | Win Δ  | Notes`);
console.log(`  ---------------|----------|-----------|-----------|----------|-----------|-----------|--------|------`);

let oldTotalW = 0, oldTotalL = 0, oldTotalD = 0;
let newTotalW = 0, newTotalL = 0, newTotalD = 0;

for (const trait of TRAITS_LIST) {
  const playerTeam = generateAITeam('Player FC', '#4ade80', 0.7, 'gritty', TIER, 0, 0);
  playerTeam.trait = null; // traitless
  const aiTeam = generateAITeam('AI FC', '#ef4444', 0.7, trait, TIER, 0, 0);

  let oldW = 0, oldD = 0, oldL = 0;
  let newW = 0, newD = 0, newL = 0;

  for (let i = 0; i < N; i++) {
    const isHome = i % 2 === 0;
    const home = isHome ? playerTeam : aiTeam;
    const away = isHome ? aiTeam : playerTeam;

    // Old system
    const oldR = simulateOld(home, away);
    const oldPG = isHome ? oldR.homeGoals : oldR.awayGoals;
    const oldAG = isHome ? oldR.awayGoals : oldR.homeGoals;
    if (oldPG > oldAG) oldW++; else if (oldPG < oldAG) oldL++; else oldD++;

    // New system
    const newR = simulateNew(home, away);
    const newPG = isHome ? newR.homeGoals : newR.awayGoals;
    const newAG = isHome ? newR.awayGoals : newR.homeGoals;
    if (newPG > newAG) newW++; else if (newPG < newAG) newL++; else newD++;
  }

  oldTotalW += oldW; oldTotalD += oldD; oldTotalL += oldL;
  newTotalW += newW; newTotalD += newD; newTotalL += newL;

  const winDelta = (newW - oldW) / N * 100;
  const notes = [];
  if (winDelta > 3) notes.push('EASIER');
  if (winDelta < -3) notes.push('HARDER');
  if (Math.abs(winDelta) <= 1) notes.push('~same');

  console.log(`  ${trait.padEnd(15)} | ${(oldW/N*100).toFixed(1).padStart(7)}% | ${(oldL/N*100).toFixed(1).padStart(8)}% | ${(oldD/N*100).toFixed(1).padStart(8)}% | ${(newW/N*100).toFixed(1).padStart(7)}% | ${(newL/N*100).toFixed(1).padStart(8)}% | ${(newD/N*100).toFixed(1).padStart(8)}% | ${(winDelta >= 0 ? '+' : '') + winDelta.toFixed(1).padStart(5)}% | ${notes.join(', ')}`);
}

const totalN = N * TRAITS_LIST.length;
console.log(`  ${'-'.repeat(115)}`);
console.log(`  OVERALL`.padEnd(17) + ` | ${(oldTotalW/totalN*100).toFixed(1).padStart(7)}% | ${(oldTotalL/totalN*100).toFixed(1).padStart(8)}% | ${(oldTotalD/totalN*100).toFixed(1).padStart(8)}% | ${(newTotalW/totalN*100).toFixed(1).padStart(7)}% | ${(newTotalL/totalN*100).toFixed(1).padStart(8)}% | ${(newTotalD/totalN*100).toFixed(1).padStart(8)}% | ${((newTotalW-oldTotalW)/totalN*100 >= 0 ? '+' : '') + ((newTotalW-oldTotalW)/totalN*100).toFixed(1)}%`);

// ====== MIRROR MATCHUP COMPARISON ======
console.log(`\n=== MIRROR MATCHUPS: Goals/match & Draw Rate — OLD vs NEW ===\n`);
console.log(`  Trait          | OLD g/m | OLD draw% | OLD 2+margin% | NEW g/m | NEW draw% | NEW 2+margin% | Notes`);
console.log(`  ---------------|---------|-----------|---------------|---------|-----------|---------------|------`);

for (const trait of TRAITS_LIST) {
  const t1 = generateAITeam('Home', '#fff', 0.7, trait, TIER, 0, 0);
  const t2 = generateAITeam('Away', '#000', 0.7, trait, TIER, 0, 0);

  let oldGoals = 0, oldDraws = 0, oldBigMargin = 0;
  let newGoals = 0, newDraws = 0, newBigMargin = 0;

  for (let i = 0; i < N; i++) {
    const oldR = simulateOld(t1, t2);
    oldGoals += oldR.homeGoals + oldR.awayGoals;
    if (oldR.homeGoals === oldR.awayGoals) oldDraws++;
    if (Math.abs(oldR.homeGoals - oldR.awayGoals) >= 2) oldBigMargin++;

    const newR = simulateNew(t1, t2);
    newGoals += newR.homeGoals + newR.awayGoals;
    if (newR.homeGoals === newR.awayGoals) newDraws++;
    if (Math.abs(newR.homeGoals - newR.awayGoals) >= 2) newBigMargin++;
  }

  const notes = [];
  if (newGoals / N - oldGoals / N > 0.3) notes.push('MORE GOALS');
  if (newGoals / N - oldGoals / N < -0.3) notes.push('FEWER GOALS');
  if ((newDraws - oldDraws) / N * 100 < -5) notes.push('FEWER DRAWS');
  if ((newBigMargin - oldBigMargin) / N * 100 > 5) notes.push('MORE BLOWOUTS');

  console.log(`  ${trait.padEnd(15)} | ${(oldGoals/N).toFixed(2).padStart(7)} | ${(oldDraws/N*100).toFixed(1).padStart(8)}% | ${(oldBigMargin/N*100).toFixed(1).padStart(12)}% | ${(newGoals/N).toFixed(2).padStart(7)} | ${(newDraws/N*100).toFixed(1).padStart(8)}% | ${(newBigMargin/N*100).toFixed(1).padStart(12)}% | ${notes.join(', ')}`);
}
