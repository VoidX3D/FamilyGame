# Family Game Hub — Project Specification

**Status:** working prototype, being finalized
**Type:** private, browser-based family party-game platform
**Players:** 3–10 per room
**Host:** one admin console per room
**Brand:** Family Game Hub — “7 Fun2Play Games”
**Primary language:** English (the content model leaves room for Nepali later)

---

## 1. Product principles

1. **Private rooms, real people.** A family member opens the host console and creates a room. Everyone else joins with a five-character code. No public matchmaking.
2. **IRL first.** The website handles prompts, private information, scoring, and synchronization. The actual talking, acting, laughing, and clue-giving happen in the room.
3. **No timers.** No game advances because time ran out. Games advance when players submit something or when the host takes an action. This keeps the games usable on slow phones and with family members who need a moment.
4. **Server-authoritative secrets.** Unrevealed words, people, places, roles, and prompts never enter another player’s payload.
5. **One shared platform.** Rooms, players, reconnects, scoring, history, and admin controls work the same way for every game.
6. **Fast flow.** The host can play one game or queue a whole game night without asking players to rejoin or re-enter the room code.

---

## 2. Games

There are **seven active games**.

### 2.1 Act It Out

A digital companion for family charades.

**Flow**
1. The game shuffles the players and gives each player one acting turn.
2. The actor’s phone privately shows a prompt. Everyone else sees who is acting and the prompt’s category.
3. The actor performs the prompt in person. The room shouts guesses.
4. The actor taps the first player who guessed correctly.
5. The prompt is revealed. The guesser scores 1 point; the actor scores 1 point.
6. The actor taps **Next** when the room is ready. The next actor gets a new prompt.
7. After the last actor, the game shows final results.

**Controls**
- The actor can skip to another prompt as many times as they like. Skipping awards no points.
- The actor can reveal the prompt and give up on the turn. No points.
- The host can reveal/skip the turn or finish the game early.

**Rules**
- One turn per player.
- No timer.
- Prompt categories are visible to the room; the prompt itself is private until the result.
- Content: editable charades prompts with categories.

### 2.2 One of Us

A social-deduction game with one imposter.

**Flow**
1. Three rounds.
2. Every player except the imposter receives the same secret word. The imposter knows only that they are the imposter.
3. Each player privately submits one typed clue. Clues cannot contain the secret word.
4. Once all clues are in, the room discusses out loud.
5. Everyone votes for the suspected imposter. Players cannot vote for themselves.
6. If the imposter is the unique top vote, the imposter gets one typed guess at the secret word.
   - Correct guess: imposter scores 2 points.
   - Wrong guess: every crew player scores 1 point.
7. If the imposter is not the unique top vote (including ties), the imposter scores 2 points immediately.

**Rules**
- Three rounds.
- No timer.
- The word and imposter stay fixed for the round.
- Host controls: start the vote, skip to results, advance rounds.

### 2.3 Who Is It?

A family-opinion voting game.

**Flow**
1. Three rounds.
2. A question appears for everyone, such as “Who is most likely to forget where they put something?”
3. Every player votes for the family member who fits the question best.
4. Results reveal the vote counts and who voted for whom.
5. The most-voted player or players each score 1 point. Ties all score.

**Rules**
- Three rounds.
- No timer.
- Players cannot vote for themselves.
- Host controls: advance rounds, finish early.

### 2.4 Who Am I?

A turn-based hidden-person guessing game.

**Flow**
1. One player at a time is the guesser. The game shuffles a turn order.
2. The game privately assigns a famous person to the active guesser.
3. Everyone **except** the active guesser sees the person on their phone and gives clues out loud. The host also sees the person.
4. The active guesser asks questions out loud and types guesses on their phone.
5. They may guess as many times as needed. Every wrong guess stays in their guess history.
6. An exact guess scores 1 point for the guesser.
7. The answer is revealed. The active guesser taps **Next** when ready.
8. After every player has had a turn, the order reshuffles and another pass begins with new people.
9. The host can skip a turn or finish the game at any time. The game has no automatic ending.

**Rules**
- No player-facing hints. The two reference notes for each person are **host-only** and appear in the admin console.
- The active guesser’s person is never sent to their browser before the reveal.
- The active guesser can give up; no points, answer revealed.
- The host can skip the turn if the guesser is stuck or disconnected.
- Content: 30 Nepali public figures and 10 global figures, with host notes and accepted aliases.

### 2.5 Where Am I?

The same turn-based guessing flow as Who Am I?, using places.

