/**
 * Full League Season Simulation
 * Runs complete leagues at various tiers to measure:
 * - Point spreads, title margins, relegation battles
 * - How competitive/lopsided leagues are
 * - Upset frequency
 */

import { simulateMatch, generateFixtures } from '../../src/utils/match.js';
import { generateAITeam } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';

const SEASONS_PER_TIER = parseInt(process.argv[2]) || 100;
const TIERS = [11, 8, 5, 3, 1];

function avgOVR(squad) {
  const starters = squad.filter(p => !p.isBench);
  return starters.reduce((s, p) => s + getOverall(p), 0) / starters.length;
}

console.log(`\n=== FULL LEAGUE SEASON SIM (${SEASONS_PER_TIER} seasons per tier) ===\n`);

for (const tier of TIERS) {
  const def = LEAGUE_DEFS[tier];
  const teamCount = def.teams.length;

  const allMargins = [];
  const allPointSpreads = [];
  const allChampionStrengthRanks = [];
  const allRelegatedStrengthRanks = [];
  const allUpsets = { total: 0, matches: 0 };

  for (let season = 0; season < SEASONS_PER_TIER; season++) {
    // Generate all teams for this tier
    const teams = def.teams.map(t =>
      generateAITeam(t.name, t.color, t.strength, t.trait, tier, 0, 0, t.natMix)
    );

    // Strength rankings (by OVR, descending)
    const strengthRanked = teams.map((t, i) => ({ idx: i, ovr: avgOVR(t.squad), strength: def.teams[i].strength }))
      .sort((a, b) => b.ovr - a.ovr);

    // Generate fixtures (round-robin home and away)
    const fixtures = generateFixtures(teamCount);

    // Table
    const table = teams.map((_, i) => ({
      teamIndex: i, played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
    }));

    // Play all matchweeks
    for (const week of fixtures) {
      for (const fix of week) {
        const result = simulateMatch(teams[fix.home], teams[fix.away], null, null, false, 1.0, 0, null, 0, {});
        const hr = table[fix.home];
        const ar = table[fix.away];
        hr.played++; ar.played++;
        hr.goalsFor += result.homeGoals; hr.goalsAgainst += result.awayGoals;
        ar.goalsFor += result.awayGoals; ar.goalsAgainst += result.homeGoals;
        if (result.homeGoals > result.awayGoals) {
          hr.wins++; hr.points += 3; ar.losses++;
        } else if (result.homeGoals < result.awayGoals) {
          ar.wins++; ar.points += 3; hr.losses++;
        } else {
          hr.draws++; hr.points += 1; ar.draws++; ar.points += 1;
        }

        // Upset tracking: weaker team (by strength) wins
        const homeStr = def.teams[fix.home].strength;
        const awayStr = def.teams[fix.away].strength;
        allUpsets.matches++;
        if (result.homeGoals > result.awayGoals && homeStr < awayStr - 0.1) allUpsets.total++;
        if (result.awayGoals > result.homeGoals && awayStr < homeStr - 0.1) allUpsets.total++;
      }
    }

    // Sort table
    table.sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor);

    const champion = table[0];
    const second = table[1];
    const last = table[table.length - 1];

    allMargins.push(champion.points - second.points);
    allPointSpreads.push(champion.points - last.points);

    // What strength rank was the champion?
    const champStrRank = strengthRanked.findIndex(s => s.idx === champion.teamIndex) + 1;
    allChampionStrengthRanks.push(champStrRank);

    // What strength rank was the relegated team?
    const relegatedStrRank = strengthRanked.findIndex(s => s.idx === last.teamIndex) + 1;
    allRelegatedStrengthRanks.push(relegatedStrRank);
  }

  // Report
  const avgMargin = allMargins.reduce((s, m) => s + m, 0) / allMargins.length;
  const avgSpread = allPointSpreads.reduce((s, m) => s + m, 0) / allPointSpreads.length;
  const champRank1 = allChampionStrengthRanks.filter(r => r === 1).length;
  const champRank2 = allChampionStrengthRanks.filter(r => r === 2).length;
  const champRank3 = allChampionStrengthRanks.filter(r => r === 3).length;
  const champRankLow = allChampionStrengthRanks.filter(r => r >= 5).length;
  const relegatedTop5 = allRelegatedStrengthRanks.filter(r => r <= 5).length;

  const marginBuckets = {};
  allMargins.forEach(m => { const b = Math.min(m, 15); marginBuckets[b] = (marginBuckets[b] || 0) + 1; });

  console.log(`--- Tier ${tier}: ${def.name} (${teamCount} teams, ${def.ovrMin}-${def.ovrMax} OVR) ---`);
  console.log(`  Title margin: avg ${avgMargin.toFixed(1)} pts | 1-2: ${(allMargins.filter(m=>m<=2).length/SEASONS_PER_TIER*100).toFixed(0)}% | 3-5: ${(allMargins.filter(m=>m>=3&&m<=5).length/SEASONS_PER_TIER*100).toFixed(0)}% | 6+: ${(allMargins.filter(m=>m>=6).length/SEASONS_PER_TIER*100).toFixed(0)}%`);
  console.log(`  Point spread (1st-last): avg ${avgSpread.toFixed(1)} pts`);
  console.log(`  Champion by strength rank: #1 ${champRank1}% | #2 ${champRank2}% | #3 ${champRank3}% | #5+ ${champRankLow}%`);
  console.log(`  Relegated despite top-5 strength: ${relegatedTop5}%`);
  console.log(`  Upset rate (weaker wins, >0.1 str gap): ${(allUpsets.total/allUpsets.matches*100).toFixed(1)}%`);
  console.log('');
}
