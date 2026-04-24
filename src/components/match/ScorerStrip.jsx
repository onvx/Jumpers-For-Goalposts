import React, { useMemo } from "react";
import { F, C, FONT } from "../../data/tokens";
import { buildGoalStrip, formatScorerName } from "../../utils/matchEvents.js";

/**
 * Persistent scorer/assister strip rendered under the matchday scoreline.
 *
 * Pure derived view of goal events — no own state. Home column left,
 * away column right. Empty state returns null (no placeholder).
 *
 * Driven by `shownEvents` (the live-filtered event stream), so it updates
 * in step with the commentary feed in slow/fast/highlights modes and is
 * fully populated on arrival for instant matches.
 */
export function ScorerStrip({ events, homeIsPlayer = false, awayIsPlayer = false, isMobile = false }) {
  const { home, away } = useMemo(() => buildGoalStrip(events), [events]);
  if (home.length === 0 && away.length === 0) return null;

  const renderGoal = (g, key) => (
    <div key={key} style={{
      fontSize: isMobile ? F.xs : F.sm, lineHeight: 1.5, color: C.text,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      <span>{formatScorerName(g.player)}</span>
      {g.minute != null && (
        <span style={{ color: C.textMuted, marginLeft: 4 }}>{g.minute}'</span>
      )}
      {g.assister && (
        <span style={{ color: C.textDim, marginLeft: 4 }}>
          ({formatScorerName(g.assister)})
        </span>
      )}
    </div>
  );

  return (
    <div style={{
      display: "flex",
      gap: isMobile ? 8 : 16,
      marginTop: isMobile ? 6 : 8,
      marginBottom: isMobile ? 8 : 10,
      padding: isMobile ? "6px 10px" : "8px 14px",
      background: "rgba(15,23,42,0.5)",
      borderTop: `1px solid ${C.bgCard}`,
      borderBottom: `1px solid ${C.bgCard}`,
      flexShrink: 0,
      fontFamily: FONT,
    }}>
      <div style={{
        flex: 1, minWidth: 0, textAlign: "left",
        borderLeft: homeIsPlayer ? `2px solid ${C.green}` : "none",
        paddingLeft: homeIsPlayer ? (isMobile ? 6 : 8) : 0,
      }}>
        {home.map((g, i) => renderGoal(g, `h-${i}`))}
      </div>
      <div style={{
        flex: 1, minWidth: 0, textAlign: "right",
        borderRight: awayIsPlayer ? `2px solid ${C.green}` : "none",
        paddingRight: awayIsPlayer ? (isMobile ? 6 : 8) : 0,
      }}>
        {away.map((g, i) => renderGoal(g, `a-${i}`))}
      </div>
    </div>
  );
}