**Rules**
- Active guesser only. Everyone else sees the place and gives clues.
- Exact guess = 1 point.
- Unlimited guesses until correct or give up.
- Shuffled order; reshuffle and continue until the host finishes.
- Host-only reference notes.
- Content: 30 places in Nepal and 10 world capitals, with host notes and accepted aliases.

### 2.6 Truth or Dare

A player-written party game.

**Flow**
1. Every player submits exactly one truth question and one dare.
2. The game shuffles all submitted truths and dares into a prompt pool.
3. Players take turns. Each turn shows one prompt to the selected player.
4. The selected player may complete the prompt, or the host may skip it.
5. Two turns per player, then the game ends.

**Rules**
- Players can receive their own submissions. This is intentional.
- No score.
- No timer.
- Built-in truths and dares remain available for host testing and as fallbacks, but the main pool is player-written.
- Content: editable default truths and dares.

### 2.7 Who Wrote That?!

An anonymous-answer matching game.

**Flow**
1. Three rounds.
2. Everyone receives the same prompt and writes an answer privately.
3. All answers are shuffled and shown anonymously.
4. Every player guesses which player wrote each answer.
5. Authors are revealed. Every correct author match scores 1 point.

**Rules**
- Answers and authors stay hidden until the reveal.
- Authors do not guess their own answer.
- Three rounds.
- No timer.
- Content: editable anonymous-answer prompts.

---

## 3. Parked prototype

### Number? — not active

The original Number? prototype is parked. The number-generation rules are still unresolved:

- huge range (up to 1 trillion),
- higher/lower feedback,
- one or two digit-style rules,
- everyone sees everyone else’s number but never their own,
- turn-based guessing.

The existing code lives in `prototypes/numberGame.js` and is **not registered** in the game catalog. It is not part of the player UI, admin catalog, or active smoke tests. Do not complete it until its rules are finalized.

### Removed games

These ideas were removed from the active lineup:

- **Hot or Cold** — removed. The device-heavy hidden-word loop did not fit the family flow.
- **The Round Table** — removed. It did not have a clear enough identity or scoring purpose.

Their engine files are deleted. Removed games should not appear in the catalog, content editor, README game list, or active tests.

---

## 4. Session flow

### 4.1 Single game

The host picks one game from the catalog and starts it. All players must be connected. When the game ends, the host can replay it, return to the lobby, or start a playlist.

### 4.2 Game-night playlist

The host can build a queue of games before starting a session.

- Any active game can be added.
- Games can repeat.
- The host can reorder the queue, remove upcoming games, and insert games between turns.
- Scores are cumulative for the whole playlist, and the current game’s scoreboard is also shown.

**Starting a playlist**
1. The host builds the queue in the admin console.
2. Starting the playlist begins the first game.
3. The room code stays the same for the whole session.

**Between games**
1. When a game finishes, every device shows that game’s final scoreboard and the cumulative session totals.
2. Nothing starts automatically. The host waits until players have reconnected and are ready.
3. The host taps **Start next game**.
4. The next game includes every connected player in the room.
5. If fewer than three players are connected, the start is blocked. The host can wait, skip the game, or end the playlist.

**Disconnects**
- A player who is disconnected when a game starts sits that game out. Their phone shows a spectator screen.
- They rejoin automatically in the next game if they are connected when the host starts it.
- A player who disconnects during a game and reconnects before it ends resumes their existing seat.
- A player who reconnects after being excluded from the current game spectates until the next game.

**Editing the playlist**
- The host can insert or remove upcoming games between games.
- The host can skip the current game.
- The host can end the playlist early. Remaining games are discarded.

**Ending the playlist**
- When the queue empties, the host sees a final session scoreboard and can start a new playlist or return to the lobby.
- If the host ends early, the room returns to the lobby with the session totals preserved for the final summary.
- A new playlist resets session scores to zero.

### 4.3 Session scoreboard

- `room.scores` holds the current game’s points.
- `room.sessionScores` holds the cumulative playlist points.
- Every scoring award updates both.
- In single-game mode the session board is not emphasized.
- In playlist mode, players see both the current game and the running total.

---

## 5. Platform architecture

### 5.1 Stack

- Node.js 18+
- Express 5 for REST
- Socket.IO 4 for real-time room and game state
- Vanilla ES modules and hand-written CSS on the client
- No bundler
- No database for v1
- In-memory rooms
- Optional JSON content persistence for admin edits

### 5.2 Room lifecycle

