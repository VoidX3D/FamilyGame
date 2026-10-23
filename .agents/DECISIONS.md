# DECISIONS

The decisions that were made, and the reasons behind them. They are here so
they are not relitigated every time somebody reads the code for the first
time.

If you want to change one of them, change it on purpose: write down the new
reason here, in the same commit.

---

## 1. Twelve games have no timer. Draw It does, on purpose.

**Decision.** Every active game except Draw It advances on state, not on a clock.
Draw It runs on a server-owned deadline. The thirteen-game catalog therefore has
twelve non-timed games and one server-timed drawing game.

**Why.** A party game is played by people who are also talking, eating and
laughing. A timer that cuts a round off while somebody is answering makes
the game feel like a job. It also makes the host a referee, which is the
opposite of what a party game should need. So a round ends when the required
players have done their part, or when the host uses a control.

Draw It is the exception because a drawing turn that never ends is not a
game. Someone has to stop it, and the only thing in the room that can do
that without favouring anyone is a clock. The clock is owned by the server,
not by the browser: the server publishes a deadline with the game state and
every client counts down from it. A phone that sleeps, misses an event, or
reloads cannot end a turn by accident, and the drawer cannot end it early
either — that is how the drawer would learn the word sooner than the room.

**In practice.** A new game does not get a timer because it is the fashion.
If it needs one, it needs the server to own the deadline.

---

## 2. The server is the only authority on a secret.

**Decision.** An unrevealed secret — a word, a person, a place, a role, a
prompt — never appears in `publicView()`, never appears in another player's
`playerView()`, and never reaches the browser in a form the browser can
check against. Guesses, votes, scores, turn order and clock deadlines are
all decided on the server.

**Why.** A party game is only funny if nobody in the room can read the
answer off somebody else's screen. Any secret that reaches a browser is a
secret that can leak: through a shared phone, a screenshot, a shoulder, or
simply a developer poking at the console. If the browser holds the answer,
the answer is only as safe as every client in the room.

Keeping the decision on the server also means the rules are the same for
everybody. The client sends the text of a guess; the server normalises it
(case, punctuation and spaces do not matter) and answers correct or not.
The same rule, every time, with no chance of two phones disagreeing.

**In practice.** The suites check this and must keep checking it. If you add
a game, add the leak check for your game. If you find yourself comparing a
guess in `web/games.js`, move that comparison to the engine.

---

## 3. No build step.

**Decision.** No bundler, no transpiler, no framework and no CSS pipeline.
The browser loads the source files as they are. Third-party code is vendored
into `web/vendor/` and served from there.

**Why.** The whole point of this project is that a family can open a link on
a phone and play. A build step adds a toolchain that has to work on every
machine that touches the project, in every deployment, before anything can
be served. It also makes the source harder to read: the file you edit is
not the file the browser runs.

Vendoring is the cost of that decision, and it is a cost worth paying. GSAP,
Lenis and the Socket.IO client are three files. They are copied into
`web/vendor/` by `npm run vendor`, they are listed in
`web/vendor/THIRD-PARTY.md`, and the browser loads them with a plain
`<script>` tag.

**In practice.** A new dependency means a file the server has to serve.
That is the whole test: if the file cannot be served or vendored, it does
not go in.

---

## 4. The `backend` branch is generated, and is never merged.

**Decision.** `main` is the source of truth. The `backend` branch is an
output: a subtree split of `server/`, published by the
`sync-backend` workflow and pulled by the hosting panel. It is never
committed to by hand, and it is never merged into another branch.

**Why.** The backend has to live somewhere the hosting panel can pull it,
and that somewhere has to contain only the backend. A subtree split gives
the panel a clean, backend-only tree without a second repository. But a
subtree split has its own history, so `backend` and `main` cannot be merged
into each other — git cannot reconcile the two histories, and a merge
attempt leaves the repository in a state where neither side can be trusted.

So `backend` is treated as an artefact. The workflow publishes it as a
straight line of commits on top of the previous tip, so every clone can
fast-forward, and it refuses to publish at all if the tree contains anything
from `web/` or `.github/`. `git config pull.ff only` is set, so a pull
**refuses** a non-fast-forward instead of quietly creating a surprise merge
commit.

**In practice.** If a pull on the hosting machine complains about divergent
branches, run `npm run deploy:update`. It takes the server's version of the
branch and stashes any local edits instead of discarding them. Do not try to
merge `backend` into anything.

---

## 5. The host console never touches the game during a round.

**Decision.** The host starts a game, ends a game, moves a round on, and
stops a game that has gone wrong. It does not make the choices inside a
round. Players do that.

