# Family Game Hub — Audit & Fix Spec

**Written:** 2026-10-20 17:50 (NPT)
**Verified:** 2026-10-20 18:05 (NPT) against the working tree
**Fixed:** 2026-10-20 19:05 (NPT) — see the status table
**Second pass:** 2026-10-20 21:50 (NPT) — the drawing game, the played
rather than typed One of Us, the connection work and the API documentation.
**Third pass:** 2026-10-21 — review of the PWA, audio, IndexedDB and
palette work, plus the open issues below.
**Status:** historical snapshot from before the catalog expanded to thirteen
games. Use `AGENTS.md` and `.agents/STATUS.md` for the current state.
**Scope:** Critical + High + Medium findings across `server/`, `web/`, `scripts/`.
**Method:** every source file read in full; live UI measured in Chrome (computed styles, layout rects); all suites executed; every client contract cross-checked against all 8 game engines.

---

## OPEN ISSUES (2026-10-21)

Found while reviewing the PWA, audio, IndexedDB and palette work. They may
be fixed by the next update; if not, this is the list to work through.
Nothing here was changed.

### The port is 12800, everywhere

`server/.env` sets `PORT=12800` **on purpose**: the hosting service needs
it, and the backend will not answer without it. Do not change it.

So that there is one port in the whole project, the local copy follows it:
`web/config.js`, `web/net.js`, `scripts/ui-driver.mjs` and the dev server's
CSP all point at `localhost:12800` now. The browser suites therefore work
against a locally started server, and the hosted copy is untouched.

### 1. The host console goes blind after a reconnect — `web/admin.js:1866`

```js
if (!socket?.connected || roomCreatedForSession) return;   // :1866
roomCreatedForSession = true;                                // :1874
roomCreatedForSession = false;                               // :1899 (login only)
```

`admin:createRoom` is the only thing that puts the admin socket into the
room's channel, and `broadcast()` sends the state to that channel. The
flag is cleared only when the host logs in, never when the socket
reconnects. So a dropped connection means the host receives **no state at
all**: no player list, no game events, no way to advance the game, while
the players carry on.

Fix: always emit `admin:createRoom` on connect (the server's
`getOrCreateRoom()` is idempotent), or clear the flag in the `disconnect`
handler.

### 2. Drawing dies after a mid-turn reload — `server/games/drawIt.js:251`

The client ids are `c${counter}` (`web/games.js:1754`) and the counter
restarts at 0 on every page load. The server rejects a repeated id:

```js
if (game.strokes.some((stroke) => stroke.id === strokeId)) {
  return { ok: false, code: "duplicate_stroke", ... };
}
```

So a drawer whose phone reloads mid-turn (tab eviction, a PWA relaunch)
sends `c1` again and **every** later stroke is rejected too. The client
sends without waiting for an answer, so there is no error: the drawer
sees their own strokes, the room sees a frozen board.

Fix: make the id unique per page session, or namespace the check by
`by` + turn.

### 3. The turn history goes blank — `server/games/turnGuess.js:180`

```js
function visibleHistory(game) {
  if (reveal(game)) return game.history ?? [];
  return (game.history ?? []).map((entry) => ({ ...entry, answerId: null, answerName: null }));
}
```

`recordHistory()` only runs from `finishTurn()`, which sets
`phase = "reveal"` first (`:151` then `:162`). Every history entry is
therefore already public, and the client renders `row.answerName`
(`web/games.js:949`). The effect is that the history list empties as soon
as the next turn starts.

Fix: drop `visibleHistory()` and use `history: game.history ?? []`.

### 4. The service worker served the old app — `web/service-worker.js` — FIXED

It used a hard-coded cache name and served the cached copy first, so after
a deploy the first load returned the old JavaScript next to the new HTML.
The cache is now **only a fallback for when there is no network**: every
request goes to the network first, so a deploy is always picked up
immediately and there is no version to remember to bump.

- `/admin`, `/api`, `/g/` and `/game` are never cached.
- A response that says `no-store` is dropped instead of being kept.
- The shell is added one file at a time, so one missing asset no longer
  fails the whole install.
- `skipWaiting()` and `clients.claim()` are inside `waitUntil()`.

### 5. The IndexedDB restore never re-joins the room — `web/app.js:92`

`hydratePersistentState()` shows the lobby, but `attemptResume()` is only
called from the socket `connect` handler. If IndexedDB resolves after the
socket connects, the session is restored too late, the join never happens,
and the player sits on "Rejoining your room…" for ever. The invite-link
path has the same race in the other direction (`app.js:903`): the delete
and the read are separate asynchronous connections, so a stale session can
win.

### 6. The seat token is now in IndexedDB — `web/app.js:213`

`saveSession()` mirrors `{code, token, name}` into IndexedDB as well as
`localStorage`. The token is the credential that lets anyone holding it
rejoin as that player. The room code and name are also kept with no
expiry, and `privacy.html` does not mention IndexedDB.

### 7. The ambient drone never stops — `web/audio.js:52`

`primeAudio()` starts two continuous oscillators (110 Hz and 165 Hz) on the
first keystroke in the room-code box, and they run until the tab closes.
A rejected `audio.resume()` also becomes an unhandled rejection, which
lands in `window.__FG_ERRORS` and **fails the browser suites**.

### 8. Smaller ones

- `server/contentStore.js:342` — the non-atomic write fallback was removed,
  so a `rename` that fails on Windows loses the edit.
- `web/games.js:1410` — `#ffd166` is in the draw palette twice.
- `web/pages.css` — rewritten into one-rule-per-line form, which is not
  the house style.
- `web/index.html` and `web/admin.html` — `theme-color` is still
  `#0c0a13` while the new palette is `#0b1020`.
- `scripts/dev-web.mjs` — `.webmanifest` is missing from the MIME map, so
  the install prompt never appears locally.
- `web/manus-routes.json` — read by nothing, and it lists the admin routes
  that `robots.txt` asks not to be indexed.
- `server/games/oneOfUs.js:138` — the `no_consensus` message is wrong
  (the vote was decisive, just not for the imposter), and `decisiveVote`
  is published but never read.

### Midnight pre-flight, for the five new games