1. Admin authenticates with a passcode over REST and receives an opaque bearer token.
2. The admin socket authenticates with that token during the Socket.IO handshake.
3. The admin creates a room; a five-character code is generated.
4. Players join with the code and a display name.
5. Each player receives a recovery token stored locally so a refresh or reconnect restores their seat.
6. The room tracks players, scores, history, lock state, game phase, and playlist.
7. Only the admin socket can start games, advance turns, edit the playlist, or remove players.
8. Empty rooms are cleaned up after the configured TTL.

### 5.3 Game engine interface

Each engine exports:

- `meta` — id, name, tagline, min/max players, max rounds, scoring flag
- `create(room)` — initial game state
- `publicView(game)` — state safe for every player
- `playerView(game, playerId)` — private state for one player
- `adminView(game)` — host state, including hidden answers and host notes
- `action(room, game, playerId, payload)` — player action
- `adminAction(room, game, type, payload)` — host control
- `nextRound(room, game)` — protocol compatibility for “advance” controls

Game engines must never put unrevealed secrets into `publicView` or another player’s `playerView`.

Active engines:

- `actItOut.js`
- `oneOfUs.js`
- `whoIsIt.js`
- `turnGuess.js` (shared by Who Am I? and Where Am I?)
- `truthOrDare.js`
- `whoWroteThat.js`

The parked `prototypes/numberGame.js` is not in the registry.

### 5.4 Player state and spectators

Player payloads contain `{ public, you }`.

- `public` is the room and game state safe for everyone.
- `you` is the individual player’s private state.
- If a player is in the room but not in the current game’s player list, `you` includes `spectator: true` and a short message. The player UI shows a spectator screen instead of game controls.
- The admin payload contains `{ public, admin }`, plus full raw game state through the admin data inspector.

### 5.5 Private data rules

- One of Us: secret word and imposter id are hidden until results.
- Who Am I? / Where Am I?: the active guesser never receives the answer or host notes before the reveal.
- Act It Out: only the actor receives the prompt; others see the category.
- Truth or Dare: only the selected player receives the prompt text.
- Who Wrote That?!: answer authors are hidden until the reveal.
- Number? prototype: never exposed; not registered.

---

## 6. Content and admin editing

### 6.1 Editable collections

| Collection | Game | Fields |
| --- | --- | --- |
| `oneOfUsWords` | One of Us | word, category |
| `whoIsItQuestions` | Who Is It? | question text |
| `people` | Who Am I? | name, host notes, group, accepted aliases |
| `places` | Where Am I? | name, host notes, group, accepted aliases |
| `whoWrotePrompts` | Who Wrote That?! | prompt text |
| `truths` | Truth or Dare | truth text |
| `dares` | Truth or Dare | dare text |
| `charades` | Act It Out | prompt, category |

Host notes are never shown to players. They are available to the host in the admin console during a turn.

### 6.2 Editing behavior

- The admin console lists every collection with a count.
- Selecting a collection opens a form for each item.
- Text fields, multi-line host notes, and aliases are edited inline.
- The host can add, remove, and reorder items.
- Saving validates the whole collection and returns clear row-level errors.
- A collection must keep at least one item.
- Changes apply to new games and new rounds. Active assignments keep their snapshot.
- “Reset to defaults” restores the built-in list for one collection; “Reset all” restores everything.
- Edits are persisted to `server/data/content.json` by default.
- `CONTENT_FILE=:memory:` disables disk persistence for tests and previews.
- If the file cannot be written, edits stay in memory and the admin sees a warning.

### 6.3 Data inspector

The admin console can load a complete, read-only snapshot of:

- room metadata, code, phase, lock state, timestamps
- players, connection state, join times
- current game raw state
- public view
- admin view
- each player’s private view
- current and session scores
- game history
- playlist queue, index, and completed games
- content status and collection counts

The snapshot can be refreshed, copied, or downloaded as JSON. Player recovery tokens and live socket IDs are deliberately excluded.

---

## 7. Admin console

The admin console is discreet and host-only.

### 7.1 Room controls

- Show and copy the room code and join URL.
- Lock or unlock the room.
- Remove a player outside a game.
- See connected/disconnected status.
- Start a single game or a playlist.
- Replay or end the current game.
- Advance rounds and turns.
- Skip a stuck player or turn.
- Finish turn-based games.
- View live submission counts and current game scores.
- View recent game history.

### 7.2 Playlist builder

