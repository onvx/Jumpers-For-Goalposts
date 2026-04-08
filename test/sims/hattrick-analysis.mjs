/**
 * Hat-trick & 4-Goal Haul Analysis
 * Runs large-scale match simulations to find:
 * - How often hat-tricks and 4-goal hauls occur
 * - Which positions score them
 * - Attribute profiles of hat-trick scorers
 * - OVR vs tier gap correlation
 * - Is there a "formula" for engineering them?
 */

import { simulateMatch } from '../../src/utils/match.js';
import { generateAITeam } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';
import { POSITION_TYPES } from '../../src/data/positions.js';

const N = parseInt(process.argv[2]) || 50000;

function starterAvgOVR(squad) {
  const starters = squad.filter(p => !p.isBench);
  return starters.reduce((s, p) => s + getOverall(p), 0) / starters.length;
}

// Build teams across tiers for variety
function buildMatchups() {
  const matchups = [];
  // Equal matchups at various tiers
  for (const tier of [11, 8, 5, 3, 1]) {
    const def = LEAGUE_DEFS[tier];
    for (let i = 0; i < 3; i++) {
      const hIdx = i % def.teams.length;
      const aIdx = (i + 3) % def.teams.length;
      const h = def.teams[hIdx];
      const a = def.teams[aIdx];
      matchups.push({
        home: generateAITeam(h.name, h.color, h.strength, h.trait, tier, 0, 0, h.natMix),
        away: generateAITeam(a.name, a.color, a.strength, a.trait, tier, 0, 0, a.natMix),
        tierGap: 0, label: `T${tier} equal`,
      });
    }
  }
  // Mismatched (dominant team scenarios - where hat-tricks are more likely)
  for (const [hTier, aTier] of [[5, 8], [3, 7], [1, 5], [3, 5], [1, 3]]) {
    const hDef = LEAGUE_DEFS[hTier];
    const aDef = LEAGUE_DEFS[aTier];
    const h = hDef.teams[0];
    const a = aDef.teams[aDef.teams.length - 1];
    matchups.push({
      home: generateAITeam(h.name, h.color, h.strength, h.trait, hTier, 0, 0, h.natMix),
      away: generateAITeam(a.name, a.color, a.strength, a.trait, aTier, 0, 0, a.natMix),
      tierGap: aTier - hTier, label: `T${hTier} vs T${aTier}`,
    });
  }
  return matchups;
}

console.log(`\n=== HAT-TRICK & 4-GOAL HAUL ANALYSIS (${N} matches) ===\n`);

const matchups = buildMatchups();
const hatTricks = [];
const fourGoals = [];
let totalMatches = 0;
let totalGoalEvents = 0;

// Track all scorers for baseline comparison
const allScorers = [];

for (let i = 0; i < N; i++) {
  const mu = matchups[i % matchups.length];
  const result = simulateMatch(mu.home, mu.away, null, null, false, 1.0, 0, null, 0, {});
  totalMatches++;

  // Count goals per player from scorers object
  const playerGoals = {};
  if (result.scorers) {
    for (const [key, count] of Object.entries(result.scorers)) {
      const [side, name] = key.split('|');
      if (!name) continue;
      playerGoals[`${side}|${name}`] = count;
    }
  }

  for (const [key, goals] of Object.entries(playerGoals)) {
    const [side, name] = key.split('|');
    const team = side === 'home' ? mu.home : mu.away;
    const oppTeam = side === 'home' ? mu.away : mu.home;
    const player = team.squad.find(p => p.name === name);
    if (!player) continue;

    totalGoalEvents++;
    const ovr = getOverall(player);
    const posType = POSITION_TYPES[player.position];
    const teamOVR = starterAvgOVR(team.squad);
    const oppOVR = starterAvgOVR(oppTeam.squad);

    const entry = {
      name, position: player.position, posType, goals,
      attrs: { ...player.attrs }, ovr, age: player.age,
      teamOVR, oppOVR, ovrGap: teamOVR - oppOVR,
      trait: team.trait, tierGap: mu.tierGap, matchLabel: mu.label,
    };

    allScorers.push(entry);
    if (goals >= 3) hatTricks.push(entry);
    if (goals >= 4) fourGoals.push(entry);
  }
}

// === FREQUENCY ===
console.log(`--- Frequency ---`);
console.log(`  Total matches: ${totalMatches}`);
console.log(`  Hat-tricks (3+): ${hatTricks.length} (1 in ${Math.round(totalMatches / Math.max(1, hatTricks.length))} matches, ${(hatTricks.length / totalMatches * 100).toFixed(2)}%)`);
console.log(`  4-goal hauls: ${fourGoals.length} (1 in ${Math.round(totalMatches / Math.max(1, fourGoals.length))} matches, ${(fourGoals.length / totalMatches * 100).toFixed(3)}%)`);

// Exact goal counts
const exactCounts = {};
hatTricks.forEach(h => { exactCounts[h.goals] = (exactCounts[h.goals] || 0) + 1; });
console.log(`  Breakdown: ${Object.entries(exactCounts).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([k,v])=>`${k} goals: ${v}`).join(' | ')}`);

// === POSITION BREAKDOWN ===
console.log(`\n--- Position Breakdown ---`);
const posCounts = {};
const posHT = {};
hatTricks.forEach(h => { posHT[h.position] = (posHT[h.position] || 0) + 1; });
allScorers.forEach(s => { posCounts[s.position] = (posCounts[s.position] || 0) + 1; });