**Why.** The host is usually standing in the middle of the room holding a
phone. A host who has to tap through every turn is a host who is not
playing. And a game where the host decides the outcome is not a game
between the players.

One of Us shows this most clearly: the clues are **spoken out loud**, the
screen only says whose turn it is to speak, and after two rounds of hints
the room votes on its own. The host never touches anything.

**In practice.** A new game should be playable by the room alone. If the
host console needs a new button, it is usually a sign that the game is
missing something the players should be doing.

---

## 6. Content is data in JSON.

**Decision.** The words, questions, people, places, prompts and dares live
in `server/data/default-content.json`. The shape of each collection lives
in `server/data/content-schema.json`. No content is hard-coded in a game
engine, except each game's own built-in fallback entry.

**Why.** Content is the part of this project that grows fastest, and it is
the part a family most wants to change. Keeping it in JSON means adding
questions is a data edit, and adding a whole new kind of collection is a
data edit too, not a code change.

The schema being in JSON as well means the host console can read it and
build the editor from it, instead of the editor and the server disagreeing
about what a collection looks like. The server validates the whole
collection on save and writes the file atomically, so a half-written file
cannot take the site down.

**In practice.** If you want to add content, edit the JSON. If you want to
add a collection, add it to the schema and to the content file. A
collection that is registered but missing from the content file must be
reported and survived, not fatal.

---

## 7. The port is 12800.

**Decision.** The API runs on port 12800 in production, in local
development and in the test suites. There is one port in the project.

**Why.** The hosting service requires it. It would have been simpler to let
the front end talk to `localhost:3000` in development and to the deployed
host in production, but then every port change was a change in three
places at once, and one of them was always missed. The front-end config,
the net helper, the test driver and the dev server's CSP all point at
12800, so there is one place to change and no chance of the front end
pointing at a port that is not running.

**In practice.** The front-end dev server is on 5173. That is a static file
server, not the API, and it does not change this decision.

---

## 8. The passcode is shared, and it lives in `server/.env`.

**Decision.** The host console is protected by one passcode that the host
shares with whoever is hosting that night. It is read from
`ADMIN_PASSCODE` in `server/.env`, or from a real environment variable,
which always wins. If neither is set, the server generates one, keeps it in
`server/data/admin-passcode` and prints it on startup.

**Why.** There are no accounts. A party game for one room does not need
per-person identities, and asking a guest to make an account before they
can play is a good way to lose them in the first ten seconds. One shared
passcode is a small, honest amount of security for a private link.

The passcode is never accepted from the URL. URL passcodes are stripped and
refused, because a passcode in a link ends up in the browser history, in the
chat log of whoever sent it, and in a screenshot.

**In practice.** The token that comes back from `POST /api/admin/login` is
opaque, lives in `sessionStorage`, and is checked on the Socket.IO
handshake. `npm run passcode` prints the passcode in use, which is handy
when it was generated rather than written down.

---

## 9. Rooms live in memory, so a restart empties them.

**Decision.** Rooms, players, scores, sessions and the used-content memory
live in the server process. There is no database.

**Why.** A game night lasts a couple of hours and nobody wants their game
history on somebody else's server. Rooms that disappear when the process
restarts cannot leak into the next session, and there is nothing to
migrate, nothing to back up and nothing to secure. It also makes the
privacy story easy to state: the room is gone when the server is.

The content bank is the exception. Saved content lives on disk in
`server/data/content.json`, because a family that spent an evening writing
their own questions does not want to write them again.

**In practice.** A restart during a game night ends the rooms. The hosting
service restarts on a deploy, so this is a known cost and it is the right
one. If it ever stops being the right one, that is a decision to make
deliberately, not a bug to patch.

---

## 10. Every submission has a visible, server-authoritative state.

**Decision.** A player who has submitted sees the saved submission and a clear
waiting state. The server tracks eligible submitters, voters and guessers for
each phase; a round never advances because an unrelated player's count happens
to match another collection's length.

**Why.** These are pass-the-phone games. If a form disappears after a tap, the
player assumes the answer was lost and submits again. If it comes back, the
browser is contradicting the server. The server must remain authoritative, but
the client must render that authority clearly.

**In practice.** Two Truths accepts statements only from the storyteller;
Caption This counts eligible voters rather than captions; optional answers are
represented by property presence, so an empty “skip” is still a submission;
and every renderer has explicit submitted, waiting and result states. Secrets
remain hidden until the phase that intentionally reveals them.

---

Made by **VoidX3D (Sincere Bhattarai)**.
