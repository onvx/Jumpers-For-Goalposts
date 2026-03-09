# Changelog

All notable updates to Jumpers for Goalposts, written for players.

---

## 8 March 2026 — The Big Tidy-Up

### New Features

- **Reporter Introduction**: A local reporter now emails you at the start of Week 2 to introduce themselves. They cover your club for the in-game newspaper and hint at Story Arcs developing in your Boot Room. Keep an eye on them.
- **Assistant Manager Training Onboarding**: Your Asst. Manager now sends you a message early in your first season offering to handle training on your behalf. You can delegate (he'll put everyone on General Training) or head to the Squad page to set it up yourself. If you ignore training for 5+ weeks, he'll nudge you again.
- **Empty Starting XI Warning**: Trying to advance into a match or hit Play Match with no starting lineup now shows a warning with a shortcut to the Squad page. No more accidental forfeits.

### Improvements

- **"ASSIGN ALL" renamed to "TRAIN ALL"**: The button on the Squad page that sets training focus for all players was confusingly named. Now it says what it actually does.
- **Training dropdown closes properly**: The TRAIN ALL dropdown now closes when you click outside it or press Escape. Previously it just hung around.
- **Match result screen scrolls correctly**: Player ratings after a match now scroll within the modal without pushing the CONTINUE button off-screen. The button is always visible and clickable.
- **Empty training reports suppressed**: The "No events this week" training popup no longer appears when nothing happened. Less clicking, less friction.

### Bug Fixes

- **Cup name fixed**: The cup competition was showing "Clubman Cup" in all headlines regardless of which cup you were actually in. Now displays the correct cup name.
- **Cup round display fixed**: Round numbers in the cup were off by one. Round of 32 was showing as Round of 64, etc. Corrected.
- **Duplicate achievement removed**: "Keeping It In The Family" was identical in practice to "Start A Family" — both triggered at the same time. Removed the duplicate to keep the Cabinet clean.

### Under the Hood

- Added PR and issue templates for consistent development workflow
- Standardised branch naming convention across the team
- Updated contributing guidelines

---

## 10 March 2026 — Under the Hood

### Improvements

- **Achievement Cabinet on mobile**: The ticket picker in the Achievement Cabinet now scrolls smoothly on mobile devices without breaking the interface.

### Under the Hood

- **State management refactored**: Completed a major migration of the core game state management system from React hooks (useState/useRef) to Zustand store. This includes all 6 core state properties and an additional 22 ref-mirrored states.
- **Message utilities extracted**: Refactored message filtering logic into a shared utility module for better code reusability.
- **State mutation safeguards**: Added stricter control over direct state mutations to prevent bugs and improve maintainability.

---

*— Trask*
