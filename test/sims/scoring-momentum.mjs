/**
 * Scoring Momentum Analysis (v2 — fixed deficit tracking)
 * After a goal is scored, what happens next?
 * - Does the scoring team score again (momentum)?
 * - Or does the trailing team equalise (response)?
 * - Full deficit tracking: when down by 1, 2, 3 — what happens?
 * - Late-game patterns
 */

import { simulateMatch } from '../../src/utils/match.js';
import { generateAITeam } from '../../src/utils/player.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';

const N = parseInt(process.argv[2]) || 50000;

function buildMatchups() {
  const matchups = [];
  for (const tier of [11, 8, 5, 3, 1]) {
    const def = LEAGUE_DEFS[tier];
    for (let i = 0; i < def.teams.length - 1; i++) {
      const h = def.teams[i];
      const a = def.teams[i + 1];
      matchups.push({
        home: generateAITeam(h.name, h.color, h.strength, h.trait, tier, 0, 0, h.natMix),
        away: generateAITeam(a.name, a.color, a.strength, a.trait, tier, 0, 0, a.natMix),
      });
    }
  }
  for (const [hT, aT] of [[5, 8], [3, 6], [1, 4]]) {
    const hDef = LEAGUE_DEFS[hT];
    const aDef = LEAGUE_DEFS[aT];
    matchups.push({
      home: generateAITeam(hDef.teams[0].name, hDef.teams[0].color, hDef.teams[0].strength, hDef.teams[0].trait, hT, 0, 0),
      away: generateAITeam(aDef.teams[0].name, aDef.teams[0].color, aDef.teams[0].strength, aDef.teams[0].trait, aT, 0, 0),
    });
  }
  return matchups;
}

const matchups = buildMatchups();

// After-goal momentum
const afterGoal = { sameTeam: 0, otherTeam: 0, noMore: 0, total: 0 };

// Goal timing
function getPeriod(min) {
  if (min <= 15) return '0-15';
  if (min <= 30) return '16-30';
  if (min <= 45) return '31-45';
  if (min <= 60) return '46-60';
  if (min <= 75) return '61-75';
  return '76-90';
}
const goalsByPeriod = {};
for (const p of ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90']) {
  goalsByPeriod[p] = { scored: 0, nextSame: 0, nextOther: 0 };
}

// Deficit tracking: for each "moment" where a team is trailing by N goals,
// track what the NEXT goal is (their goal = response, opp goal = extended, no more = stayed behind)
const deficitResponse = {};
// deficitResponse[N] = { moments, theyScoreNext, oppScoresNext, noMoreGoals }

// Full match outcome tracking
let totalMatches = 0;
let matchesWithDeficit = 0;
let comebackWins = 0;
let comebackDraws = 0;

// After going behind at any point: final scoreline from trailing team's POV
const trailingOutcomes = {};

