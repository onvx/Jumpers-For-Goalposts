import React, { useMemo } from "react";
import { F, C, FONT } from "../../data/tokens";
import { groupGoalsByScorer, buildScorerDisplayMap, formatScorerName } from "../../utils/matchEvents.js";

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
 * Goals are grouped by scorer so a brace becomes one row
 * ("28', 31' Watkins" on mobile / "Watkins 28' (Yorke), 31'" on desktop)
 * rather than two stacked rows. Mobile drops assists; desktop keeps them
 * per goal where they exist.
 */
export function ScorerStrip({
  events,
  homeSquad = null,
  awaySquad = null,
  homeIsPlayer = false,
  awayIsPlayer = false,
  isMobile = false,
}) {
  const { home, away } = useMemo(() => groupGoalsByScorer(events), [events]);

  // Mobile-only — disambiguated surname map across the combined match squads.
  const displayMap = useMemo(() => {
    if (!isMobile) return null;
    const pool = [];
    if (Array.isArray(homeSquad)) pool.push(...homeSquad);
    if (Array.isArray(awaySquad)) pool.push(...awaySquad);
    return buildScorerDisplayMap(events, pool);
  }, [isMobile, events, homeSquad, awaySquad]);

  if (home.length === 0 && away.length === 0) return null;

  // === Mobile compact ledger ("28', 31' Watkins" — no assists) ===
  if (isMobile) {
    const minutesStr = (entry) => entry.goals
      .map(g => g.minute != null ? `${g.minute}'` : "")
      .filter(Boolean)
      .join(", ");
    const renderEntry = (entry, key, alignRight) => {
      const name = displayMap?.[entry.player] ?? formatScorerName(entry.player);
      const mins = minutesStr(entry);
      return (
        <div key={key} style={{
          fontSize: F.xs, lineHeight: 1.6, color: C.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textAlign: alignRight ? "right" : "left",
        }}>
          {alignRight ? (
            <>
              <span>{name}</span>
              {mins && <span style={{ color: C.textMuted, marginLeft: 4 }}>{mins}</span>}
            </>
          ) : (
            <>
              {mins && <span style={{ color: C.textMuted, marginRight: 4 }}>{mins}</span>}
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
          {home.map((entry, i) => renderEntry(entry, `h-${i}`, false))}
        </div>
        <div style={{
          flex: 1, minWidth: 0,
          borderRight: awayIsPlayer ? `2px solid ${C.green}` : "none",
          paddingRight: awayIsPlayer ? 6 : 0,
        }}>
          {away.map((entry, i) => renderEntry(entry, `a-${i}`, true))}
        </div>
      </div>
    );
  }

  // === Desktop full version ("Watkins 28' (Yorke), 31'") ===
  // Goals are grouped per scorer; each goal can carry its own assister.
  // Comma-separated minute parts keep the line compact even for braces.
  const renderEntry = (entry, key) => {
    const parts = entry.goals.map(g => {
      const min = g.minute != null ? `${g.minute}'` : "";
      return g.assister ? `${min} (${formatScorerName(g.assister)})` : min;
    }).filter(Boolean);
    return (
      <div key={key} style={{
        fontSize: F.sm, lineHeight: 1.5, color: C.text,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        <span>{formatScorerName(entry.player)}</span>
        {parts.length > 0 && (
          <span style={{ color: C.textMuted, marginLeft: 4 }}>
            {parts.join(", ")}
          </span>
        )}
      </div>
    );
  };

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
        {home.map((entry, i) => renderEntry(entry, `h-${i}`))}
      </div>
      <div style={{
        flex: 1, minWidth: 0, textAlign: "right",
        borderRight: awayIsPlayer ? `2px solid ${C.green}` : "none",
        paddingRight: awayIsPlayer ? 8 : 0,
      }}>
        {away.map((entry, i) => renderEntry(entry, `a-${i}`))}
      </div>
    </div>
  );
}
