import React, { useMemo } from "react";
import { F, C, FONT } from "../../data/tokens";
import { buildGoalStrip, buildScorerDisplayMap, formatScorerName } from "../../utils/matchEvents.js";

/**
 * Persistent scorer/assister strip rendered under the matchday scoreline.
 *
 * Pure derived view of goal events — no own state. Home column left,
 * away column right. Empty state returns null (no placeholder).
 *
 * Driven by `shownEvents` (the live-filtered event stream), so it updates
 * in step with the commentary feed in slow/fast/highlights modes and is
 * fully populated on arrival for instant matches.
 *
 * Mobile renders a compact "31' Watkins" goal ledger (no assists, smart
 * disambiguated surnames). Desktop keeps the fuller scorer/assister view.
 */
export function ScorerStrip({
  events,
  homeSquad = null,
  awaySquad = null,
  homeIsPlayer = false,
  awayIsPlayer = false,
  isMobile = false,
}) {
  const { home, away } = useMemo(() => buildGoalStrip(events), [events]);

  // Mobile-only — disambiguated surname map across the combined match squads.
  const displayMap = useMemo(() => {
    if (!isMobile) return null;
    const pool = [];
    if (Array.isArray(homeSquad)) pool.push(...homeSquad);
    if (Array.isArray(awaySquad)) pool.push(...awaySquad);
    return buildScorerDisplayMap(events, pool);
  }, [isMobile, events, homeSquad, awaySquad]);

  if (home.length === 0 && away.length === 0) return null;

  // === Mobile compact ledger ("31' Watkins") ===
  if (isMobile) {
    const renderRow = (g, key, alignRight) => {
      const name = displayMap?.[g.player] ?? formatScorerName(g.player);
      return (
        <div key={key} style={{
          fontSize: F.xs, lineHeight: 1.6, color: C.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textAlign: alignRight ? "right" : "left",
        }}>
          {alignRight ? (
            <>
              <span>{name}</span>
              {g.minute != null && <span style={{ color: C.textMuted, marginLeft: 4 }}>{g.minute}'</span>}
            </>
          ) : (
            <>
              {g.minute != null && <span style={{ color: C.textMuted, marginRight: 4 }}>{g.minute}'</span>}
              <span>{name}</span>
            </>
          )}
        </div>
      );
    };
    return (
      <div style={{
        display: "flex", gap: 10,
        marginTop: 4, marginBottom: 6,
        padding: "5px 8px",
        background: "rgba(15,23,42,0.5)",
        borderTop: `1px solid ${C.bgCard}`,
        borderBottom: `1px solid ${C.bgCard}`,
        flexShrink: 0,
        fontFamily: FONT,
      }}>
        <div style={{
          flex: 1, minWidth: 0,
          borderLeft: homeIsPlayer ? `2px solid ${C.green}` : "none",
          paddingLeft: homeIsPlayer ? 6 : 0,
        }}>
          {home.map((g, i) => renderRow(g, `h-${i}`, false))}
        </div>
        <div style={{
          flex: 1, minWidth: 0,
          borderRight: awayIsPlayer ? `2px solid ${C.green}` : "none",
          paddingRight: awayIsPlayer ? 6 : 0,
        }}>
          {away.map((g, i) => renderRow(g, `a-${i}`, true))}
        </div>
      </div>
    );
  }

  // === Desktop full version ("D. Yorke 37' (R. Keane)") ===
  const renderGoal = (g, key) => (
    <div key={key} style={{
      fontSize: F.sm, lineHeight: 1.5, color: C.text,
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
      display: "flex", gap: 16,
      marginTop: 8, marginBottom: 10,
      padding: "8px 14px",
      background: "rgba(15,23,42,0.5)",
      borderTop: `1px solid ${C.bgCard}`,
      borderBottom: `1px solid ${C.bgCard}`,
      flexShrink: 0,
      fontFamily: FONT,
    }}>
      <div style={{
        flex: 1, minWidth: 0, textAlign: "left",
        borderLeft: homeIsPlayer ? `2px solid ${C.green}` : "none",
        paddingLeft: homeIsPlayer ? 8 : 0,
      }}>
        {home.map((g, i) => renderGoal(g, `h-${i}`))}
      </div>
      <div style={{
        flex: 1, minWidth: 0, textAlign: "right",
        borderRight: awayIsPlayer ? `2px solid ${C.green}` : "none",
        paddingRight: awayIsPlayer ? 8 : 0,
      }}>
        {away.map((g, i) => renderGoal(g, `a-${i}`))}
      </div>
    </div>
  );
}