- Add any active game to the queue.
- Repeats allowed.
- Reorder, remove, and insert games.
- Start the playlist.
- During a session: show the current game, position in the queue, and upcoming games.
- Between games: **Start next game**, **Skip game**, **Insert game**, **Remove upcoming**, **End playlist**.
- If fewer than three players are connected, show a clear waiting message.

### 7.3 Content editor

- Collection selector.
- Item count and game label.
- Inline forms generated from the server’s collection schema.
- Add, remove, save, reset.
- Host-note fields clearly labeled.
- Validation errors inline.

### 7.4 Data inspector

- Refreshable snapshot.
- Collapsible sections for room, game, views, scores, history, and playlist.
- Copy and download JSON.

---

## 8. Player UI

- Minimal join screen: room code, then name.
- Lobby shows the room code, players, connection status, and playlist preview.
- During a game, the brand header is hidden so the game interface fills the screen.
- Each game has a private view for the active player and a waiting view for everyone else.
- Drafts survive re-renders and reconnects where appropriate.
- Results and reveals are synchronized.
- No game is advanced by a timer.
- Spectator screen for players who joined the room but are not in the current game.
- Session scoreboard shown alongside the current game score in playlist mode.
- Mobile-first layout: phones, iPad, short landscape, and desktop.

### 8.1 Branding

- Player pages: Family Game Hub / **7 Fun2Play Games**.
- Admin pages: Family Game Hub / Host access.
- Both lockups sit in the true top-left of the page.
- The header is hidden during gameplay.
- The player “Host” button is removed; the host goes directly to `/admin`.

---

## 9. Game-night flow summary

```text
Host creates room
  → players join
  → host builds a playlist (optional)
  → game 1 starts
  → final game scoreboard + session totals
  → host waits for reconnects
  → host taps Start next game
  → game 2 starts with every connected player
  → ...
  → final session scoreboard
  → host starts a new playlist or returns to the lobby
```

Single-game mode is the same flow with a queue of one game.

---

## 10. Security and safety

- Admin passcode is environment-configured and never sent to players.
- Admin sessions are opaque bearer tokens with a TTL.
- Login attempts are rate-limited.
- Player recovery tokens are stored locally and sent only over the player session protocol.
- Player tokens and socket IDs are not exposed in admin REST snapshots.
- All game actions are validated server-side.
- Rate limits protect room checks, joins, and game actions.
- No public rooms, no public chat, no external content fetching during play.
- Family-friendly built-in content.
- No destructive system commands are part of the app.

---

## 11. Testing

### Server smoke suites

- `npm run smoke:foundation` — auth, rooms, sessions, join/leave, locking.
- `npm run smoke:engines` — all active engines: privacy, scoring, phase transitions.
- `npm run smoke:games` — real Socket.IO play-throughs.
- `npm run smoke:content` — content list, validation, save, reset, data snapshots.
- `npm run smoke` — all of the above.

### UI smoke suites

- `npm run smoke:ui` — join, lobby, admin login, branding, responsive checks.
- `npm run smoke:game-ui` — full One of Us flow.
- `npm run smoke:ui-all` — the remaining active games and new game flows.
- Firefox is the default test browser.

### Manual checks

- 3, 4, and 10 players.
- Ties and odd player counts.
- Refresh and reconnect.
- Disconnect during a turn; host skip.
- Playlist start, between-game reconnect, cumulative scores, skip/end.
- Admin content edits and reset.
- Private data never appears in the wrong payload.
- Short landscape and small-phone layouts.

---

## 12. Deployment

- Backend: Wispbyte (Socket.IO-capable Node host).
- Frontend: static hosting (Vercel).
- Environment:
  - `PORT`
  - `HOST`
  - `ADMIN_PASSCODE`
  - `FRONTEND_ORIGINS`
  - `CONTENT_FILE` (optional; `:memory:` disables persistence)
  - `ROOM_TTL_MINUTES`
  - `ADMIN_LOGIN_ATTEMPTS`
- Production admin passcode must be set explicitly.
- Content persistence requires a writable path on the backend.
- Final deployment URLs are still pending.

---

## 13. Out of scope for this version

- Database persistence for rooms.
- Accounts, profiles, or cross-room identity.
- Public matchmaking.
- Voice chat, text chat, or live translation.
- Automatic text-to-speech.
- Timed games.
- Number? until its rules are finalized.
- Hot or Cold and The Round Table.
- Wrong Answers Only, Chaos Mode, Family Court, and other future ideas.

---

## 14. Guiding rule

**The room is the game. The website keeps the secrets, the score, and the pace.**

If a feature makes the family stare at their phones instead of each other, it does not belong in this version.