for (let i = 0; i < N; i++) {
  const mu = matchups[i % matchups.length];
  const result = simulateMatch(mu.home, mu.away, null, null, false, 1.0, 0, null, 0, {});
  totalMatches++;

  const goals = (result.events || [])
    .filter(e => e.type === 'goal')
    .sort((a, b) => a.minute - b.minute);

  if (goals.length === 0) continue;

  // Reconstruct score progression
  let hScore = 0, aScore = 0;
  let homeEverTrailed = false, awayEverTrailed = false;
  let homeMaxDeficit = 0, awayMaxDeficit = 0;

  for (let g = 0; g < goals.length; g++) {
    const goal = goals[g];
    const scoringSide = goal.side;
    const period = getPeriod(goal.minute);
    goalsByPeriod[period].scored++;

    // Before updating score, record the deficit state for the TRAILING team
    const homeDeficit = aScore - hScore; // positive = home is trailing
    const awayDeficit = hScore - aScore; // positive = away is trailing

    // If home is trailing, record this as a deficit moment
    if (homeDeficit > 0) {
      if (!deficitResponse[homeDeficit]) deficitResponse[homeDeficit] = { moments: 0, theyScoreNext: 0, oppScoresNext: 0, noMoreGoals: 0 };
      // This goal is about to be scored — is it home (the trailing team) or away (extending)?
      if (scoringSide === 'home') {
        deficitResponse[homeDeficit].theyScoreNext++;
      } else {
        deficitResponse[homeDeficit].oppScoresNext++;
      }
      deficitResponse[homeDeficit].moments++;
    }

    // If away is trailing, same thing
    if (awayDeficit > 0) {
      if (!deficitResponse[awayDeficit]) deficitResponse[awayDeficit] = { moments: 0, theyScoreNext: 0, oppScoresNext: 0, noMoreGoals: 0 };
      if (scoringSide === 'away') {
        deficitResponse[awayDeficit].theyScoreNext++;
      } else {
        deficitResponse[awayDeficit].oppScoresNext++;
      }
      deficitResponse[awayDeficit].moments++;
    }

    // Now update score
    if (scoringSide === 'home') hScore++;
    else aScore++;

    // Track trailing status
    if (hScore < aScore) { homeEverTrailed = true; homeMaxDeficit = Math.max(homeMaxDeficit, aScore - hScore); }
    if (aScore < hScore) { awayEverTrailed = true; awayMaxDeficit = Math.max(awayMaxDeficit, hScore - aScore); }

    // After-goal momentum: what's the NEXT goal?
    if (g < goals.length - 1) {
      afterGoal.total++;
      const nextSide = goals[g + 1].side;
      if (nextSide === scoringSide) {
        afterGoal.sameTeam++;
        goalsByPeriod[period].nextSame++;
      } else {
        afterGoal.otherTeam++;
        goalsByPeriod[period].nextOther++;
      }
    } else {
      afterGoal.total++;
      afterGoal.noMore++;
    }
  }

  // After all goals: count "no more goals" deficit moments for the final state
  const finalHomeDeficit = aScore - hScore;
  const finalAwayDeficit = hScore - aScore;
  if (finalHomeDeficit > 0) {
    if (!deficitResponse[finalHomeDeficit]) deficitResponse[finalHomeDeficit] = { moments: 0, theyScoreNext: 0, oppScoresNext: 0, noMoreGoals: 0 };
    deficitResponse[finalHomeDeficit].noMoreGoals++;
    deficitResponse[finalHomeDeficit].moments++;
  }
  if (finalAwayDeficit > 0) {
    if (!deficitResponse[finalAwayDeficit]) deficitResponse[finalAwayDeficit] = { moments: 0, theyScoreNext: 0, oppScoresNext: 0, noMoreGoals: 0 };
    deficitResponse[finalAwayDeficit].noMoreGoals++;
    deficitResponse[finalAwayDeficit].moments++;
  }

  // Comeback tracking
  if (homeEverTrailed || awayEverTrailed) {
    matchesWithDeficit++;

    if (homeEverTrailed) {
      const key = `${hScore}-${aScore}`;
      trailingOutcomes[key] = (trailingOutcomes[key] || 0) + 1;
      if (hScore > aScore) comebackWins++;
      if (hScore === aScore) comebackDraws++;
    }
    if (awayEverTrailed) {
      const key = `${aScore}-${hScore}`; // trailing team's goals first
      trailingOutcomes[key] = (trailingOutcomes[key] || 0) + 1;
      if (aScore > hScore) comebackWins++;
      if (aScore === hScore) comebackDraws++;
    }
  }
}

// === REPORT ===
console.log(`\n=== SCORING MOMENTUM ANALYSIS v2 (${N} matches) ===\n`);

console.log(`--- After a Goal: What Happens Next? ---`);
const totalResponses = afterGoal.sameTeam + afterGoal.otherTeam;
console.log(`  Same team scores next:  ${afterGoal.sameTeam} (${(afterGoal.sameTeam / afterGoal.total * 100).toFixed(1)}%)`);
console.log(`  Other team scores next: ${afterGoal.otherTeam} (${(afterGoal.otherTeam / afterGoal.total * 100).toFixed(1)}%)`);
console.log(`  No more goals:          ${afterGoal.noMore} (${(afterGoal.noMore / afterGoal.total * 100).toFixed(1)}%)`);
console.log(`  Momentum ratio (excl no-more): ${(afterGoal.sameTeam / Math.max(1, afterGoal.otherTeam)).toFixed(3)}x`);

