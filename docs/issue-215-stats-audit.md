# Issue #215 — Stats Overhaul Audit & Scope Plan

This is the audit pass Bandon asks for in
[`docs/issue-215-stats-overhaul-brief.md`](./issue-215-stats-overhaul-brief.md)
section 1, before any implementation. Read the brief first; this doc
references it heavily.

No code changes yet. The PR exists to anchor the audit and the proposed
phase 1 scope so reviewers can push back on direction before I commit
to the architecture.

---

## 1. Where stats live today

There are **four** competing sources of truth, each with a different
identity scheme. This is the core of the fragility.

### A. `simulateMatch` events (`src/utils/match.js`)

Already emits per-event side and minute. Goal events:

```js
{ type: "goal", side, player, assister, minute, text, flash, flashColor }
```

Card events:

```js
{ type: "card" | "red_card", side, cardPlayer, cardTeamName, minute, text, ... }
```

MOTM event:

```js
{ type: "motm", minute: 90, text: "⭐ Man of the Match: ..." }
```

**No IDs on any event.** Names only. Team affiliation present on cards
(`cardTeamName`), implicit on goals via `side`.

### B. `simulateMatch` return value

The function already builds **both** name-keyed and ID-keyed maps in
the same pass:

```js
return {
  scorers,        // { "home|Name": count }      ← used everywhere
  scorersByID,    // { "home|playerId": count }  ← used by growth systems only
  assisters,
  assistersByID,
  motmName, playerRatings, ...
}
```

So IDs *are* threaded through for player-team scoring, but only for the
growth system. Stats UI ignores the `*ByID` maps.

### C. `leagueResults` (`App.jsx:2847` and `:3564`)

Stored after every league matchweek as a **condensed projection**:

```js
{
  home, away, homeGoals, awayGoals,
  goalScorers:    [{ name, assister, side, minute }],
  cardRecipients: [{ name, teamIdx }],
}
```

Notes:
- No IDs.
- No yellow/red distinction in `cardRecipients` — collapsed.
- `assister` carried per goal but never broken out as a top-level array.
- Same condensed shape on both the holiday and non-holiday paths.

### D. `playerSeasonStats` (`useMatchResult.js:524`)

Object keyed by `player.name` (player team only). Tracks
`{ goals, assists, yellows, reds, apps, motm, position, nationality }`.

Importantly: **this is the only place yellows and reds are stored
separately.** AI teams collapse cards into `cardRecipients` total only.

### E. `allTimeLeagueStats` (gameStore + season-end roll-up)

Shape:

```js
{
  scorers:   { "Name|TeamName": count },
  assisters: { "Name|TeamName": count },
  cards:     { "Name|TeamName": count },  // combined yellow + red
}
```

Accumulated **three different ways**:

1. During-season AI matchweek hook (`App.jsx:3635`): adds scorers/
   assisters from non-current-league AI matchweeks.
2. During-season holiday AI matchweek hook (`App.jsx:2945`): same idea
   for holiday-simmed weeks.
3. Season-end roll-up (`App.jsx:6531`): re-iterates the entire
   `leagueResults` object and adds AI-team scorers/cards/assists into
   the same `allTimeLeagueStats`.

**This is the double-count bug.** The AI tiers handled during the
season via paths 1 and 2 are for *other tiers* (`allLeagueStates`), not
the current league. The current league's AI matches *are* in
`leagueResults`, so path 3 picks them up correctly. The two are
disjoint by tier. So this isn't actively broken today, but the
mechanism is fragile — there's nothing structural enforcing the
disjoint, and any code change to either path could double count.

### F. UI reconstruction (`LeaguePage.jsx:38–72`)

The Stats tab rebuilds its own table:

- AI scorers/assisters/cards from `leagueResults` (skipping `teamIdx === 0`)
- Player-team scorers/assists/cards from `playerSeasonStats`
- Keyed by `Name|teamIdx` (the *index*, not name)

So the Stats tab uses **a fifth** key scheme (`Name|teamIdx`), distinct
from `allTimeLeagueStats`'s `Name|TeamName`.

---

## 2. Cup state — almost no stats at all

`cup.rounds[].matches[].result` after a player match (via the Cup
result modal flow) carries everything `simulateMatch` returned.

But `advanceCupRound` (`src/utils/league.js:639`) for **AI vs AI** cup
matches calls `simulateMatch`, **takes only `{homeGoals, awayGoals}`**,
and discards the events:

```js
return {
  ...match,
  result: { homeGoals, awayGoals, winner, penalties? },
};
```

So:
- AI cup scorers/cards exist transiently in `simulateMatch`'s output
- Then are thrown away
- The Cup page has no source of truth for cup-wide top scorers, etc.

This is the single biggest fix the brief calls out in section 9.

---

## 3. Identity issues confirmed (brief sections 3 + 4)

- All event payloads carry **names only**.
- All persisted projections (`leagueResults`, `allTimeLeagueStats`) key
  by name combinations.
- `simulateMatch` already builds `scorersByID` / `assistersByID` for
  the player team but those are never written to persisted state.