1. **The CI gate used to block the deploy.** `sync-backend.yml` runs
   `npm run smoke` *before* it publishes `backend`, and three tests
   asserted **8** games. With 13 the suite failed, `backend` was never
   published, and the front end deployed against an old API.

   **Fixed.** The suite now checks invariants instead of a snapshot: the
   core games must all be there, the ids must be unique, every game must
   have its seven engine functions, every game must have a screen in
   `web/games.js`, and every content collection must have entries. The
   browser suites compare the card count with the catalogue the API
   reports. Adding a game can no longer break the deploy.
2. **A missing content entry used to take the whole site down.** A
   collection registered in `server/contentStore.js` but missing from
   `server/data/games/*.json` made the module throw at import:

   ```text
   SERVER BOOT FAILURE: Invalid default content for charades: Items must be a list.
   ```

   **Fixed.** The server now reports the collection, carries on, and the
   game falls back to its own placeholder, so the rest of the evening still
   works. The suite also checks that every registered collection has
   entries, so a mistake is still caught in the tests rather than in
   production.
3. **The service worker will hand people the old app** (issue 4 above),
   which is the worst way to start a launch.
4. `web/index.html:34` says "8 Fun2Play Games", and the README says
   "all eight games" twice.
5. Each new game needs a `RENDERERS` entry in `web/games.js`, or players
   see "This game screen is not available yet."

---

## THE SECOND PASS (2026-10-20 21:50)

| Change | Why |
|---|---|
| **Draw It** | A drawing and guessing game, the first with a clock, the first that is not made of text. It needed a canvas, a stroke channel of its own, and a server owned clock. See PLAN.md §2.8. |
| **One of Us is played, not typed** | The clues are spoken out loud. The screen shows whose turn it is and hands the turn along, and after two rounds the room votes by itself. The host never touches the game. |
| **A room remembers what it has used** | The questions, words, prompts and people are remembered for the whole session, so a game night never brings the same question back. |
| **The question pool was rewritten** | Seventy eight questions that are meant to be funny rather than useful, a good half of them Nepali. |
| **The leave button is a button** | It is a real button at the bottom of the screen, well away from the game, so nobody presses it by accident. |
| **The connection was made harder to break** | The name is remembered, the room code is kept when a room disappears, and the banner says what is happening while the socket comes back. |
| **The API tells you what it is doing** | `/healthz` reports the version, the uptime, the rooms, the players, the content, the allowed frontends and the memory. `/api/docs` is a dark documentation page that reads the OpenAPI description at `/api/openapi.json`. |

---

## STATUS (2026-10-20 19:05)

Every finding below was fixed. All six suites pass:

```
npm run smoke          server: health, cors, config, foundation, engines, games
npm run smoke:ui       join, lobby, admin login, branding, responsive
npm run smoke:game-ui  full One of Us flow (now including the imposter guess)
npm run smoke:ui-all   the other seven games end-to-end
```

### What changed

| Area | Fixes |
|---|---|
| **Player UI** | Icon buttons now lay out correctly; the game view drops its card chrome; the 8 missing CSS classes exist; the author select validates; the room's clues stay on screen while voting; drafts are scoped to a game instance and pruned; the DOM is only rebuilt when it changed; spectators see the public content; an unknown phase never renders blank. |
| **Host console** | One `emitAdmin` path for every action; expired sessions are detected; content-load errors are visible; sign-out clears host state; destructive actions respect the setting; in-flight guards; content validation before save; the catalog can be retried; the playlist hint is never stale. |
| **Backend** | `startedAt` in the public view; a replay only seats connected players; single games and playlists now seat the same people; the join limit also counts per connection; `TRUST_PROXY` is configurable; history marks who did not play. |
| **CSS** | `overflow-x: clip` so the sticky nav works; a sticky banner that no longer covers the nav; focus rings restored; `max-width` on the toast; print and `forced-colors` styles; contrast fixes; the duplicated selectors are scoped, not redefined. |
| **Tests** | All 7 games now play end-to-end over a real socket; the imposter's blindness and the truth-or-dare prompt privacy are asserted; the imposter-guess step in the browser suite is no longer silently skipped; the suites run against `:memory:` content and a free port. |

### Known limits (intentional)

- `server/games/secretGuess.js` stays as an empty module. It is a deliberate tombstone so a stale import fails loudly instead of reviving a removed game.
- `window.__FG_ERRORS` stays in the production bundle. The browser suites read it, and it is a useful diagnostic. It records only; it never swallows anything.
- Rooms are removed only when nobody is connected and the room has been idle for 30 minutes. That is the seat-recovery window, not a leak.

---

> **Do not rewrite `web/admin.js` or `web/games.js`.** They are 2,200 and 1,450 lines of working logic. Every failure below was in one of ~70 specific places. Rewriting is what has been making this worse.

> The findings below are kept as the record of what was wrong and why. The line numbers refer to the pre-fix files.

---

## VERIFICATION STATUS (2026-10-20 18:05)

Every finding was re-checked programmatically against the current working tree, then spot-verified by hand.

| Status | Count | IDs |
|---|---|---|
| ✅ **Fixed** | 2 | M94, M96 |
| ⚠️ **Partially addressed** — real gap remains, finding text narrowed | 5 | M5, M25, M30, M34, M65 |
| ❌ **Open** | 105 | everything else |
| 🆕 **New** (found during verification) | 1 | X1 |

**The other session made no code changes after 17:52.** Last writes: `DEPLOY.md` 17:52, `README.md` 17:49, `web/games.js` 17:34, `web/styles.css` 17:28. `npm run smoke` is green.

### Corrections to this document (found during verification)

These 6 entries were inaccurate when first written. The gap still exists but is **narrower** than described:

