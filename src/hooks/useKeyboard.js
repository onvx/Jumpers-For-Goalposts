import { useEffect } from "react";

/**
 * Keyboard shortcuts for desktop play.
 *
 * Space  — advance week / advance summer / dismiss gains popup
 * Escape — close current tab (return to Home)
 * 1-8    — switch tabs: Home, Squad, Boot Room, League, Cup, Transfers, Club, Corner Shop
 */
export function useKeyboard({
  // Tab state
  showSquad, showCalendar, showTable, showCup, showTransfers, showLegends, showAchievements,
  setShowSquad, setShowCalendar, setShowTable, setShowCup, setShowTransfers, setShowLegends, setShowAchievements,
  // Tab helpers
  clearAllTabs,
  setInitialBootRoomTab, setBootRoomKey, setLeagueKey, setCupKey, setTransfersKey, setClubKey, setCabinetKey,
  setLastSeenAchievementCount, unlockedAchievements,
  // Game state
  cup,
  processing, matchPending, summerPhase, gains, matchResult, cupMatchResult,
  selectedPlayer, pendingPlayerUnlock, ovrLevelUps, showBreakoutPopup,
  isOnHoliday,
  // Actions
  advanceWeek, advanceSummer,
  setGains,
  // Lineup warning
  seasonCalendar, calendarIndex, startingXI,
  setShowLineupWarning,
}) {
  useEffect(() => {
    const handler = (e) => {
      // Don't intercept if user is typing in an input/textarea
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Don't intercept during match playback or when overlays are active
      if (matchResult || cupMatchResult || selectedPlayer || pendingPlayerUnlock || ovrLevelUps || showBreakoutPopup) return;

      // === SPACE — advance / dismiss ===
      if (e.code === "Space") {
        e.preventDefault();

        // Dismiss gains popup if showing
        if (gains !== null) {
          setGains(null);
          return;
        }

        // Don't advance if processing or match is pending
        if (processing || matchPending) return;

        // Summer advance
        if (summerPhase === "awaiting_end" || summerPhase === "break") {
          advanceSummer();
          return;
        }

        // Disabled during summary/intake
        if (summerPhase === "summary" || summerPhase === "intake") return;

        // Normal advance week — check lineup warning
        const nextEntry = seasonCalendar?.[calendarIndex + 1];
        const nextIsMatch = nextEntry && ["league", "cup", "dynasty", "mini"].includes(nextEntry.type);
        if (nextIsMatch && (!startingXI || startingXI.length === 0)) {
          setShowLineupWarning("advance");
          return;
        }

        advanceWeek();
        return;
      }

      // === ESCAPE — return to Home ===
      if (e.code === "Escape") {
        clearAllTabs();
        return;
      }

      // === NUMBER KEYS — tab switching ===
      const tabMap = {
        "Digit1": () => clearAllTabs(), // Home
        "Digit2": () => { clearAllTabs(); setShowSquad(true); },
        "Digit3": () => { const wasOpen = showCalendar; clearAllTabs(); if (wasOpen) setBootRoomKey(k => k + 1); setInitialBootRoomTab("inbox"); setShowCalendar(true); },
        "Digit4": () => { const wasOpen = showTable; clearAllTabs(); if (wasOpen) setLeagueKey(k => k + 1); setShowTable(true); },
        "Digit5": () => { if (!cup) return; const wasOpen = showCup; clearAllTabs(); if (wasOpen) setCupKey(k => k + 1); setShowCup(true); },
        "Digit6": () => { const wasOpen = showTransfers; clearAllTabs(); if (wasOpen) setTransfersKey(k => k + 1); setShowTransfers(true); },
        "Digit7": () => { const wasOpen = showLegends; clearAllTabs(); if (wasOpen) setClubKey(k => k + 1); setShowLegends(true); },
        "Digit8": () => { const wasOpen = showAchievements; clearAllTabs(); if (wasOpen) setCabinetKey(k => k + 1); setShowAchievements(true); setLastSeenAchievementCount(unlockedAchievements.size); },
      };

      const action = tabMap[e.code];
      if (action) {
        e.preventDefault();
        action();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });
}
