/**
 * Unit tests for src/utils/lineup.js
 * Run: node test/sims/lineup-sim.mjs
 */

import { buildAssistantLineup, buildPresetLineup, sanitizePreset } from '../../src/utils/lineup.js';

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

// Helpers
const makePlayer = (id, pos, ovr, opts = {}) => ({
  id, name: `Player_${id}`, position: pos,
  attrs: { pace: ovr, shooting: ovr, passing: ovr, defending: ovr, physical: ovr, technique: ovr, mental: ovr },
  ...(opts.injury ? { injury: { name: "Test", weeksLeft: 2 } } : {}),
  ...(opts.isLegend ? { isLegend: true, legendAppearances: opts.legendAppearances || 0 } : {}),
  ...(opts.learnedPositions ? { learnedPositions: opts.learnedPositions } : {}),
});

const FORMATION_433 = [
  { pos: "GK" }, { pos: "LB" }, { pos: "CB" }, { pos: "CB" }, { pos: "RB" },
  { pos: "CM" }, { pos: "CM" }, { pos: "AM" },
  { pos: "LW" }, { pos: "ST" }, { pos: "RW" },
];

const FORMATION_352 = [
  { pos: "GK" }, { pos: "CB" }, { pos: "CB" }, { pos: "CB" },
  { pos: "CM" }, { pos: "CM" }, { pos: "CM" }, { pos: "AM" }, { pos: "AM" },
  { pos: "ST" }, { pos: "ST" },
];

function buildSquad() {
  return [
    makePlayer("gk1", "GK", 10), makePlayer("gk2", "GK", 7),
    makePlayer("lb1", "LB", 12), makePlayer("cb1", "CB", 14), makePlayer("cb2", "CB", 11), makePlayer("cb3", "CB", 9),
    makePlayer("rb1", "RB", 13),
    makePlayer("cm1", "CM", 15), makePlayer("cm2", "CM", 10), makePlayer("cm3", "CM", 8),
    makePlayer("am1", "AM", 13),
    makePlayer("lw1", "LW", 14), makePlayer("st1", "ST", 16), makePlayer("rw1", "RW", 12),
    makePlayer("st2", "ST", 9), makePlayer("rw2", "RW", 7),
  ];
}

// === buildAssistantLineup ===
console.log("\n--- buildAssistantLineup ---");

{
  const squad = buildSquad();
  const result = buildAssistantLineup(squad, FORMATION_433);
  assert(result.startingXI.length === 11, "produces 11 starters");
  assert(result.bench.length === 5, "produces 5 bench");
  assert(result.slots.length === 16, "produces 16 slots");
  assert(result.startingXI.includes("gk1"), "picks best GK");
  assert(result.startingXI.includes("st1"), "picks best ST");
  assert(!result.startingXI.includes("gk2"), "backup GK on bench not XI");
  console.log("  Assistant lineup: basic ✓");
}

{
  const squad = buildSquad();
  const legend = makePlayer("leg1", "ST", 20, { isLegend: true });
  squad.push(legend);
  const withLegends = buildAssistantLineup(squad, FORMATION_433, { excludeLegends: true });
  assert(!withLegends.startingXI.includes("leg1"), "excludeLegends=true skips legend");
  const fansXI = buildAssistantLineup(squad, FORMATION_433, { excludeLegends: false });
  assert(fansXI.startingXI.includes("leg1"), "excludeLegends=false includes legend");
  console.log("  Legend handling ✓");
}

{
  const squad = buildSquad();
  squad.find(p => p.id === "st1").injury = { name: "Test", weeksLeft: 2 };
  const result = buildAssistantLineup(squad, FORMATION_433);
  assert(!result.startingXI.includes("st1"), "injured player excluded from XI");
  console.log("  Injury exclusion ✓");
}

// === sanitizePreset ===
console.log("\n--- sanitizePreset ---");

{
  const squad = buildSquad();
  const preset = {
    slots: ["gk1", "lb1", "cb1", "cb2", "rb1", "cm1", "cm2", "am1", "lw1", "st1", "rw1", "gk2", "cb3", "cm3", "st2", "rw2"],
    formationSnapshot: FORMATION_433,
  };
  const result = sanitizePreset(preset, squad);
  assert(result.available.size === 16, "all players available");
  assert(result.unavailable.size === 0, "no unavailable");
  assert(!result.pruned, "nothing pruned");
  console.log("  Full squad intact ✓");
}