- AI match events have no player IDs at all (AI player objects do
  have stable IDs in `team.squad`, but the events don't carry them).

So the foundation Bandon wants — IDs flowing from event → accumulator
→ canonical store — needs an event-shape upgrade, plus a name→id
lookup at simulate-time for the AI side.

---

## 4. Yellow/red collapse confirmed (brief section 5)

- `simulateMatch` distinguishes `type: "card"` (yellow) and
  `type: "red_card"` (straight red).
- Second-yellow handling: I didn't trace it in this audit yet. Worth
  a follow-up confirmation before the implementation locks in the
  rule.
- `playerSeasonStats` (player team only) keeps yellows/reds separate.
- `leagueResults.cardRecipients` collapses both into one bucket.
- `allTimeLeagueStats.cards` collapses both into one bucket.
- LeaguePage Stats tab presents **a single "Cards" column**, no split.

---

## 5. Idempotency status (brief section 7)

Currently no `matchId` or processed-match tracking exists. The system
works because:

- Match completion writes `leagueResults[matchweekIndex]` keyed by MW
- Re-processing the same matchweek would overwrite, not duplicate,
  because the writes are `setLeagueResults(prev => ({ ...prev, [mw]: condensed }))`
- `playerSeasonStats` is *not* matchweek-keyed — it's incrementally
  appended. **A re-processed player match would double count.**
- `allTimeLeagueStats` accumulators (`+=`) — **also vulnerable to
  duplicate writes** if the same match path fires twice.

So the brief's concern is real for `playerSeasonStats` and
`allTimeLeagueStats`, but not for `leagueResults` (which is keyed and
overwriting, not summing).

---

## 6. Match path coverage today (brief section 8)

| Path | League stats | Cup stats |
|---|---|---|
| Normal player league match | `leagueResults` + `playerSeasonStats` ✓ | n/a |
| Holiday player league match | `leagueResults` + `playerSeasonStats` ✓ | n/a |
| Same-tier AI vs AI league | inside `leagueResults` ✓ | n/a |
| Other-tier AI leagues | direct write to `allTimeLeagueStats` only | n/a |
| Player cup match (modal) | n/a | `cup.rounds[i].matches[j].result` keeps full events ✓ |
| Holiday player cup match | n/a | inline path stores result and updates `playerSeasonStats` |
| AI vs AI cup match | n/a | **score only — events discarded ❌** |

Mini/dynasty: I didn't trace these. Brief explicitly says they're
out of scope unless we choose to include them.

---

## 7. Proposed phase 1 scope (matches brief section 17)

### In scope
1. **New canonical store**: `seasonLeagueStats` (current player league
   only). Identity by `player.id` where available, deterministic
   composite fallback otherwise. Yellows + reds separated.
2. **Pure accumulator**: `accumulateMatchStats(stats, { result, homeTeam,
   awayTeam, competition, matchId })` — fully unit-tested, lives in a
   new `src/utils/competitionStats.js`.
3. **Idempotency key**: `matchId = league:S{n}:MD{mw}:{home}-{away}`,
   tracked in `processedMatches` set/object on the stats blob itself
   (so it travels with the data).
4. **Event-shape upgrade in `simulateMatch`**: add `playerId`,
   `assisterId`, `teamId`, plus `cardPlayerId` / `teamId` on cards.
   Keep existing `player`/`assister`/`cardPlayer` for display
   compatibility — purely additive.
5. **Wire all four current-league paths through the accumulator**:
   normal player match, holiday player match, same-tier AI matchweek
   (already has events), holiday AI matchweek.
6. **Replace `LeaguePage` Stats tab** with selectors over the new
   canonical store. Keep existing visual layout for now.
7. **Selectors**: `getTopScorers`, `getTopAssisters`, `getMostYellows`,
   `getMostReds` (separate, per the issue).
8. **Save/load**: persist `seasonLeagueStats`. Old saves get a clean
   empty default plus a "stats available from this season onward"
   notice if/where it matters.
9. **Tests**: per the brief's section 16 list — accumulator
   correctness, yellow/red split, second-yellow rule, idempotency,
   duplicate names with different IDs, missing IDs, selector ordering.

### Deferred to phase 2
- Cup stats (player + AI cup matches). Requires `advanceCupRound`
  to preserve event payloads, plus a parallel `seasonCupStats` store
  and a `CupPage` Stats panel.

### Deferred to phase 3
- Roll season → all-time at season end via the new canonical store.
- Migrate `allTimeLeagueStats` shape and the achievements that read
  from it (`Bag Man`, `Tactical Foul`, `Etched In Stone`,
  `Brexit`-related logic) onto the canonical pipeline.

### Out of scope for #215 entirely (unless you say otherwise)
- Mini tournament / dynasty knockout stats.
- AI tier (other-tier) per-player stats.
- Career cup records (different feature).

---

## 8. Open design questions before phase 1 lands

These need decisions before I write code, not after.

1. **Second-yellow rule.** Brief offers two valid choices. My lean:
   one yellow + one red, with `redReason: "second_yellow"` on the
   red event so UI can show the dual indicator without changing the
   underlying counts. **Decision needed before tests are written.**

2. **AI player identity at the cup-AI level.** If
   `advanceCupRound`'s AI match path keeps event payloads, those events
   now need `playerId`. AI squads have stable IDs, so I'd thread them
   in on the `simulateMatch` call shape (already the cleaner path — see
   point 4 above). **Confirming this is acceptable.**

3. **Migration policy for old saves.** Brief recommends "stats
   available from this season onward". Confirming we don't try to
   reconstruct from `leagueResults` history — even though it's
   technically possible — because the names→ids gap means it would be
   best-effort and arguably worse than blank.

4. **Phase 1 cut-off.** Confirming phase 1 ships league-only and the
   Cup Stats tab waits for phase 2. The PR will say so explicitly.

---

## 9. What this PR contains

Just this audit doc. No code, no shape changes yet. Once questions
1–4 are answered I'll open the phase 1 implementation PR with the
accumulator, store, event upgrade, and selectors — and full tests
per the brief's section 16.
