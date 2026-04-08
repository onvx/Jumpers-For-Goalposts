/**
 * Starting Squad vs Tier Analysis
 * Generates 500 player squads and compares their OVR distribution
 * to each tier's AI band. Also analyses age/potential distributions.
 */

import { generateSquad, generateAITeam } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';

const N = 500;

console.log(`\n=== STARTING SQUAD ANALYSIS (${N} squads) ===\n`);

const allSquadOVRs = [];
const allPlayerOVRs = [];
const ageDistribution = {};
const potentialDistribution = {};

for (let i = 0; i < N; i++) {
  const squad = generateSquad();
  const ovrs = squad.map(p => getOverall(p));
  const avgOVR = ovrs.reduce((s, v) => s + v, 0) / ovrs.length;
  allSquadOVRs.push(avgOVR);

  for (const p of squad) {
    const ovr = getOverall(p);
    allPlayerOVRs.push(ovr);
    const ageBucket = Math.floor(p.age / 5) * 5; // 15-19, 20-24, 25-29, 30-34
    ageDistribution[ageBucket] = (ageDistribution[ageBucket] || 0) + 1;
    const potBucket = Math.min(20, Math.max(1, p.potential));
    potentialDistribution[potBucket] = (potentialDistribution[potBucket] || 0) + 1;
  }
}

// Squad average OVR stats
const sorted = allSquadOVRs.sort((a, b) => a - b);
const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
const p10 = sorted[Math.floor(sorted.length * 0.1)];
const p50 = sorted[Math.floor(sorted.length * 0.5)];
const p90 = sorted[Math.floor(sorted.length * 0.9)];
const min = sorted[0];
const max = sorted[sorted.length - 1];

console.log(`Squad Average OVR:`);
console.log(`  Mean: ${avg.toFixed(1)} | Median: ${p50.toFixed(1)} | p10: ${p10.toFixed(1)} | p90: ${p90.toFixed(1)} | Range: ${min.toFixed(1)}-${max.toFixed(1)}`);

// Squad OVR distribution buckets
const ovrBuckets = {};
allSquadOVRs.forEach(v => { const b = Math.round(v); ovrBuckets[b] = (ovrBuckets[b] || 0) + 1; });
console.log(`  Distribution: ${Object.entries(ovrBuckets).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([k,v])=>`OVR ${k}: ${(v/N*100).toFixed(0)}%`).join(' | ')}`);

// Individual player OVR distribution
const playerOvrBuckets = {};
allPlayerOVRs.forEach(v => { playerOvrBuckets[v] = (playerOvrBuckets[v] || 0) + 1; });
console.log(`\nIndividual Player OVR distribution (${allPlayerOVRs.length} players):`);
console.log(`  ${Object.entries(playerOvrBuckets).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([k,v])=>`${k}: ${(v/allPlayerOVRs.length*100).toFixed(1)}%`).join(' | ')}`);

// Age distribution
console.log(`\nAge distribution:`);
console.log(`  ${Object.entries(ageDistribution).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([k,v])=>`${k}-${parseInt(k)+4}: ${(v/allPlayerOVRs.length*100).toFixed(0)}%`).join(' | ')}`);

// Potential distribution
console.log(`\nPotential distribution:`);
const potSorted = Object.entries(potentialDistribution).sort((a,b)=>parseInt(a[0])-parseInt(b[0]));
console.log(`  ${potSorted.map(([k,v])=>`${k}: ${(v/allPlayerOVRs.length*100).toFixed(1)}%`).join(' | ')}`);

// Compare to each tier
console.log(`\n=== STARTING SQUAD vs TIER AI BANDS ===\n`);
console.log(`Player squad avg OVR: ${avg.toFixed(1)} (p10-p90: ${p10.toFixed(1)}-${p90.toFixed(1)})\n`);

for (let tier = 11; tier >= 1; tier--) {
  const def = LEAGUE_DEFS[tier];
  // Generate AI teams for this tier and get avg OVR
  const aiOVRs = [];
  for (let t = 0; t < 3; t++) {
    for (const teamDef of def.teams) {
      const team = generateAITeam(teamDef.name, teamDef.color, teamDef.strength, teamDef.trait, tier, 0, 0, teamDef.natMix);
      const starters = team.squad.filter(p => !p.isBench);
      const ovr = starters.reduce((s, p) => s + getOverall(p), 0) / starters.length;
      aiOVRs.push(ovr);
    }
  }
  const aiAvg = aiOVRs.reduce((s, v) => s + v, 0) / aiOVRs.length;
  const aiMin = Math.min(...aiOVRs);
  const aiMax = Math.max(...aiOVRs);

  const playerAbove = allSquadOVRs.filter(v => v > aiMax).length / N * 100;
  const playerWithin = allSquadOVRs.filter(v => v >= aiMin && v <= aiMax).length / N * 100;
  const playerBelow = allSquadOVRs.filter(v => v < aiMin).length / N * 100;

  const status = playerAbove > 80 ? 'CAKEWALK' : playerAbove > 50 ? 'EASY' : playerWithin > 40 ? 'COMPETITIVE' : 'HARD';
  console.log(`  T${String(tier).padStart(2)} ${def.name.padEnd(24)} AI OVR: ${aiMin.toFixed(1)}-${aiMax.toFixed(1)} (avg ${aiAvg.toFixed(1)}) | Player above: ${playerAbove.toFixed(0)}% within: ${playerWithin.toFixed(0)}% below: ${playerBelow.toFixed(0)}% → ${status}`);
}

// Retirement analysis
console.log(`\n=== RETIREMENT CURVE (simulate aging 1000 players from age 17-33) ===\n`);
import { checkRetirements } from '../../src/utils/player.js';

const retiredAt = {};
const testPlayers = [];
for (let i = 0; i < 1000; i++) {
  const age = 17 + Math.floor(Math.random() * 17); // 17-33
  testPlayers.push({ id: `test_${i}`, age, name: `Player ${i}`, position: 'CM', attrs: { pace: 10, shooting: 10, passing: 10, defending: 10, physical: 10, technique: 10, mental: 10 } });
}

// Age each group by 1 year at a time and check retirements
for (let year = 0; year < 25; year++) {
  const aged = testPlayers.filter(p => !retiredAt[p.id]).map(p => ({ ...p, age: p.age + year }));
  const retiring = checkRetirements(aged, year + 1);
  retiring.forEach(id => {
    const p = aged.find(pl => pl.id === id);
    if (p && !retiredAt[id]) retiredAt[id] = p.age;
  });
}

// Retirement age distribution
const retireAgeBuckets = {};
Object.values(retiredAt).forEach(age => {
  retireAgeBuckets[age] = (retireAgeBuckets[age] || 0) + 1;
});
const neverRetired = testPlayers.filter(p => !retiredAt[p.id]).length;

console.log(`  Retired: ${Object.values(retiredAt).length}/${testPlayers.length} | Never retired (in 25 years): ${neverRetired}`);
console.log(`  Age distribution:`);
const retireSorted = Object.entries(retireAgeBuckets).sort((a,b) => parseInt(a[0]) - parseInt(b[0]));
for (const [age, count] of retireSorted) {
  const bar = '#'.repeat(Math.round(count / 3));
  console.log(`    ${String(age).padStart(2)}: ${String(count).padStart(3)} ${bar}`);
}
const retireAges = Object.values(retiredAt);
const avgRetire = retireAges.reduce((s, v) => s + v, 0) / retireAges.length;
console.log(`  Average retirement age: ${avgRetire.toFixed(1)}`);