| ID | What I wrote | What is actually true |
|---|---|---|
| **M5** | "drafts map never pruned" | `drafts.delete(key)` exists in 3 places, but only in the *empty-value* branch of `bindText`/`bindSelect`. **Non-empty drafts are never pruned** → unbounded growth across a game night, and stale entries resurface on replay (H1). |
| **M25** | "No client-side max/maxItems enforcement" | `field.max` **is** enforced for text inputs via `input.maxLength = field.max` (`admin.js:1436`). Only the `lines` type is unguarded — `field.maxItems` is never checked and the textarea has no `maxLength`, so a 5th host note / 9th alias is still silently dropped. |
| **M30** | "Stale contentDraft after collection switch" | The draft **does** reload on a corrected `contentKey` — but it is guarded by `if (!contentDirty \|\| force)`, so the stale draft survives **only when there are unsaved changes**. |
| **M34** | "Playlist action double-fire race" | 2 of 5 `playlistBusy = true` sites already re-render/disable (`:1010` `setUpcomingGameIds`, `:1950` `nextPlaylistGame`). **Still unguarded:** `skipPlaylistGame` (`:1984`), `endPlaylist`, `returnToLobby`. |
| **M65** | ".game-grid column count non-monotonic" | Confirmed exactly: `3 → 2 → 3 → 2 → 1` in file order. Fully open, cosmetic only. |
| **M94** | "PLAN.md and README.md disagree on Act It Out" | **False positive.** `PLAN.md` was already reconciled at 17:34, before this document was written. No action needed. |

### New finding

**X1 · `server/games/secretGuess.js` is an orphan file.**
It exists on disk (15:53) but is **not** imported by `server/games/index.js` — the registry uses `turnGuess.js` for both Who Am I? and Where Am I?. It is dead code from the pre-`turnGuess` refactor, and it still imports from `../server/games/common.js`. Delete it.

---

> **Line numbers drift.** Another session may still edit this repo. Where a line number is given, also use the **grep anchor** in the same row — anchors (function names, literal strings) survive edits.

> **Do not rewrite `web/admin.js` or `web/games.js`.** They are 2,233 and 1,328 lines of working logic. Every failure below is in one of ~70 specific places. Rewriting is what has been making this worse.

---

## 0. Read this first — two writers, one folder

Two `opencode.exe` processes were running against this directory (PIDs 12616, 18728). Files were being rewritten every few minutes, which is why fixes kept half-disappearing. One session must be closed before the work below can land.

**Current state at time of writing:** `npm run smoke` passes (foundation ✓, engines ✓ 7/7, games ✓). The UI suites pass with the dev server running.

**What is genuinely solid — do not touch it:**
- All 7 engines' privacy rules are correct server-side (`oneOfUs.js:286`, `turnGuess.js:305-311`, `truthOrDare.js:230`, `whoWroteThat.js:63-92`, `actItOut.js`).
- The Socket.IO protocol validates everything server-side; no client state is trusted.
- Auth is correct: `sha256` + `timingSafeEqual` (`util.js:34`), opaque 32-byte tokens, 12h TTL, rate-limited login, production passcode enforced ≥12 chars (`config.js:21-26`).
- The content store normalises, validates, dedupes ids, and writes atomically.
- The engine registry is clean — the parked `prototypes/numberGame.js` is correctly not registered.

---

## CRITICAL

### C1 · Player-page icon buttons have no layout
**Where:** `web/styles.css:365` (`.btn`), `web/styles.css` (no `.btn-icon` rule), `web/admin.css:213-225` (the rules that should be there).
**Measured:** `.btn` computed `display: inline-block`; `.btn-icon` → *no CSS rule anywhere*; icon→label gap **0px**.

`.btn-inline` is split across files — `styles.css:417` has only `width/padding`; the `display:inline-flex; align-items:center; gap:8px` and `.btn .btn-icon` sizing live **only in `admin.css`**, which `index.html` does not load. Every icon button on the player side renders its SVG glued to the label, baseline-aligned, unsized (`index.html:105-108` "Copy invite" is the visible case).

**Fix**
- In `styles.css`, extend `.btn-inline` with `display:inline-flex; align-items:center; justify-content:center; gap:8px;`.
- Add to `styles.css`: `.icon{width:1.05em;height:1.05em;flex:0 0 auto;display:block}` and `.btn .btn-icon{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:20px;height:20px}`.
- Delete the now-duplicate `.btn-inline` / `.btn .btn-icon` block from `admin.css:213-225` (keep `.btn-small .btn-icon`).

### C2 · The "immersive game view" keeps full card chrome
**Where:** `web/styles.css:196-202`; container `.join-card` (`styles.css:277`).
**Measured in the live game view:** `padding: 24px`, `border: 1px`, `border-radius: 28px` still applied.

```css
body[data-view="game"] .topbar { display: none; }
body[data-view="game"] .shell   { padding-top: max(12px, env(safe-area-inset-top)); }
```
That is the entire rule set. The game renders inside `.join-card`, which keeps its padding, border and radius — ~48px of a 320px phone's width is lost, and the game reads as "a card in a page".

**Fix** — add after `styles.css:202`:
```css
body[data-view="game"] .join-card {
  padding: 0; border: 0; background: none; box-shadow: none; border-radius: 0;
}
```

### C3 · Eight client-side classes have no CSS rule at all
**Verified** by scanning every stylesheet for every class used in HTML/JS.

| Class | Used at | Effect today |
|---|---|---|
| `btn-icon` | `index.html:107`, `admin.js:217` | see C1 |
| `button-row` | `games.js:637` | two 100%-wide buttons with **0px gap**, stacked |
| `guess-list` | `games.js:770` | raw `<ul>` — default bullets, 40px indent |
| `guess-row` | `games.js:772` | unstyled |
| `is-spectator` | `games.js:264` | no visual marker for players who sat out |
| `pill-session` | `games.js:222` | session-score pill unstyled |
| `session-points` | `games.js:274` | unstyled text |
| `nav-title` | `admin.html:73-89` | nav labels inherit `white-space:nowrap` with no width rule |

**Fix** — add to `styles.css`:
```css
.button-row { display:flex; flex-wrap:wrap; gap:8px; }
.button-row .btn { flex:1 1 140px; width:auto; }
.guess-list { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.guess-row { background:rgba(255,255,255,.03); border-radius:12px; padding:8px 10px; }
.pill-session { background:rgba(196,181,253,.13); color:var(--tertiary); }
.session-points { color:var(--on-surface-muted); font-size:10.5px; font-weight:650; white-space:nowrap; }
.score-row.is-spectator { opacity:.6; }
```
and to `admin.css`:
```css
.admin-nav-item .nav-title { display:block; min-width:0; font-size:inherit; line-height:1.15; overflow-wrap:anywhere; }
```