{
  const squad = buildSquad().filter(p => p.id !== "st1"); // st1 "sold"
  const preset = {
    slots: ["gk1", "lb1", "cb1", "cb2", "rb1", "cm1", "cm2", "am1", "lw1", "st1", "rw1", "gk2", "cb3", "cm3", "st2", "rw2"],
    formationSnapshot: FORMATION_433,
  };
  const result = sanitizePreset(preset, squad);
  assert(result.pruned, "detects pruned player");
  assert(!result.available.has("st1"), "sold player not available");
  assert(result.cleanedSlots[9] === null, "sold player slot nulled");
  console.log("  Sold player pruned ✓");
}

{
  const squad = buildSquad();
  squad.find(p => p.id === "cb1").injury = { name: "Test", weeksLeft: 3 };
  const preset = {
    slots: ["gk1", "lb1", "cb1", "cb2", "rb1", "cm1", "cm2", "am1", "lw1", "st1", "rw1", "gk2", "cb3", "cm3", "st2", "rw2"],
    formationSnapshot: FORMATION_433,
  };
  const result = sanitizePreset(preset, squad);
  assert(result.unavailable.has("cb1"), "injured player marked unavailable");
  assert(!result.pruned, "injured player NOT pruned");
  console.log("  Injured player skipped but not pruned ✓");
}

// === buildPresetLineup ===
console.log("\n--- buildPresetLineup ---");

{
  const squad = buildSquad();
  const preset = {
    slots: ["gk1", "lb1", "cb1", "cb2", "rb1", "cm1", "cm2", "am1", "lw1", "st1", "rw1", "gk2", "cb3", "cm3", "st2", "rw2"],
    formationSnapshot: FORMATION_433,
  };
  const result = buildPresetLineup(preset, squad, FORMATION_433);
  assert(result.startingXI.length === 11, "11 starters");
  assert(result.slots[0] === "gk1", "exact slot 0 restored");
  assert(result.slots[9] === "st1", "exact slot 9 restored");
  assert(!result.pruned, "nothing pruned");
  console.log("  Same formation exact restore ✓");
}

{
  const squad = buildSquad();
  const preset = {
    slots: ["gk1", "lb1", "cb1", "cb2", "rb1", "cm1", "cm2", "am1", "lw1", "st1", "rw1", "gk2", "cb3", "cm3", "st2", "rw2"],
    formationSnapshot: FORMATION_433,
  };
  const result = buildPresetLineup(preset, squad, FORMATION_352);
  assert(result.startingXI.length === 11, "11 starters after remap");
  assert(result.startingXI.includes("gk1"), "GK preserved");
  assert(result.startingXI.includes("st1"), "ST preserved");
  assert(result.startingXI.includes("cm1"), "CM preserved");
  console.log("  Formation change remap ✓");
}

{
  const squad = buildSquad();
  squad.find(p => p.id === "st1").injury = { name: "Test", weeksLeft: 2 };
  const preset = {
    slots: ["gk1", "lb1", "cb1", "cb2", "rb1", "cm1", "cm2", "am1", "lw1", "st1", "rw1", "gk2", "cb3", "cm3", "st2", "rw2"],
    formationSnapshot: FORMATION_433,
  };
  const result = buildPresetLineup(preset, squad, FORMATION_433);
  assert(!result.startingXI.includes("st1"), "injured ST excluded");
  assert(result.startingXI.length === 11, "still 11 starters with fallback");
  assert(result.startingXI.includes("st2"), "backup ST fills in");
  console.log("  Injured player fallback ✓");
}

{
  const squad = buildSquad();
  const preset = {
    slots: ["gk1", "lb1", "cb1", "cb2", "rb1", "cm1", "cm2", "am1", "lw1", "st1", "rw1", "gk2", "cm3", "cb3", "st2", "rw2"],
    formationSnapshot: FORMATION_433,
  };
  const result = buildPresetLineup(preset, squad, FORMATION_433);
  // Bench should preserve saved order: gk2, cm3, cb3, st2, rw2
  assert(result.bench[0] === "gk2", "bench order preserved: pos 0");
  assert(result.bench[1] === "cm3", "bench order preserved: pos 1");
  console.log("  Saved bench order preserved ✓");
}

// Summary
console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