console.log(`  Position | Hat-tricks | % of HTs | Total scorers | HT rate`);
console.log(`  ---------|------------|----------|---------------|--------`);
const posSorted = Object.entries(posHT).sort((a, b) => b[1] - a[1]);
for (const [pos, count] of posSorted) {
  const total = posCounts[pos] || 1;
  console.log(`  ${pos.padEnd(9)} | ${String(count).padStart(10)} | ${(count / hatTricks.length * 100).toFixed(1).padStart(7)}% | ${String(total).padStart(13)} | ${(count / total * 100).toFixed(2)}%`);
}

// By position TYPE
console.log(`\n  By type:`);
const typeHT = {};
const typeTotal = {};
hatTricks.forEach(h => { typeHT[h.posType] = (typeHT[h.posType] || 0) + 1; });
allScorers.forEach(s => { typeTotal[s.posType] = (typeTotal[s.posType] || 0) + 1; });
for (const type of ['FWD', 'MID', 'DEF', 'GK']) {
  const ht = typeHT[type] || 0;
  const tot = typeTotal[type] || 1;
  console.log(`    ${type}: ${ht} hat-tricks from ${tot} scoring instances (${(ht/tot*100).toFixed(2)}% HT rate)`);
}

// === ATTRIBUTE PROFILES ===
console.log(`\n--- Attribute Profiles (Hat-trick scorers vs All scorers) ---`);
const attrKeys = ['pace', 'shooting', 'passing', 'defending', 'physical', 'technique', 'mental'];

const htAvgs = {};
const allAvgs = {};
for (const key of attrKeys) {
  htAvgs[key] = hatTricks.reduce((s, h) => s + (h.attrs[key] || 0), 0) / Math.max(1, hatTricks.length);
  allAvgs[key] = allScorers.reduce((s, h) => s + (h.attrs[key] || 0), 0) / Math.max(1, allScorers.length);
}

console.log(`  Attribute  | HT avg | All scorers avg | Delta | Significance`);
console.log(`  -----------|--------|-----------------|-------|-------------`);
for (const key of attrKeys) {
  const delta = htAvgs[key] - allAvgs[key];
  const sig = Math.abs(delta) > 1.0 ? '***' : Math.abs(delta) > 0.5 ? '**' : Math.abs(delta) > 0.2 ? '*' : '';
  console.log(`  ${key.padEnd(11)} | ${htAvgs[key].toFixed(1).padStart(6)} | ${allAvgs[key].toFixed(1).padStart(15)} | ${(delta >= 0 ? '+' : '') + delta.toFixed(1).padStart(4)} | ${sig}`);
}

const htOVR = hatTricks.reduce((s, h) => s + h.ovr, 0) / Math.max(1, hatTricks.length);
const allOVR = allScorers.reduce((s, h) => s + h.ovr, 0) / Math.max(1, allScorers.length);
console.log(`  ${'OVR'.padEnd(11)} | ${htOVR.toFixed(1).padStart(6)} | ${allOVR.toFixed(1).padStart(15)} | ${((htOVR - allOVR) >= 0 ? '+' : '') + (htOVR - allOVR).toFixed(1).padStart(4)} |`);

// === TEAM OVR GAP CORRELATION ===
console.log(`\n--- OVR Gap Correlation ---`);
const gapBuckets = {};
const gapMatchBuckets = {};

// Track matches by gap bucket
for (let i = 0; i < N; i++) {
  const mu = matchups[i % matchups.length];
  const homeOVR = starterAvgOVR(mu.home.squad);
  const awayOVR = starterAvgOVR(mu.away.squad);
  const gap = Math.round(Math.abs(homeOVR - awayOVR));
  gapMatchBuckets[gap] = (gapMatchBuckets[gap] || 0) + 1;
}

hatTricks.forEach(h => {
  const gap = Math.round(Math.abs(h.ovrGap));
  gapBuckets[gap] = (gapBuckets[gap] || 0) + 1;
});

console.log(`  OVR Gap | Hat-tricks | Matches  | Rate`);
console.log(`  --------|------------|----------|-----`);
for (const gap of Object.keys(gapMatchBuckets).sort((a, b) => parseInt(a) - parseInt(b))) {
  const ht = gapBuckets[gap] || 0;
  const matches = gapMatchBuckets[gap] || 1;
  console.log(`  ${String(gap).padStart(5)}   | ${String(ht).padStart(10)} | ${String(matches).padStart(8)} | ${(ht / matches * 100).toFixed(2)}%`);
}

// === TRAIT CORRELATION ===
console.log(`\n--- Trait of Hat-trick Scorer's Team ---`);
const traitHT = {};
hatTricks.forEach(h => { traitHT[h.trait] = (traitHT[h.trait] || 0) + 1; });
const traitSorted = Object.entries(traitHT).sort((a, b) => b[1] - a[1]);
for (const [trait, count] of traitSorted) {
  console.log(`    ${trait.padEnd(14)} ${count} (${(count / hatTricks.length * 100).toFixed(1)}%)`);
}

// === 4-GOAL HAUL DEEP DIVE ===
if (fourGoals.length > 0) {
  console.log(`\n--- 4-Goal Haul Profiles (${fourGoals.length} total) ---`);
  for (const h of fourGoals.slice(0, 10)) {
    console.log(`  ${h.name} (${h.position}, OVR ${h.ovr}) — ${h.goals} goals | Team OVR ${h.teamOVR.toFixed(1)} vs Opp ${h.oppOVR.toFixed(1)} (gap ${h.ovrGap >= 0 ? '+' : ''}${h.ovrGap.toFixed(1)}) | SHO:${h.attrs.shooting} PAC:${h.attrs.pace} TEC:${h.attrs.technique} PHY:${h.attrs.physical}`);
  }
}