### C4 · "Who Wrote That?!" author select can never validate
**Where:** `web/games.js:1078` — `el("option", null, "Choose an author…")` has **no `value` attribute**, so `option.value` falls back to its text. `select.value` is always truthy → the `!select.value` guard never fires → the client posts `{"<answerId>": "Choose an author…"}` → the server rejects with `incomplete_guesses` (`whoWroteThat.js:181-193`). The player gets a server round-trip error instead of local validation, and `bindSelect` (`games.js:128-130`) persists the placeholder into `drafts`.

**Fix** — give the placeholder `option.value = ""` and skip it in `bindSelect` when storing the draft.

### C5 · One of Us hides the clues while players vote
**Where:** `web/games.js:404` is the **only** call to `clueList(game)`. Grep anchor: `clueList(game)`.

`oneOfUs.publicView` deliberately opens clues for `["discuss","vote","results","complete"]` (`server/games/oneOfUs.js:251`), but the client renders them only in the `discuss` branch. **A player about to vote for the imposter sees no clues at all** — the single most important piece of context in the game. Same omission in the `results` branch.

**Fix** — render `clueList(game)` in the `vote` and `results` branches too.

---

## HIGH

| # | Where / anchor | Problem | Fix |
|---|---|---|---|
| H1 | `web/games.js:109` — `keyOf` | Draft key is `${id}\|${round}\|${phase}\|${field}` with **no game-instance id**. `admin:replayGame` calls `engine.create(room)` (`server/protocol.js:482`) which resets round→1, producing an **identical key** → after a replay, previous answers/clues are pre-filled and can be resubmitted. | Include a per-instance id in the key (e.g. `game.startedAt`, or a server-issued `game.instanceId`). Delete the draft on successful submit. |
| H2 | `web/admin.js:554-573` — `runControl` | The server response is flattened into `new Error(result.message)`, **dropping `result.code`**. `handleAdminFailure` (`admin.js:1713`) checks `result?.code === "admin_expired"` → an expired admin session on a game control is never detected; the host sits on a dead console with a toast. | Call `handleAdminFailure(result)` before throwing, or throw an error that carries `.code`. |
| H3 | `web/admin.js:1525-1555` — `loadContent` | The catch sets `dom.contentStatus.textContent = "Could not load game content…"`, then `finally → renderContent() → updateContentStatus()` **overwrites it** with "Content is not loaded. Sign in again or refresh." The real failure never reaches the host. | Surface load failures in `dom.contentError` via `showError()`, or make `updateContentStatus` respect a stored error. |
| H4 | `web/admin.js:357-373` — `showLogin` | Sign-out does not reset `contentData`/`contentDraft`/`contentDirty`/`playlistDraft`/`currentState`. After sign-out → sign-in, `loadContent()` early-returns on `contentDirty && !force` → the host sees the **previous session's draft**, a phantom "Unsaved changes" badge, and `beforeunload` keeps nagging. | Reset that state in `showLogin()` (or the logout handler). |
| H5 | `web/styles.css:1113` — `.toast` | **Measured:** `max-width: none`, `position: fixed`, `left: 50%`. A long invite URL overflows the viewport and is clipped by `body{overflow-x:hidden}`. | Add `max-width: calc(100vw - 32px); overflow-wrap:anywhere; text-align:center;`. |
| H6 | `web/styles.css:71` + `web/admin.css:4` | `overflow-x:hidden` on `body` computes `overflow-y:auto` → the body becomes a scroll container → `position:sticky` on `.admin-nav` (`admin.css:74`) no longer sticks; the nav scrolls away. | Use `overflow-x:clip` in both files (clip does not create a scroll container). |
| H7 | `web/styles.css:1093` — `.banner` | `position:fixed; inset:0 0 auto; z-index:50` with **no layout offset**, while `.admin-nav` is `z-index:20` → the connection banner covers the top of the nav. | Make the banner `position:sticky` (in flow) or push the nav down when the banner is visible. |
| H8 | `web/admin.css:793` — `.field-input` | `font-size:15px` → **Safari zooms the page on focus** (iOS zooms anything under 16px). The player form correctly uses 16px (`styles.css:337,667`). | Set `font-size:16px` on `.field select, .field-input`. |
| H9 | `web/admin.js:1854,1874,1930` — `endGame`/`replayGame`/`toggleLock` | No in-flight guard. Double-clicking "End game" sends two events; the second fails with `no_game` (`protocol.js:445`) and throws a spurious red toast. | Disable the button for the duration of the request; re-enable in `finally`. |
| H10 | `web/admin.js:310` `confirmAction` vs `1785,1810,1860,1881,1914,1977,2005,2178` | The **"Confirm destructive actions" setting is ignored.** `confirmAction()` is used in 3 content-edit places; every genuinely destructive room action calls `window.confirm` directly, so turning the switch off changes nothing for the dangerous ones. | Route all destructive prompts through `confirmAction()`. |
| H11 | `web/styles.css:348,670` + `web/admin.css:803` | `outline:none` on `:focus` discards the global `:focus-visible` ring. Keyboard users get only a 1px border-colour change, and it fires on mouse click too. | Use `:focus-visible` with `outline:2px solid var(--secondary); outline-offset:2px`. |

---

## MEDIUM

### Player UI — `web/games.js`

