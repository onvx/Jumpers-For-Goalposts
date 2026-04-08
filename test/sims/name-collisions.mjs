/**
 * Name Collision Analysis
 * Over 20 seasons of AI evolution with retirements and replacements,
 * how often do duplicate names appear?
 */

import { generateAITeam, evolveAISquad, generateSquadPhilosophy } from '../../src/utils/player.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';

const SEASONS = 20;
const TRIALS = 10;

console.log(`\n=== NAME COLLISION ANALYSIS (${TRIALS} trials, ${SEASONS} seasons each) ===\n`);

let totalCollisionsSameTier = 0;
let totalCollisionsCrossTier = 0;
let totalChecks = 0;
const collisionExamples = [];

for (let trial = 0; trial < TRIALS; trial++) {
  // Generate a full pyramid of all 11 tiers
  const allSquads = {}; // tier -> [{ teamName, squad }]

  for (let tier = 1; tier <= 11; tier++) {
    const def = LEAGUE_DEFS[tier];
    allSquads[tier] = def.teams.map(t => {
      const team = generateAITeam(t.name, t.color, t.strength, t.trait, tier, 0, 0, t.natMix);
      const philosophy = generateSquadPhilosophy(t.trait);
      return { teamName: t.name, squad: team.squad, trait: t.trait, philosophy };
    });
  }

  for (let season = 0; season < SEASONS; season++) {
    // Check for name collisions within each tier
    for (let tier = 1; tier <= 11; tier++) {
      const allNames = [];
      for (const team of allSquads[tier]) {
        for (const p of team.squad) {
          allNames.push({ name: p.name, team: team.teamName, tier });
        }
      }

      // Find duplicates within this tier
      const nameCount = {};
      allNames.forEach(n => {
        nameCount[n.name] = (nameCount[n.name] || []);
        nameCount[n.name].push(n.team);
      });

      for (const [name, teams] of Object.entries(nameCount)) {
        const uniqueTeams = [...new Set(teams)];
        if (uniqueTeams.length > 1) {
          totalCollisionsSameTier++;
          if (collisionExamples.length < 20) {
            collisionExamples.push({ name, teams: uniqueTeams, tier, season: season + 1, type: 'same-tier' });
          }
        }
      }
      totalChecks++;
    }

    // Check for cross-tier collisions (same name in different tiers)
    const globalNames = {};
    for (let tier = 1; tier <= 11; tier++) {
      for (const team of allSquads[tier]) {
        for (const p of team.squad) {
          if (!globalNames[p.name]) globalNames[p.name] = [];
          globalNames[p.name].push({ tier, team: team.teamName });
        }
      }
    }

    for (const [name, appearances] of Object.entries(globalNames)) {
      const uniqueTiers = [...new Set(appearances.map(a => a.tier))];
      if (uniqueTiers.length > 1) {
        totalCollisionsCrossTier++;
        if (collisionExamples.length < 20 && !collisionExamples.find(e => e.name === name && e.type === 'cross-tier')) {
          const detail = appearances.slice(0, 3).map(a => `T${a.tier} ${a.team}`).join(', ');
          collisionExamples.push({ name, detail, season: season + 1, type: 'cross-tier', tiers: uniqueTiers });
        }
      }
    }

    // Evolve all squads for next season
    for (let tier = 1; tier <= 11; tier++) {
      allSquads[tier] = allSquads[tier].map(t => ({
        ...t,
        squad: evolveAISquad(t.squad, tier, t.trait, t.philosophy, 0),
      }));
    }
  }
}

const totalTierSeasons = TRIALS * SEASONS * 11;
console.log(`  Total tier-seasons checked: ${totalTierSeasons}`);
console.log(`  Same-tier collisions (same name on 2+ teams in same league): ${totalCollisionsSameTier}`);
console.log(`  Per tier-season: ${(totalCollisionsSameTier / totalTierSeasons).toFixed(2)}`);
console.log(`  Cross-tier collisions (same name in different tiers): ${totalCollisionsCrossTier}`);
console.log(`  Per season: ${(totalCollisionsCrossTier / (TRIALS * SEASONS)).toFixed(1)}`);

if (collisionExamples.length > 0) {
  console.log(`\n  Examples:`);
  for (const ex of collisionExamples.slice(0, 15)) {
    if (ex.type === 'same-tier') {
      console.log(`    "${ex.name}" plays for ${ex.teams.join(' AND ')} in T${ex.tier} (season ${ex.season})`);
    } else {
      console.log(`    "${ex.name}" appears in ${ex.detail} (season ${ex.season})`);
    }
  }
}

// Uniqueness rate
console.log(`\n--- Name Pool Exhaustion Check ---`);
// Generate 1000 players and check uniqueness
import { generateNameForNation, pickNationality } from '../../src/utils/player.js';
const testNames = new Set();
let dupes = 0;
for (let i = 0; i < 5000; i++) {
  const nat = pickNationality();
  const { name } = generateNameForNation(nat);
  if (testNames.has(name)) dupes++;
  testNames.add(name);
}
console.log(`  Generated 5000 random names: ${testNames.size} unique (${dupes} duplicates, ${(dupes/5000*100).toFixed(1)}% collision rate)`);
