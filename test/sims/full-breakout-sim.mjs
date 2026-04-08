/**
 * Full Breakout System Simulation
 * Uses the actual checkBreakouts function with all constraints (cooldown, type caps, etc.)
 * Tests all positions with current triggers + proposed new GK triggers
 */

import { simulateMatch } from '../../src/utils/match.js';
import { generateAITeam } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';
import { POSITION_TYPES } from '../../src/data/positions.js';
import { checkBreakouts } from '../../src/utils/breakouts.js';

const SEASONS = parseInt(process.argv[2]) || 200;
const MATCHES_PER_SEASON = 18;
const TIER = 7;
const OVR_CAP = 20;

function buildPlayerTeam(tier) {
  const team = generateAITeam("Player FC", "#4ade80", 0.7, "gritty", tier, 0, 0);
  team.isPlayer = true;
  const xi = team.squad.filter(p => !p.isBench).map(p => p.id);
  return { team, xi };
}

function buildOpponent(tier) {
  const def = LEAGUE_DEFS[tier];
  const t = def.teams[Math.floor(Math.random() * def.teams.length)];
  return generateAITeam(t.name, t.color, t.strength, t.trait, tier, 0, 0);
}

console.log(`\n=== FULL BREAKOUT SIM — ALL POSITIONS (${SEASONS} seasons, ${MATCHES_PER_SEASON} matches, Tier ${TIER}) ===`);
console.log(`  Using actual checkBreakouts() with cooldown=${3}, type caps, season cap=2\n`);

const triggerFires = {};
const positionBreakouts = { FWD: 0, MID: 0, DEF: 0, GK: 0 };
const positionPlayers = { FWD: 0, MID: 0, DEF: 0, GK: 0 };
let totalBreakoutsPerSeason = [];

for (let season = 0; season < SEASONS; season++) {
  const { team, xi } = buildPlayerTeam(TIER);
  const playerMatchLogs = {};
  const breakoutsThisSeason = new Map();
  let seasonBreakouts = 0;

  // Count players by position
  const starters = team.squad.filter(p => xi.includes(p.id));
  for (const p of starters) {
    const type = POSITION_TYPES[p.position];
    if (type) positionPlayers[type] = (positionPlayers[type] || 0) + 1;
  }

  for (let match = 0; match < MATCHES_PER_SEASON; match++) {
    const opp = buildOpponent(TIER);
    const isHome = match % 2 === 0;
    const home = isHome ? team : opp;
    const away = isHome ? opp : team;
    const result = simulateMatch(home, away, xi, [], false, 1.0, 0, null, 0, {});

    const side = isHome ? "home" : "away";
    const oppGoals = isHome ? result.awayGoals : result.homeGoals;
    const playerGoals = isHome ? result.homeGoals : result.awayGoals;
    const isCleanSheet = oppGoals === 0;
    const teamWon = playerGoals > oppGoals;
    const vsLeader = Math.random() < 0.1;

    // Determine winning goal scorer
    let winningGoalScorer = null;
    if (playerGoals > oppGoals && result.events) {
      const goalEvents = result.events.filter(e => e.type === "goal").sort((a, b) => a.minute - b.minute);
      const target = oppGoals + 1;
      let h = 0, a = 0;
      for (const g of goalEvents) {
        if (g.side === "home") h++; else a++;
        const pg = isHome ? h : a;
        if (pg === target && g.side === side) { winningGoalScorer = g.player; break; }
      }
    }

    // Build match log entries for each starter
    for (const pid of xi) {
      const p = team.squad.find(pl => pl.id === pid);
      if (!p) continue;
      const pr = result.playerRatings?.find(r => r.id === pid);
      const goals = result.scorersByID?.[`${side}|${pid}`] || 0;
      const assists = result.assistersByID?.[`${side}|${pid}`] || 0;

      const entry = {
        goals, assists,
        rating: pr?.rating || 6.0,
        motm: result.motmName === pr?.name,
        cleanSheet: isCleanSheet,
        cup: false,
        away: !isHome,
        oppStrength: opp.strength || 0.5,
        winningGoal: winningGoalScorer === pr?.name,
        vsLeader,
        teamWon,
        season,
        calendarIndex: match * 2,
      };

      if (!playerMatchLogs[pid]) playerMatchLogs[pid] = [];
      playerMatchLogs[pid].push(entry);
    }

    // Run actual checkBreakouts with only starters who played
    const matchdaySquad = team.squad.filter(p => xi.includes(p.id));
    const breakoutResults = checkBreakouts(matchdaySquad, playerMatchLogs, breakoutsThisSeason, OVR_CAP, false);

    for (const bo of breakoutResults) {
      const type = POSITION_TYPES[bo.playerPosition];
      positionBreakouts[type] = (positionBreakouts[type] || 0) + 1;
      triggerFires[bo.trigger.id] = (triggerFires[bo.trigger.id] || 0) + 1;
      seasonBreakouts++;

      // Update breakoutsThisSeason the same way App.jsx does
      const raw = breakoutsThisSeason.get(bo.playerId);
      const entry = raw instanceof Set
        ? { triggers: raw, lastLogIndex: bo.logIndex }
        : (raw || { triggers: new Set(), lastLogIndex: bo.logIndex });
      entry.triggers.add(bo.trigger.id);
      entry.lastLogIndex = bo.logIndex;
      breakoutsThisSeason.set(bo.playerId, entry);
    }
  }
  totalBreakoutsPerSeason.push(seasonBreakouts);
}

