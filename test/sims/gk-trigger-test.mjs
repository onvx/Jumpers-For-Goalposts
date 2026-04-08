/**
 * GK Trigger Candidate Fire Rate Analysis
 * Tests proposed new GK triggers against simulated match data
 */

import { simulateMatch } from '../../src/utils/match.js';
import { generateAITeam } from '../../src/utils/player.js';
import { getOverall } from '../../src/utils/calc.js';
import { LEAGUE_DEFS } from '../../src/data/leagues.js';
import { POSITION_TYPES } from '../../src/data/positions.js';

const SEASONS = parseInt(process.argv[2]) || 200;
const MATCHES_PER_SEASON = 18;
const TIER = 7;

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

// Trigger candidates
const CANDIDATES = {
  // EXISTING (for comparison)
  "gk_clean_streak_3 (existing)": {
    check: (log, i) => {
      if (!log[i]?.cleanSheet) return false;
      if (i < 2) return false;
      return log[i].cleanSheet && log[i-1].cleanSheet && log[i-2].cleanSheet;
    }
  },
  "gk_clean_sheets_4of6 (existing)": {
    check: (log, i) => {
      if (!log[i]?.cleanSheet) return false;
      if (i < 3) return false;
      let count = 0;
      for (let w = Math.max(0, i - 5); w <= i; w++) { if (log[w]?.cleanSheet) count++; }
      return count >= 4;
    }
  },
  "gk_motm_2of5 (existing)": {
    check: (log, i) => {
      if (!log[i]?.motm) return false;
      if (i < 1) return false;
      let count = 0;
      for (let w = Math.max(0, i - 4); w <= i; w++) { if (log[w]?.motm) count++; }
      return count >= 2;
    }
  },
  // NEW CANDIDATES — TUNED
  "The Great Wall (MOTM in loss/draw)": {
    check: (log, i) => log[i]?.motm && !log[i]?.teamWon,
  },
  "Fortress (2 consec home CS + win)": {
    check: (log, i) => {
      if (!log[i]?.cleanSheet || log[i]?.away || !log[i]?.teamWon) return false;
      const homeMatches = [];
      for (let w = i; w >= 0 && homeMatches.length < 2; w--) {
        if (!log[w]?.away) homeMatches.push(log[w]);
      }
      return homeMatches.length >= 2 && homeMatches.every(m => m.cleanSheet && m.teamWon);
    }
  },
  "Road Warrior (3of5 away CS)": {
    check: (log, i) => {
      if (!log[i]?.cleanSheet || !log[i]?.away) return false;
      const awayMatches = [];
      for (let w = i; w >= 0 && awayMatches.length < 5; w--) {
        if (log[w]?.away) awayMatches.push(log[w]);
      }
      if (awayMatches.length < 4) return false;
      return awayMatches.filter(m => m.cleanSheet).length >= 3;
    }
  },
  "Giant Killer (CS vs strong opp >0.55)": {
    check: (log, i) => log[i]?.cleanSheet && (log[i]?.oppStrength || 0) > 0.55 && log[i]?.teamWon,
  },
  "The Sweeper (2 MOTM in 6 without CS)": {
    check: (log, i) => {
      if (!log[i]?.motm || log[i]?.cleanSheet) return false;
      if (i < 1) return false;
      let count = 0;
      for (let w = Math.max(0, i - 5); w <= i; w++) {
        if (log[w]?.motm && !log[w]?.cleanSheet) count++;
      }
      return count >= 2;
    }
  },
  "Big Game Keeper (MOTM + CS vs leader)": {
    check: (log, i) => log[i]?.motm && log[i]?.vsLeader && log[i]?.cleanSheet,
  },
  "Iron Gloves (7.0+ avg over 6 with 0 MOTM)": {
    check: (log, i) => {
      if (i < 5) return false;
      const w = log.slice(i - 5, i + 1);
      const avg = w.reduce((s, m) => s + m.rating, 0) / w.length;
      return avg >= 7.0 && !w.some(m => m.motm);
    }
  },
  "Last Line (CS + team lost possession — high rating in defeat)": {
    check: (log, i) => {
      // GK rated 7.5+ in a match the team drew or lost (held them in it)
      return (log[i]?.rating || 0) >= 7.5 && !log[i]?.teamWon;
    }
  },
};

