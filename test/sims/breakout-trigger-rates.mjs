/**
 * Breakout Trigger Fire Rate Analysis
 * Simulates seasons of matches and tracks how often each trigger fires
 * per position group to identify which are too easy/hard.
 */

import { simulateMatch } from '../../src/utils/match.js';
import { generateAITeam, generateSquad } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';
import { POSITION_TYPES } from '../../src/data/positions.js';
import { BREAKOUT_TRIGGERS } from '../../src/data/breakoutTriggers.js';

const SEASONS = parseInt(process.argv[2]) || 50;
const MATCHES_PER_SEASON = 18;
const TIER = 7; // mid-tier where games are competitive

// Build a player team and opponent pool
function buildPlayerTeam(tier) {
  const team = generateAITeam("Player FC", "#4ade80", 0.7, "gritty", tier, 0, 0);
  team.isPlayer = true;
  const xi = team.squad.filter(p => !p.isBench).map(p => p.id);
  return { team, xi };
}

function buildOpponent(tier) {
  const def = LEAGUE_DEFS[tier];
  const t = def.teams[Math.floor(Math.random() * def.teams.length)];
  return generateAITeam(t.name, t.color, t.strength, t.trait, tier, 0, 0, t.natMix);
}

console.log(`\n=== BREAKOUT TRIGGER FIRE RATES (${SEASONS} seasons, ${MATCHES_PER_SEASON} matches each, Tier ${TIER}) ===\n`);

// Track per-player match logs (same structure as the game)
const triggerFires = {}; // { triggerId: count }
const triggerChecks = {}; // { triggerId: count } — how many times it was evaluated
const positionBreakouts = { FWD: 0, MID: 0, DEF: 0, GK: 0 };
const positionPlayers = { FWD: 0, MID: 0, DEF: 0, GK: 0 };
let totalSeasonPlayerSlots = 0;

for (let season = 0; season < SEASONS; season++) {
  const { team, xi } = buildPlayerTeam(TIER);
  const playerMatchLogs = {}; // { playerId: [...entries] }
  const breakoutsThisSeason = new Set();

  // Count players by position
  const starters = team.squad.filter(p => xi.includes(p.id));
  for (const p of starters) {
    const type = POSITION_TYPES[p.position];
    if (type) positionPlayers[type] = (positionPlayers[type] || 0) + 1;
  }
  totalSeasonPlayerSlots += starters.length;

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

    // Opponent is league leader ~10% of matches (1 team in 10)
    const vsLeader = Math.random() < 0.1;
    const teamWon = playerGoals > oppGoals;
    // Simulate ~4 cup matches per season
    const isCup = match >= 14;

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
        cup: isCup,
        away: !isHome,
        oppStrength: 0.5,
        winningGoal: winningGoalScorer === pr?.name,
        vsLeader,
        teamWon,
        season,
        calendarIndex: match * 2,
      };

      if (!playerMatchLogs[pid]) playerMatchLogs[pid] = [];
      playerMatchLogs[pid].push(entry);

      // Check breakout triggers after each match (if not already broken out)
      if (breakoutsThisSeason.has(pid)) continue;
      const log = playerMatchLogs[pid];
      if (log.length < 3) continue;

      const i = log.length - 1;
      const type = POSITION_TYPES[p.position];
      const ovr = getOverall(p);
      const ctx = { ovr };

      const posTriggers = BREAKOUT_TRIGGERS[type] || [];
      const uniTriggers = BREAKOUT_TRIGGERS.UNIVERSAL || [];
      const all = [...posTriggers, ...uniTriggers];

      for (const trigger of all) {
        triggerChecks[trigger.id] = (triggerChecks[trigger.id] || 0) + 1;
        try {
          if (trigger.check(log, i, ctx)) {
            triggerFires[trigger.id] = (triggerFires[trigger.id] || 0) + 1;
            positionBreakouts[type] = (positionBreakouts[type] || 0) + 1;
            breakoutsThisSeason.add(pid);
            break;
          }
        } catch (e) { /* skip */ }
      }
    }
  }
}

// Report by position group
console.log(`--- Breakouts per Position Group (${SEASONS} seasons) ---\n`);
console.log(`  Group | Breakouts | Players | Rate (per player-season) | Per season`);
console.log(`  ------|-----------|---------|--------------------------|----------`);
for (const type of ['FWD', 'MID', 'DEF', 'GK']) {
  const bo = positionBreakouts[type] || 0;
  const pl = positionPlayers[type] || 1;
  const rate = (bo / pl * 100).toFixed(1);
  const perSeason = (bo / SEASONS).toFixed(2);
  console.log(`  ${type.padEnd(5)} | ${String(bo).padStart(9)} | ${String(pl).padStart(7)} | ${rate.padStart(24)}% | ${perSeason.padStart(9)}`);
}

// Report by individual trigger
console.log(`\n--- Individual Trigger Fire Rates ---\n`);
console.log(`  Trigger                    | Group | Fires | Checks   | Rate     | Per season`);
console.log(`  ---------------------------|-------|-------|----------|----------|----------`);

const allGroups = ['FWD', 'MID', 'DEF', 'GK', 'UNIVERSAL'];
for (const group of allGroups) {
  const triggers = BREAKOUT_TRIGGERS[group] || [];
  for (const t of triggers) {
    const fires = triggerFires[t.id] || 0;
    const checks = triggerChecks[t.id] || 1;
    const rate = (fires / checks * 100).toFixed(3);
    const perSeason = (fires / SEASONS).toFixed(2);
    const flag = fires === 0 ? ' ← NEVER' : perSeason > 1 ? ' ← FREQUENT' : '';
    console.log(`  ${t.id.padEnd(27)} | ${group.padEnd(5)} | ${String(fires).padStart(5)} | ${String(checks).padStart(8)} | ${rate.padStart(7)}% | ${perSeason.padStart(9)}${flag}`);
  }
}

// Summary
const totalBreakouts = Object.values(positionBreakouts).reduce((s, v) => s + v, 0);
console.log(`\n  Total breakouts: ${totalBreakouts} across ${SEASONS} seasons (${(totalBreakouts / SEASONS).toFixed(1)} per season)`);
console.log(`  Total player-seasons: ${totalSeasonPlayerSlots} (${(totalBreakouts / totalSeasonPlayerSlots * 100).toFixed(2)}% breakout rate)`);