// Report by position group
console.log(`--- Breakouts per Position Group ---\n`);
console.log(`  Group | Breakouts | Players | Per player-season | Per season`);
console.log(`  ------|-----------|---------|-------------------|----------`);
for (const type of ['FWD', 'MID', 'DEF', 'GK']) {
  const bo = positionBreakouts[type] || 0;
  const pl = positionPlayers[type] || 1;
  const rate = (bo / pl).toFixed(2);
  const perSeason = (bo / SEASONS).toFixed(2);
  console.log(`  ${type.padEnd(5)} | ${String(bo).padStart(9)} | ${String(pl).padStart(7)} | ${rate.padStart(17)} | ${perSeason.padStart(9)}`);
}

const totalBO = Object.values(positionBreakouts).reduce((s, v) => s + v, 0);
const avgPerSeason = (totalBO / SEASONS).toFixed(1);
const minSeason = Math.min(...totalBreakoutsPerSeason);
const maxSeason = Math.max(...totalBreakoutsPerSeason);
const zeroSeasons = totalBreakoutsPerSeason.filter(n => n === 0).length;

console.log(`\n--- Season Summary ---\n`);
console.log(`  Total breakouts: ${totalBO} across ${SEASONS} seasons`);
console.log(`  Average per season: ${avgPerSeason}`);
console.log(`  Range: ${minSeason}-${maxSeason} per season`);
console.log(`  Seasons with 0 breakouts: ${zeroSeasons} (${(zeroSeasons/SEASONS*100).toFixed(1)}%)`);

// Report by individual trigger
console.log(`\n--- Individual Trigger Fire Rates ---\n`);
console.log(`  ${"Trigger".padEnd(30)} | Fires | Per season`);
console.log(`  ${"-".repeat(30)}-|-------|----------`);

// Import trigger definitions for labelling
import { BREAKOUT_TRIGGERS } from '../../src/data/breakoutTriggers.js';
const allGroups = ['FWD', 'MID', 'DEF', 'GK', 'UNIVERSAL'];
for (const group of allGroups) {
  const triggers = BREAKOUT_TRIGGERS[group] || [];
  for (const t of triggers) {
    const fires = triggerFires[t.id] || 0;
    const perSeason = (fires / SEASONS).toFixed(2);
    const flag = fires === 0 ? ' ← NEVER' : parseFloat(perSeason) > 1.5 ? ' ← FREQUENT' : '';
    console.log(`  ${(t.id + ` (${group})`).padEnd(30)} | ${String(fires).padStart(5)} | ${perSeason.padStart(9)}${flag}`);
  }
}

console.log(`\n  Target: 2-4 breakouts per season total, balanced across positions\n`);