| # | Where | Problem | Fix |
|---|---|---|---|
| M1 | `games.js:504, 588, 1146` | The session scoreboard is missing in One of Us, Who Is It? and Who Wrote That?! results. Act It Out (`711`) and Who/Where Am I (`829`) do show it. Inconsistent in playlist mode. | Add `if (state.public.playlist) nodes.push(sessionScoreboard(state));` to those three results branches. |
| M2 | `games.js:6-21` — `PHASE_LABELS` | `reveal: "Reveal your role"` is wrong for Who/Where Am I, where `reveal` means the *answer* is being revealed (`turnGuess.js:147`). | Make `phaseLabel` content-type aware, or add a per-game override for `turnGuess`. |
| M3 | `games.js:796-844` | turnGuess's `complete` phase reuses the `reveal` branch, so a host-finished game shows "Turn skipped / The answer was —" instead of a scoreboard. | Give `complete` its own branch. |
| M4 | `games.js:1317-1328` — `renderGameScreen` | There is a fallback for an unknown **game id** ("This game screen is not available yet.") but **none for an unknown phase** — a renderer that returns `[]` yields a header-only blank screen. Any new engine phase ships as a blank page. | If a renderer returns no nodes, append a "Waiting for the host…" note. |
| M5 | `games.js:4` — `const drafts = new Map()` | `drafts.delete(key)` exists in 3 places, but only in the *empty-value* branch of `bindText`/`bindSelect` (`games.js:118-119, 129-130`). **Non-empty drafts are never pruned** → unbounded growth over a game night, and stale entries resurface on replay (H1). | Delete the key on successful submit; prune unreachable phases. |
| M6 | `games.js:982-1018` — spectator screen | Shows only progress pills and scores, never the public content of the running game (the question, the clue list, the category) even though all of it is in `state.public.game`. | Render the public phase content for spectators too. |
| M7 | `games.js:1287-1328` | The whole DOM is torn down and rebuilt on **every** broadcast. Focus/caret restore is best-effort and silently skipped when the phase key changes or `CSS.escape` is unavailable. | Patch low-stakes phases in place, or keep a per-field "dirty" flag. |
| M8 | `web/styles.css:687` — `.choice` | No `:disabled` style, but `games.js:184-191` disables it → a disabled vote looks active. | Add `.choice:disabled{opacity:.5;cursor:not-allowed}`. |
| M9 | `games.js:1086-1087` | `if (saved) select.value = saved` after `bindSelect` already restored the value — redundant today, and it silently clobbers the user's unsaved draft once the server starts echoing guesses. | Delete; let `bindSelect` own the restore. |
| M10 | `games.js:568` | Dead ternary: `game.topNames.length === 1 ? "The room picked" : "The room picked"` — both branches identical. | "The room picked" / "The room tied". |
| M11 | `games.js:95` — `playerRow` | Defined, never called. | Delete. |
| M12 | `games.js:53-58` — `note(text, tone)` | The `tone` parameter is never passed at any of the 40+ call sites, so `.game-note[data-tone="error"]` (`styles.css:644`) is unreachable. | Wire an error tone into validation, or drop the parameter. |
| M13 | `games.js:183-191` — `actOn` | The `fallback` parameter is never passed at any of the 9 call sites → every failure shows the generic "That action did not work." | Pass specific messages, or drop the parameter. |
| M14 | `games.js:384-397, 441-454, 749-765, 1039-1052, 1188-1202` | The same validate → disable → send → toast block is copy-pasted **5 times**. | Extract one `formSubmit({label, read, payload, fallback, onSuccess})` helper. |
| M15 | `games.js:189` (+ the 4 sibling blocks) | `submit.disabled = true` and the button is re-enabled **only in `.catch()`** → on success it stays greyed out until the next broadcast rebuilds it. If the broadcast is lost, it stays disabled with no explanation. | Re-enable in `finally`, or render an explicit "sent" state. |
| M16 | `games.js:292-298` | The spectator branch is checked **before** the `!game` branch, so a spectator in a between-games window sees "Waiting for the next game." instead of the playlist break screen. Latent today, but it will bite. | Check `!game` first, then `spectator`. |
| M17 | `games.js:64-83` | `initials()` and `toneClass()` are byte-for-byte copies of `web/app.js:200-220`. | Extract to a shared `web/dom.js`. |
| M18 | `games.js:238-308` | `scoreboard()` and `sessionScoreboard()` are ~80% identical. | Merge into one function with a mode flag. |
| M19 | `games.js:310` | `voteChoices`'s `type`/`label` parameters are always `"vote"`/`"Vote"`; the Act It Out "Correct" flow re-implements the same list by hand (`games.js:652-667`). | Inline them, or reuse for Act It Out. |
| M20 | `games.js:486-495` | One of Us publishes `game.voteBreakdown` (`oneOfUs.js:274`) but the client never renders it — players get a tally but cannot see who voted for whom. Who Is It? does render its equivalent. | Render `game.voteBreakdown` in the One of Us results block. |
| M21 | `games.js:465-476` | `game.caught` (`oneOfUs.js:268`) is published but unused; the client infers the outcome from `game.winner` and loses the "was caught" nuance. | Use `game.caught` to word the banner. |
| M22 | `games.js:1256-1266` | `historyList` (Truth or Dare) has no empty state, unlike `clueList` (`517`) and `countList` (`601`). | Mirror the `empty-state` pattern. |

### Host console — `web/admin.js`