console.log(`\n=== GK TRIGGER CANDIDATE FIRE RATES (${SEASONS} seasons, ${MATCHES_PER_SEASON} matches each, Tier ${TIER}) ===\n`);

const triggerFires = {};
const triggerChecks = {};
let totalGKSeasons = 0;

for (let season = 0; season < SEASONS; season++) {
  const { team, xi } = buildPlayerTeam(TIER);
  const playerMatchLogs = {};
  const gkIds = new Set();

  // Find GK starters
  const starters = team.squad.filter(p => xi.includes(p.id));
  for (const p of starters) {
    if (POSITION_TYPES[p.position] === "GK") gkIds.add(p.id);
  }
  totalGKSeasons += gkIds.size;

  for (let match = 0; match < MATCHES_PER_SEASON; match++) {
    const opp = buildOpponent(TIER);
    const isHome = match % 2 === 0;
    const home = isHome ? team : opp;
    const away = isHome ? opp : team;
    const result = simulateMatch(home, away, xi, [], false, 1.0, 0, null, 0, {});

    const oppGoals = isHome ? result.awayGoals : result.homeGoals;
    const playerGoals = isHome ? result.homeGoals : result.awayGoals;
    const isCleanSheet = oppGoals === 0;
    const teamWon = playerGoals > oppGoals;
    const vsLeader = Math.random() < 0.1;

    for (const pid of gkIds) {
      const p = team.squad.find(pl => pl.id === pid);
      if (!p) continue;
      const pr = result.playerRatings?.find(r => r.id === pid);

      const entry = {
        goals: 0, assists: 0,
        rating: pr?.rating || 6.0,
        motm: result.motmName === pr?.name,
        cleanSheet: isCleanSheet,
        cup: false,
        away: !isHome,
        oppStrength: opp.strength || 0.5,
        winningGoal: false,
        vsLeader,
        teamWon,
      };

      if (!playerMatchLogs[pid]) playerMatchLogs[pid] = [];
      playerMatchLogs[pid].push(entry);

      const log = playerMatchLogs[pid];
      const i = log.length - 1;
      if (i < 2) continue;

      for (const [name, trigger] of Object.entries(CANDIDATES)) {
        triggerChecks[name] = (triggerChecks[name] || 0) + 1;
        try {
          if (trigger.check(log, i)) {
            triggerFires[name] = (triggerFires[name] || 0) + 1;
          }
        } catch (e) { /* skip */ }
      }
    }
  }
}

console.log(`  GK player-seasons: ${totalGKSeasons}\n`);
console.log(`  ${"Trigger".padEnd(42)} | Fires | Checks   | Rate     | Per GK-season`);
console.log(`  ${"-".repeat(42)}-|-------|----------|----------|-------------`);

for (const name of Object.keys(CANDIDATES)) {
  const fires = triggerFires[name] || 0;
  const checks = triggerChecks[name] || 1;
  const rate = (fires / checks * 100).toFixed(3);
  const perSeason = (fires / totalGKSeasons).toFixed(2);
  const flag = fires === 0 ? ' ← NEVER' : parseFloat(perSeason) > 2 ? ' ← TOO FREQUENT' : parseFloat(perSeason) < 0.05 ? ' ← VERY RARE' : '';
  console.log(`  ${name.padEnd(42)} | ${String(fires).padStart(5)} | ${String(checks).padStart(8)} | ${rate.padStart(7)}% | ${perSeason.padStart(12)}${flag}`);
}

console.log(`\n  Target: ~0.3-0.5 per GK per season (1 breakout every 2-3 seasons)\n`);
