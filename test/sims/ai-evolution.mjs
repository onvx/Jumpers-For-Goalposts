/**
 * AI Evolution Simulation
 * Runs evolveAISquad over 20 seasons for multiple tiers
 * and measures: OVR drift, squad turnover, retirement ages,
 * strength variance, and whether teams naturally diverge or converge.
 */

import { generateAITeam, evolveAISquad, generateSquadPhilosophy } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';

const SEASONS = parseInt(process.argv[2]) || 20;
const TIERS_TO_TEST = [11, 8, 5, 3, 1];

function squadAvgOVR(squad) {
  if (!squad || squad.length === 0) return 0;
  const starters = squad.filter(p => !p.isBench);
  if (starters.length === 0) return 0;
  return starters.reduce((s, p) => s + getOverall(p), 0) / starters.length;
}

function squadAvgAge(squad) {
  if (!squad || squad.length === 0) return 0;
  return squad.reduce((s, p) => s + (p.age || 25), 0) / squad.length;
}

console.log(`\n=== AI EVOLUTION OVER ${SEASONS} SEASONS ===\n`);

for (const tier of TIERS_TO_TEST) {
  const def = LEAGUE_DEFS[tier];
  console.log(`--- Tier ${tier}: ${def.name} (ovrMin: ${def.ovrMin}, ovrMax: ${def.ovrMax}) ---`);

  // Generate 3 teams with different traits to see divergence
  const teamConfigs = [
    { name: "Team A", strength: 0.90, trait: def.teams[0].trait },
    { name: "Team B", strength: 0.60, trait: def.teams[Math.floor(def.teams.length / 2)].trait },
    { name: "Team C", strength: 0.30, trait: def.teams[def.teams.length - 1].trait },
  ];

  for (const cfg of teamConfigs) {
    const philosophy = generateSquadPhilosophy(cfg.trait);
    let team = generateAITeam(cfg.name, '#fff', cfg.strength, cfg.trait, tier, 0, 0, null);
    let squad = team.squad;

    const log = [];

    for (let season = 0; season < SEASONS; season++) {
      const preSize = squad.length;
      const preOVR = squadAvgOVR(squad);
      const preAge = squadAvgAge(squad);

      squad = evolveAISquad(squad, tier, cfg.trait, philosophy, 0);

      const postSize = squad.length;
      const postOVR = squadAvgOVR(squad);
      const postAge = squadAvgAge(squad);
      const turnover = preSize - squad.filter(p => {
        // Count survivors by checking if any pre-evolution player IDs remain
        // Since evolveAISquad returns new array with same IDs for survivors, count matches
        return true; // simplified — turnover = preSize - postSize + replacements
      }).length;

      // Count young, prime, old
      const young = squad.filter(p => (p.age || 25) <= 24).length;
      const prime = squad.filter(p => (p.age || 25) >= 25 && (p.age || 25) <= 30).length;
      const old = squad.filter(p => (p.age || 25) >= 31).length;

      // OVR spread
      const ovrs = squad.filter(p => !p.isBench).map(p => getOverall(p));
      const ovrMin = Math.min(...ovrs);
      const ovrMax = Math.max(...ovrs);

      log.push({
        season: season + 1,
        size: postSize,
        avgOVR: postOVR,
        avgAge: postAge,
        ovrRange: `${ovrMin}-${ovrMax}`,
        young, prime, old,
      });
    }

    console.log(`\n  ${cfg.name} (str: ${cfg.strength}, trait: ${cfg.trait}, philosophy: target ${philosophy.targetSize}, youth ${(philosophy.youthRate * 100).toFixed(0)}%)`);
    console.log(`  Season | Size | Avg OVR | Avg Age | OVR Range | Young/Prime/Old`);
    console.log(`  -------|------|---------|---------|-----------|----------------`);

    for (const l of log) {
      console.log(`  ${String(l.season).padStart(4)}   | ${String(l.size).padStart(4)} | ${l.avgOVR.toFixed(1).padStart(7)} | ${l.avgAge.toFixed(1).padStart(7)} | ${l.ovrRange.padStart(9)} | ${l.young}/${l.prime}/${l.old}`);
    }
  }
  console.log('');
}

// Run 100 teams over 20 seasons at tier 7 to measure variance
console.log(`\n=== TIER 7 VARIANCE TEST (100 teams, ${SEASONS} seasons) ===\n`);
const tier7Results = [];
for (let i = 0; i < 100; i++) {
  const def = LEAGUE_DEFS[7];
  const trait = def.teams[i % def.teams.length].trait;
  const philosophy = generateSquadPhilosophy(trait);
  let team = generateAITeam(`Team${i}`, '#fff', 0.5 + Math.random() * 0.4, trait, 7, 0, 0, null);
  let squad = team.squad;
  const startOVR = squadAvgOVR(squad);

  for (let s = 0; s < SEASONS; s++) {
    squad = evolveAISquad(squad, 7, trait, philosophy, 0);
  }

  const endOVR = squadAvgOVR(squad);
  tier7Results.push({ startOVR, endOVR, drift: endOVR - startOVR });
}

const drifts = tier7Results.map(r => r.drift);
const avgDrift = drifts.reduce((s, d) => s + d, 0) / drifts.length;
const minDrift = Math.min(...drifts);
const maxDrift = Math.max(...drifts);
const endOVRs = tier7Results.map(r => r.endOVR);
const avgEnd = endOVRs.reduce((s, v) => s + v, 0) / endOVRs.length;
const minEnd = Math.min(...endOVRs);
const maxEnd = Math.max(...endOVRs);

console.log(`  Start OVR range: ${Math.min(...tier7Results.map(r => r.startOVR)).toFixed(1)} - ${Math.max(...tier7Results.map(r => r.startOVR)).toFixed(1)}`);
console.log(`  After ${SEASONS} seasons:`);
console.log(`    End OVR range: ${minEnd.toFixed(1)} - ${maxEnd.toFixed(1)} (avg ${avgEnd.toFixed(1)})`);
console.log(`    Drift range: ${minDrift.toFixed(1)} to ${maxDrift >= 0 ? '+' : ''}${maxDrift.toFixed(1)} (avg ${avgDrift >= 0 ? '+' : ''}${avgDrift.toFixed(1)})`);

// Distribution of end OVRs
const buckets = {};
for (const r of tier7Results) {
  const b = Math.round(r.endOVR);
  buckets[b] = (buckets[b] || 0) + 1;
}
console.log(`    End OVR distribution: ${Object.entries(buckets).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).map(([k,v]) => `${k}:${v}`).join(' ')}`);