console.log(`\n--- When Trailing: What's the Next Goal? ---`);
console.log(`  Deficit | Moments | Trailing team scores | Leading team extends | No more goals | Response rate`);
console.log(`  --------|---------|---------------------|---------------------|---------------|-------------`);
for (const size of Object.keys(deficitResponse).sort((a, b) => parseInt(a) - parseInt(b))) {
  const d = deficitResponse[size];
  const responseRate = d.theyScoreNext / d.moments * 100;
  const extendRate = d.oppScoresNext / d.moments * 100;
  const dryRate = d.noMoreGoals / d.moments * 100;
  console.log(`  ${String(size).padStart(5)}   | ${String(d.moments).padStart(7)} | ${String(d.theyScoreNext).padStart(11)} (${responseRate.toFixed(1)}%) | ${String(d.oppScoresNext).padStart(11)} (${extendRate.toFixed(1)}%) | ${String(d.noMoreGoals).padStart(7)} (${dryRate.toFixed(1)}%) | ${responseRate.toFixed(1)}%`);
}

console.log(`\n--- Comeback Rates ---`);
console.log(`  Matches where a team fell behind: ${matchesWithDeficit}/${totalMatches} (${(matchesWithDeficit / totalMatches * 100).toFixed(1)}%)`);
console.log(`  Comeback wins:  ${comebackWins} (${(comebackWins / matchesWithDeficit * 100).toFixed(1)}% of deficit matches)`);
console.log(`  Comeback draws: ${comebackDraws} (${(comebackDraws / matchesWithDeficit * 100).toFixed(1)}% of deficit matches)`);
console.log(`  Lost from behind: ${matchesWithDeficit - comebackWins - comebackDraws} (${((matchesWithDeficit - comebackWins - comebackDraws) / matchesWithDeficit * 100).toFixed(1)}%)`);

console.log(`\n--- Goal Timing & Response Rate by Period ---`);
console.log(`  Period   | Goals | Next: Same | Next: Other | Response Rate | Notes`);
console.log(`  ---------|-------|------------|-------------|---------------|------`);
for (const [period, data] of Object.entries(goalsByPeriod)) {
  const total = data.nextSame + data.nextOther;
  if (total === 0) { console.log(`  ${period.padEnd(9)} | ${String(data.scored).padStart(5)} | (no next goals to track)`); continue; }
  const responseRate = data.nextOther / total * 100;
  const note = responseRate < 45 ? '← LOW' : responseRate > 52 ? '← HIGH' : '';
  console.log(`  ${period.padEnd(9)} | ${String(data.scored).padStart(5)} | ${String(data.nextSame).padStart(10)} | ${String(data.nextOther).padStart(11)} | ${responseRate.toFixed(1).padStart(12)}% | ${note}`);
}

console.log(`\n--- After Going Behind: Final Scorelines (trailing team first) ---`);
const totalTrailing = Object.values(trailingOutcomes).reduce((s, v) => s + v, 0);
const sorted = Object.entries(trailingOutcomes).sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log(`  Scoreline | Count | Pct    | Outcome`);
console.log(`  ----------|-------|--------|--------`);
for (const [score, count] of sorted) {
  const [t, l] = score.split('-').map(Number);
  const outcome = t > l ? 'COMEBACK WIN' : t === l ? 'EQUALISED' : 'LOST';
  console.log(`  ${score.padEnd(10)} | ${String(count).padStart(5)} | ${(count / totalTrailing * 100).toFixed(1).padStart(5)}% | ${outcome}`);
}

// Summary: bucket by outcome type
const totalWins = Object.entries(trailingOutcomes).filter(([k]) => { const [t, l] = k.split('-').map(Number); return t > l; }).reduce((s, [, v]) => s + v, 0);
const totalDraws = Object.entries(trailingOutcomes).filter(([k]) => { const [t, l] = k.split('-').map(Number); return t === l; }).reduce((s, [, v]) => s + v, 0);
const totalLosses = Object.entries(trailingOutcomes).filter(([k]) => { const [t, l] = k.split('-').map(Number); return t < l; }).reduce((s, [, v]) => s + v, 0);
console.log(`\n  Summary: Won ${(totalWins/totalTrailing*100).toFixed(1)}% | Drew ${(totalDraws/totalTrailing*100).toFixed(1)}% | Lost ${(totalLosses/totalTrailing*100).toFixed(1)}%`);