| # | Where | Problem | Fix |
|---|---|---|---|
| M23 | `admin.js:982, 992, 1904, 2196` | Player counts **hardcoded** as `3` and `10` in four places, although the server sends `minPlayers`/`maxPlayers` in every state payload (`rooms.js:339-340`) and each game has its own `meta.minPlayers`. | Use `admin.minPlayers` / `admin.maxPlayers` / `game.minPlayers`. |
| M24 | `admin.js:1131-1144` — `renderPlaylist` | `dom.playlistHint` is written only when `canBuild` is false **and** `!playlist` → when a playlist exists, the builder's stale text stays on screen above the live panel. | Always set (or hide) the hint. |
| M25 | `admin.js:1419-1430` + `server/contentStore.js:178-186,224` | Text-field `max` **is** enforced client-side via `input.maxLength = field.max` (`admin.js:1436`). The `lines` type is not: `field.maxItems` is never checked and the textarea has no `maxLength`, so a 5th host note or 9th alias is silently dropped by the server. | Enforce `field.maxItems` client-side for `lines` fields, or warn when the server normalises. |
| M26 | `admin.js` — `field.required` | Never validated client-side. Adding a blank row → the server rejects **the whole collection** (`contentStore.js:255`) → the host cannot save anything else until that row is fixed or removed. | Validate required fields in `saveContent` and mark the offending rows. |
| M27 | `admin.js:435, 1155` (+20 more `replaceChildren`) | Every server broadcast rebuilds the whole player list and game grid. A button the host is mid-click on can be swapped between mousedown and mouseup → the click is silently lost. | Diff/patch the lists, or rebuild only when the relevant slice changed. |
| M28 | `admin.js:420-432` — `loadCatalog` | No retry path: the catch sets `catalogError` and shows it, but there is no Refresh for the catalog (unlike content's `#content-refresh`) and `loadCatalog()` runs once at module load. | Add a retry control, or re-call on tab focus. |
| M29 | `admin.js:1199-1200` | The rounds pill maps `maxRounds === 0` → "Host-paced", which is **wrong for Act It Out** (`maxRounds: 0`, `oneTurnEach: true` — `actItOut.js:26,322`) and for Who/Where Am I (`endless: true`). | Use the game's `oneTurnEach`/`endless` flags, which are already used at `admin.js:824-830`. |
| M30 | `admin.js:1537-1540` | The draft **does** reload when `contentKey` is corrected — but it is guarded by `if (!contentDirty \|\| force)`, so the previous collection's items are still rendered against the new collection's fields whenever there are unsaved changes. | Reload the draft (or prompt to discard) when `contentKey` is corrected. |
| M31 | `admin.js:1468-1475` | When `contentData` is null the `<select>` is emptied but `dom.contentCollection.disabled` is only set in the success path → an enabled, empty collection dropdown. | Disable it in the `!contentData` branch. |
| M32 | `admin.js:1493-1519, 1580-1583` | The search filter applies to rendered rows only; with a filter active, "Add entry" appends a row that may not match the query, and `scrollIntoView` then scrolls to the wrong element. | Clear the filter when adding an entry. |
| M33 | `admin.js:2028-2045, 1853-1871` | `upcomingPickerOpen` is reset in `startGame`/`startPlaylist`/`nextPlaylistGame`/`skipPlaylistGame`/`endPlaylist`/`resetRoom` but **not** in `endGame` or `returnToLobby` → the "Add upcoming" picker can reappear unexpectedly. | Reset it in both. |
| M34 | `admin.js:1010, 1950` vs `1984`, `endPlaylist`, `returnToLobby` | 2 of the 5 `playlistBusy = true` sites already re-render/disable their button (`:1010` `setUpcomingGameIds`, `:1950` `nextPlaylistGame`). **Still unguarded:** `skipPlaylistGame` (`:1984`), `endPlaylist`, `returnToLobby` → buttons stay enabled, a double click sends two events, and the second fails with `no_playlist`/`no_game` and shows a confusing toast. | Re-render (or set `button.disabled`) right after `playlistBusy = true` in the three remaining handlers. |
| M35 | `admin.js:554-573` | On success `runControl` never re-enables the button (only the catch does). It usually recovers via the server broadcast, but if that broadcast is lost the control stays permanently disabled. | Re-enable in a `finally`. |
| M36 | `admin.js:1035-1040` vs `901-905` | The upcoming-games picker says "Games are still loading." whenever `catalog.length === 0`, **including when the catalog failed to load**. | Reuse `catalogError` there. |
| M37 | `admin.js:518-528` — `renderHint` | The `admin.locked` check comes **after** the player-count checks → a locked room with 2 players shows "Need 1 more player" instead of the lock message. | Move the lock check first. |
| M38 | `admin.js:1637-1665` — `resetContent` catch | Shows the raw server error code (`"collection_not_found"`) instead of a human message, unlike `saveContent`. | Friendly fallback. |
| M39 | `admin.html:294` — `#playlist-live-badge` | Never touched by `admin.js` → the badge is permanently stuck on the static text "Host paced" even when the session is not host-paced. | Update it in `renderPlaylistLive`, or remove it. |
| M40 | `admin.js:314,323` — `switchAdminTab` | The `focus` option is never passed as `true` → keyboard users get no focus move on tab change. | Pass `{focus:true}` from the nav/keyboard handler, or drop the option. |
| M41 | `admin.js:97,111,122` | `dom.playlistCard`, `dom.contentCard`, `dom.gameCatalogCard` are fetched but never used. | Remove from the `dom` map. |
| M42 | `admin.js:16-24` | The `window.__FG_ERRORS` collector is test scaffolding shipped in production code. | Gate it behind a test flag. |
| M43 | `admin.js:1295` — `make()` | The most-used DOM helper is defined 850 lines after its first use (line 441). | Move it next to the other primitives. |

### Backend — `server/`

| # | Where | Problem | Fix |
|---|---|---|---|
| M44 | `server/protocol.js:482` — `admin:replayGame` | Calls `engine.create(room)` with the **full** room, including disconnected players, while `startEngine` (`protocol.js:185`) passes only connected players. A replay can seat someone who is not present. | Pass `{...room, players: connectedPlayers(room)}`. |
| M45 | `server/index.js:32` | `app.set("trust proxy", 1)` + IP-keyed rate limits (`protocol.js:10-12`) means `X-Forwarded-For` is trusted; behind anything other than exactly one proxy, the login/join/action limits are spoofable. | Use a specific trust-proxy value, or key the limit on something the proxy sets. |
| M46 | `server/rooms.js:318-329` — `cleanup()` | Only removes rooms with **zero connected players**. A room where everyone has left keeps its player list and scores alive for the full 30-minute TTL. | Also expire rooms with no *recent* activity, or clear the roster on last leave. |
| M47 | `server/protocol.js:417-423` vs `573` | `admin:startGame` requires **all** players connected, but `admin:startPlaylist` uses only connected players. A host can start a playlist that silently drops players but cannot start the same game singly. | Make the rules consistent and say which in the UI. |
| M48 | `server/rooms.js:227-252` — `gameEntry` | The archive entry snapshots `room.scores` for **all** players, including those who sat the game out (0 points), so history rows never distinguish "scored 0" from "didn't play". | Mark non-participants in the entry. |

### CSS / design system

| # | Where | Problem | Fix |
|---|---|---|---|
| M49 | `styles.css:287,294` / `admin.css:155,167` | `.card-head` and `.card-head h2` are defined in **both** files with different values (`gap` 8 vs 16px, `font-size` 21 vs 20px) → heading size differs between pages. | Keep one definition; put the admin delta on an admin-scoped selector. |
| M50 | `styles.css:417` / `admin.css:213` | `.btn-inline` split across files — **this is the cause of C1**. | See C1. |
| M51 | `styles.css:659` / `admin.css:787` | `.field-input` defined twice with **4 different values** (`min-height` 48 vs 46, radius var vs 14px, bg surface-3 vs surface-2, `font-size` 16 vs 15) → the same input renders two different ways depending on the page. | Delete the `admin.css` copy; keep one definition. |
| M52 | `styles.css:807` / `admin.css:1072` | `.history-list` defined twice; the admin copy adds `grid-template-columns` + `margin-top` but inherits `padding`/`list-style` from the player group. | Rename the admin variant (e.g. `.history-grid`). |
| M53 | `styles.css:477` / `admin.css:239`; `styles.css:616` / `admin.css:243` | `.pill` and `.pill-accent` duplicated with different values (`.pill-accent` alpha `.14` vs `.13`). | Consolidate. |
| M54 | `styles.css:805-941` | Dead CSS still shipping: `.assignment-list`, `.assignment-row`, `.assignment-copy`, `.assignment-name`, `.result-copy`, `.result-guess`, `.number-row` (leftover from the removed Number? game). | Delete the blocks. |
| M55 | `styles.css:177,204,1085,1270` | `.foot` and `.sr-only` are defined but never used in any HTML/JS. | Delete. |
| M56 | `admin.css:260, 1297, 1372` | Three `padding: … !important` overrides on `.room-hero`, all only needed because `.admin-panel > .card` (`admin.css:151`) out-specifies it. | Raise specificity (`.admin-panel > .room-hero`) and drop all three `!important`s. |
| M57 | `styles.css:344` | Placeholder colour `rgba(174,184,208,.5)` on `--surface-2` ≈ **3.08:1** contrast — below WCAG AA. | Raise alpha to 0.72 (same as `--on-surface-faint`) → ≈5.2:1. |
| M58 | `styles.css:575` | `.connection-dot.is-offline` ≈ **1.77:1** against the card → offline players are essentially invisible on the player lobby (the admin list has a text alternative; the player lobby does not). | Add a visible ring, or a text chip. |
| M59 | `styles.css` / `admin.css` | **No `@media print`** — the host console prints white-on-white (the room code, invite URL and player list are unreadable on paper). | Add a print block. |
| M60 | `styles.css` / `admin.css` | **No `forced-colors`** and **no `prefers-contrast`**. The active nav tab relies on colour + `box-shadow: inset` (removed in forced-colors mode); `.pill-accent`, `.badge-correct`, `.badge-wrong`, `.connection-dot` are colour-only. | Add `@media (forced-colors:active)` outlines. |
| M61 | `admin.css:91` | `.admin-nav-item` is 10.5px on mobile — below the 12px legibility floor for a persistent nav bar. (Measured: at 390px each item is 70px wide and "Live game" is 50px — it fits, but has ~8px of headroom at 320px.) | Raise to 12px, shorten the label to "Live", or reduce to 4 tabs. |
| M62 | `admin.css:1282` | Same nav item font drops to 9.5px at ≤620px and 9px at ≤380px. | Raise the floor to 11px. |
| M63 | `admin.css:39-45` | Hardcoded `calc(100dvh - 112px)` for the login shell; the real topbar is ~76px → the login card sits ~36px too low on short screens. | Use a CSS variable for the topbar height. |
| M64 | `admin.css:945-951` | `.empty-live{padding:64px 28px}` burns most of a phone viewport for the "No game is running" card. | Reduce on small screens. |
| M65 | `admin.css:1246-1248` | `.game-grid` column count is non-monotonic: 3 → 2 (≤1320) → **3** (≤1120) → 2 (≤860) → 1 (≤620). | Make the sequence monotonic. |
| M66 | `admin.css:1349` | `--head-offset:48px` at ≤620px, but the heading text actually starts at 38px badge + 14px gap = 52px → `#playlist-card > .hint` and `#content-card > .hint` sit 4px off. | Set `--head-offset:52px`, or reduce `.heading-with-icon` gap. |
| M67 | `styles.css:375` | `.btn` transitions don't include `color`, but `.btn-text:hover` changes `color` → the hover colour snaps while everything else animates. | Add `color` to the transition list. |
| M68 | `styles.css:464` — `.code-chip` | No hover/active/transition → the "tap to copy the room code" button gives no feedback. | Add a hover/active state. |
| M69 | `styles.css:1-55` | Unused design tokens: `--on-secondary`, `--border-faint`, `--space-6`, `--ease-spring`, `--duration-slow`. | Remove or use. |
| M70 | `app.js:185-197` + `app.js:672-684` | **Nested double GSAP tween** — `intro()` animates `.card` (opacity 0 for 0.55s) while `showStep` tweens the child form inside it in the same tick → stacked offsets and a flash. `admin.js:2214-2226` has the same pattern, and `.foot` matches nothing in either document. | Animate `.brand` + the first card only, or drop the `showStep` tween for the initial view. |
| M71 | `styles.css:64` | `html{color-scheme:dark}` + no print styles = see M59. | (Same fix.) |

### Tests — `scripts/`

| # | Where | Problem | Fix |
|---|---|---|---|
| M72 | `scripts/smoke-games.mjs:237-249` | Only **1 of 7** games has a real Socket.IO play-through. The other six are engine-level only, so a bug in `protocol.js`'s per-player payload construction (e.g. sending `publicView` to everyone) would not be caught by any test. | Add socket play-throughs for `act-it-out`, `who-is-it`, `who-am-i`, `where-am-i`, `truth-or-dare`, `who-wrote-that`. |
| M73 | `scripts/smoke-games.mjs` + `scripts/smoke-engines.mjs` | **Two privacy rules are asserted nowhere**: the imposter's own `you.game.word === null` before the reveal, and non-current players' `you.game.currentTurn === null` in Truth or Dare. | Add both assertions. |
| M74 | `scripts/smoke-foundation.mjs:11-17`, `scripts/smoke-games.mjs:11-17` | The spawned servers do **not** set `CONTENT_FILE=:memory:` → whatever the host last saved in the console can break the suite (`pickUnused` re-picks a 1-item collection, and the previous answer stays in `game.history`). | Set `CONTENT_FILE: ":memory:"` in the spawned env; set `process.env.CONTENT_FILE ??= ":memory:"` before the dynamic import in `smoke-engines.mjs`. |
| M75 | `package.json:15` | `smoke:server` is not part of the `smoke` aggregate. | `"smoke": "npm run smoke:server && npm run smoke:foundation && npm run smoke:engines && npm run smoke:games"`. |
| M76 | `scripts/smoke-game-ui.mjs:216-230` | If the imposter-guess input is not found, `findDriverWith` returns `null` and the **entire step is silently skipped** — the test still passes green. | `assert(guesser, "imposter guess input missing")`. |
| M77 | `scripts/smoke-ui.mjs:299` | `drivers.slice(0, 4)` — the 404-page browser (the one most likely to log JS errors) is never checked. | Use all drivers. |
| M78 | `scripts/smoke-ui.mjs:191-192` | Asserts the literal `"3 / 10"`, hard-coding `config.maxPlayers` → fails for an unrelated reason if the max changes. | Assert `/^\d+ \/ \d+$/` and read `maxPlayers` from the state. |
| M79 | `scripts/smoke-games.mjs:186` | `catalog.games.length === 7` hard-codes the game count. | `>= 7`; keep the exact-id set check in `smoke-engines.mjs:368-383`. |
| M80 | `scripts/smoke-games.mjs:100-106` | `game.word !== null` is true for `undefined` → a false failure instead of a leak detection. | Use `== null`. |
| M81 | `scripts/smoke-engines.mjs:160-163, 294-298` | Leak checks test for the literal key `"hints"` / `"authorId"`; rename the field and the check silently passes. | Assert on key presence (`!("hints" in view.assignment)`) and on the author's **name** not being present. |
| M82 | `scripts/smoke-engines.mjs:24-33` | The `drive()` helper is dead code. | Delete, or use it to remove the 7 copy-pasted blocks. |
| M83 | `scripts/smoke-engines.mjs:189` | Asserts the guesser scored 1 but never asserts the **others scored 0** → a bug awarding everyone would pass. | Assert non-guessers scored 0. |
| M84 | `scripts/smoke-engines.mjs:323` | `=== 9` hard-codes `3 rounds × 3 other-authors`. | `=== 3 * (room.players.length - 1)`. |
| M85 | `scripts/smoke-foundation.mjs:123,132,157,162,168-179` | `waitForState`/`waitForEvent` promises are created up to 12s before being awaited; on timeout Node ≥15 terminates with an unhandled rejection instead of a clean assertion failure. | Attach `p.catch(() => {})` at creation. |
| M86 | `scripts/smoke-games.mjs:5`, `smoke-foundation.mjs:5`, `smoke-server.mjs:3` | Fixed ports 3102/3101/3100, and the health poll will happily pass against a **stale server** already on that port while the spawned child dies with `EADDRINUSE`. | Use an ephemeral port; assert `child.exitCode === null` after the health check. |
| M87 | `scripts/smoke-games.mjs:112,121,175` | Fixed `sleep(120/200)` inside the play loop → a late broadcast makes the loop re-emit `admin:nextRound` → `wrong_phase` → red test. | Wait on the actual phase change instead of sleeping. |
| M88 | `scripts/smoke-ui.mjs:243`, `smoke-game-ui.mjs:281`, `smoke-all-games-ui.mjs` (end) | The UI suites leave rooms and player sockets alive on the shared dev server for the 30-minute TTL. | Emit `admin:resetRoom` in the `finally` block. |
| M89 | `scripts/ui-driver.mjs:79-93` | The Selenium error is swallowed and replaced with a generic "Timed out waiting for X" — the real cause is lost. | Include the original error in the message. |
| M90 | `scripts/smoke-game-ui.mjs:340-348`, `smoke-all-games-ui.mjs:355-363` | Two inline copies of the console-error check instead of the shared `assertNoBrowserErrors` helper. | Use the helper. |
| M91 | `scripts/smoke-ui.mjs:20` etc. | The UI suites require an already-running dev server but fail with a generic "Backend is not reachable" — no hint about the two commands to run. | Name the commands in the error. |
| M92 | `scripts/smoke-game-ui.mjs:328-329` | `drivers.pop()` assumes the late joiner is last. | Index-based `splice`. |

### Docs

| # | Where | Problem | Fix |
|---|---|---|---|
| M93 | `PLAN.md:173, 287` | References `server/prototypes/numberGame.js`; the real path is `prototypes/numberGame.js` (top level). | Fix the path. |
| M94 | `PLAN.md` vs `README.md` | ✅ **Fixed** — `PLAN.md` was reconciled at 17:34, before this document was written. False positive; no action needed. | — |
| M95 | `server/.env.example:3` | Ships `ADMIN_PASSCODE=familygameadmin` — the same value as `server/.env`. This is how a dev passcode usually reaches production. | Use a placeholder in `.env.example`. |
| M96 | `DEPLOY.md` | ✅ **Fixed** — rewritten at 17:52 with the real URLs (`https://familygame.wisp.uno`, `https://funfamilygame.vercel.app`). | — |

### Extra — dead files

| # | Where | Problem | Fix |
|---|---|---|---|
| X1 | `server/games/secretGuess.js` | An orphan left over from the pre-`turnGuess` refactor. It exists on disk but is **not** imported by `server/games/index.js` (the registry uses `turnGuess.js` for both Who Am I? and Where Am I?), and it still imports from `../server/games/common.js`. | Delete the file. |

---

## Suggested execution order

| Batch | Contents | Why |
|---|---|---|
| **1** | C1, C3, C4, C5 | Player-visible breakage, each a few lines, no refactor risk. |
| **2** | C2, M49-M57, M59-M66 | The "UI is broken" cluster: card chrome, duplicated CSS, dead CSS, contrast, print/forced-colors. |
| **3** | H1-H11 | Correctness and security-adjacent behaviour. |
| **4** | M1-M48 | Consistency, validation, guard rails. |
| **5** | M72-M92 | Test coverage gaps — worth doing **after** the fixes so the new assertions can prove the fixes. |
| **6** | M93-M96 | Docs. |

**Do not** rewrite `web/admin.js` or `web/games.js` from scratch, and do not add features. Every defect above is local.
