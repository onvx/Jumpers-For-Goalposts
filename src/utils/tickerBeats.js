import { sortStandings } from "./league.js";

/**
 * Build priority-ranked dashboard ticker beats.
 *
 * Returns an array of beat strings in priority order (highest first).
 * Caller can show the top N or rotate.
 *
 * Priority:
 *  1. League position changes (up/down/top/relegation zone)
 *  2. Streaks (wins, unbeaten, losses)
 *  3. Transfer window deadline (final week)
 *
 * If nothing fires, returns an empty array — caller should fall back
 * to default ticker content.
 */
export function buildTickerBeats({
  league,
  previousLeaguePosition,
  consecutiveWins,
  consecutiveUnbeaten,
  consecutiveLosses,
  transferWindowOpen,
  transferWindowWeeksRemaining,
}) {
  const beats = [];

  // === 1. League position changes ===
  if (league?.table && previousLeaguePosition != null) {
    const sorted = sortStandings(league.table);
    const playerIdx = sorted.findIndex(r => league.teams[r.teamIndex]?.isPlayer);
    if (playerIdx >= 0) {
      const currentPos = playerIdx + 1;
      const totalTeams = sorted.length;
      const promotionCutoff = 3;
      const relegationCutoff = totalTeams - 2;

      const wasInTop3 = previousLeaguePosition <= promotionCutoff;
      const nowInTop3 = currentPos <= promotionCutoff;
      const wasInRelZone = previousLeaguePosition >= relegationCutoff;
      const nowInRelZone = currentPos >= relegationCutoff;
      const wasFirst = previousLeaguePosition === 1;
      const nowFirst = currentPos === 1;

      if (nowFirst && !wasFirst) {
        beats.push("\u{1F3C6} Top of the table!");
      } else if (nowInTop3 && !wasInTop3) {
        beats.push("\u{1F4C8} Moved into the top 3");
      } else if (!nowInTop3 && wasInTop3) {
        beats.push("\u{1F4C9} Dropped out of the top 3");
      } else if (nowInRelZone && !wasInRelZone) {
        beats.push("\u26A0\uFE0F Dropped into the relegation zone");
      } else if (!nowInRelZone && wasInRelZone) {
        beats.push("\u{1F64C} Climbed out of the relegation zone");
      }
    }
  }

  // === 2. Streaks ===
  if (consecutiveWins >= 4) {
    beats.push(`\u{1F525} ${consecutiveWins} wins in a row \u2014 best run this season`);
  } else if (consecutiveUnbeaten >= 8) {
    beats.push(`\u{1F6E1}\uFE0F ${consecutiveUnbeaten} unbeaten \u2014 the form of champions`);
  } else if (consecutiveLosses >= 4) {
    beats.push(`\u{1F4C9} Winless in ${consecutiveLosses} \u2014 the pressure is mounting`);
  }

  // === 3. Transfer window ===
  if (transferWindowOpen && transferWindowWeeksRemaining === 1) {
    beats.push("\u{1F4C5} Transfer window closes this week");
  }

  return beats;
}
