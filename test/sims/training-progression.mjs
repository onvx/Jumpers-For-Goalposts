/**
 * Training Progression Analysis
 * Simulates weekly training for players of various ages/potentials
 * and measures weeks-to-level-up, OVR growth velocity, and cap approach.
 * Compares current rates vs proposed 50% nerf.
 */

import { getTrainingProgress, getOverall } from '../../src/utils/calc.js';
import { ATTRIBUTES } from '../../src/data/training.js';

const SEASONS = parseInt(process.argv[2]) || 10;
const WEEKS_PER_SEASON = 25; // ~25 training weeks in a 48-week season

// Simulate one player's training over N seasons
function simulateTraining(profile, nerfFactor = 1.0) {
  const { startAge, startAttrs, potential, position, focusAttr, label } = profile;

  // Clone attrs
  const attrs = { ...startAttrs };
  const statProgress = {};
  ATTRIBUTES.forEach(a => { statProgress[a.key] = 0; });

  let age = startAge;
  const ovrCap = 20;
  const seasonLog = [];

  for (let season = 0; season < SEASONS; season++) {
    const seasonStartOvr = getOverall({ position, attrs: { ...attrs } });
    let levelUps = 0;

    for (let week = 0; week < WEEKS_PER_SEASON; week++) {
      const overall = getOverall({ position, attrs });
      const current = attrs[focusAttr];
      if (current >= ovrCap) continue;

      // Focused training on one attr
      const appearanceRate = 0.7; // typical starter
      const rawProgress = getTrainingProgress(current, age, potential, overall, appearanceRate, ovrCap);
      const progressGain = rawProgress * 1.0 * nerfFactor; // focusMultiplier=1.0 for focused training

      statProgress[focusAttr] = (statProgress[focusAttr] || 0) + progressGain;

      if (statProgress[focusAttr] >= 1.0) {
        while (statProgress[focusAttr] >= 1.0 && attrs[focusAttr] < ovrCap) {
          statProgress[focusAttr] -= 1.0;
          attrs[focusAttr]++;
          levelUps++;
        }
        if (attrs[focusAttr] >= ovrCap) statProgress[focusAttr] = 0;
      }
    }

    const seasonEndOvr = getOverall({ position, attrs: { ...attrs } });
    seasonLog.push({
      season: season + 1,
      age,
      focusedAttr: attrs[focusAttr],
      ovr: seasonEndOvr,
      ovrDelta: seasonEndOvr - seasonStartOvr,
      levelUps,
    });

    age++; // age one year per season
  }

  return { label, seasonLog, finalAttrs: { ...attrs } };
}

// Player profiles to test
const baseAttrs = (val) => {
  const a = {};
  ATTRIBUTES.forEach(attr => { a[attr.key] = val; });
  return a;
};

const profiles = [
  { label: "Young talent (19, pot 14, start 3)", startAge: 19, startAttrs: baseAttrs(3), potential: 14, position: "CM", focusAttr: "passing" },
  { label: "Young talent (19, pot 10, start 3)", startAge: 19, startAttrs: baseAttrs(3), potential: 10, position: "CM", focusAttr: "passing" },
  { label: "Prime player (25, pot 16, start 10)", startAge: 25, startAttrs: baseAttrs(10), potential: 16, position: "ST", focusAttr: "shooting" },
  { label: "Prime player (25, pot 12, start 10)", startAge: 25, startAttrs: baseAttrs(10), potential: 12, position: "ST", focusAttr: "shooting" },
  { label: "Veteran (30, pot 14, start 13)", startAge: 30, startAttrs: baseAttrs(13), potential: 14, position: "CB", focusAttr: "defending" },
  { label: "Low ceiling (22, pot 8, start 4)", startAge: 22, startAttrs: baseAttrs(4), potential: 8, position: "RW", focusAttr: "shooting" },
];

console.log(`\n=== TRAINING PROGRESSION (${SEASONS} seasons, ${WEEKS_PER_SEASON} training weeks/season) ===\n`);

for (const profile of profiles) {
  console.log(`--- ${profile.label} ---`);

  // Current rate
  const current = simulateTraining(profile, 1.0);
  // Proposed nerfed rate (50%)
  const nerfed = simulateTraining(profile, 0.5);

  console.log(`  Season | Current OVR (delta) [focused attr] | Nerfed OVR (delta) [focused attr]`);
  console.log(`  -------|-------------------------------------|-----------------------------------`);

  for (let i = 0; i < SEASONS; i++) {
    const c = current.seasonLog[i];
    const n = nerfed.seasonLog[i];
    const cStr = `  ${String(c.season).padStart(2)}     | OVR ${String(c.ovr).padStart(2)} (${c.ovrDelta >= 0 ? '+' : ''}${c.ovrDelta}) [${profile.focusAttr}: ${String(c.focusedAttr).padStart(2)}, +${c.levelUps}]`;
    const nStr = `OVR ${String(n.ovr).padStart(2)} (${n.ovrDelta >= 0 ? '+' : ''}${n.ovrDelta}) [${profile.focusAttr}: ${String(n.focusedAttr).padStart(2)}, +${n.levelUps}]`;
    console.log(`${cStr.padEnd(50)}| ${nStr}`);
  }
  console.log('');
}

// Also show weeks-to-first-levelup at various stat levels
console.log(`\n=== WEEKS TO FIRST LEVEL-UP (focused training, age 23, potential 15, OVR=stat) ===\n`);
console.log(`  Stat Level | Current | Nerfed (50%) | Ratio`);
console.log(`  -----------|---------|--------------|------`);

for (let stat = 3; stat <= 18; stat++) {
  let weeksCurrent = 0, weeksNerfed = 0;
  let progC = 0, progN = 0;

  while (progC < 1.0 && weeksCurrent < 200) {
    progC += getTrainingProgress(stat, 23, 15, stat, 0.7, 20) * 1.0;
    weeksCurrent++;
  }
  while (progN < 1.0 && weeksNerfed < 200) {
    progN += getTrainingProgress(stat, 23, 15, stat, 0.7, 20) * 0.5;
    weeksNerfed++;
  }

  const ratio = weeksNerfed / weeksCurrent;
  console.log(`  ${String(stat).padStart(5)}      | ${String(weeksCurrent).padStart(4)}w   | ${String(weeksNerfed).padStart(5)}w       | ${ratio.toFixed(1)}x`);
}
