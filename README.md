# Family Game Hub

A private, browser-based party-game hub for 3 to 10 players in the same room.
One host opens a room, everyone joins from a phone or laptop with a five-character
code, and the host starts a game. The server owns every room, turn, score, and
secret assignment.

No database is required. Rooms live in server memory. The built-in question bank
is in `server/games/content.js`; edits made in the host console are saved to
`server/data/content.json`.

## Games in v1

| Game | Players | Rounds | How points work |
| --- | --- | --- | --- |
| One of Us | 3 to 10 | 3 | Crew win: 1 each. Imposter win: 2. |
| Who Am I? | 3 to 10 | 3 | Exact person guess: 1. |
| Where Am I? | 3 to 10 | 3 | Exact place guess: 1. |
| Who Is It? | 3 to 10 | 3 | Most-voted player(s): 1 each. |
| Who Wrote That?! | 3 to 10 | 3 | Each correct author match: 1. |
| Act It Out | 3 to 10 | One turn each | Actor and correct guesser: 1 each. |
| Truth or Dare | 3 to 10 | 2 cycles | Just for fun; no points. |

Nothing is timed. A phase advances only when every required player submits or
when the host uses an available control (`Start voting`, `Next round`,
`Reveal result`, `Skip turn`, and so on).

### Rule notes

- **One of Us**: the crew sees a secret word, the imposter sees only its category.
  The imposter can win by surviving the vote or by guessing the word after being
  caught. A clue that contains the secret word is rejected.
- **Who Am I? / Where Am I?**: every player gets a different assignment. The
  player sees everyone else's assignment and hints, never their own until the
  reveal. Content includes Nepal-focused people and places plus global entries.
- **Who Is It?**: everyone votes for another player; the most-voted player(s)
  score. Ties award every player at the top.
- **Who Wrote That?!**: answers are anonymous while players match them to authors.
  Authors are revealed together with the round result.
- **Act It Out**: one actor sees a prompt and category while everyone else sees
  only the category. The actor taps the first correct guesser; both score.
- **Truth or Dare**: every player submits one truth and one dare. The pool is
  shuffled into individual turns across two cycles. Prompt text appears only on
  the current player's screen, never in public or host state.

## Stack

- Node.js 18+
- Express 5 + Socket.IO 4
- Vanilla ES modules, HTML, and CSS on the frontend (no bundler)
- Vendored GSAP, Lenis, and Socket.IO browser builds
- In-memory rooms and a file-backed content bank; no database

## Local development

Requirements: Node 18 or newer, npm, and Chrome for the UI smoke tests.

```bash
npm install
npm --prefix server install
cp server/.env.example server/.env
# edit server/.env and set ADMIN_PASSCODE
```

Run the backend and the static preview in two terminals:

```bash
npm run dev:server   # http://localhost:3000
npm run dev:web      # http://localhost:5173
```

Open:

- Player: <http://localhost:5173/>
- Host: <http://localhost:5173/admin>
- Admin sections: `/admin/room`, `/admin/playlist`, `/admin/session`,
  `/admin/content`, `/admin/config`
- Short invite: `http://localhost:5173/g/CODE`

`/admin/live` and `/admin/settings` remain aliases for Live game and
Settings. `web/config.js` points localhost traffic at `http://localhost:3000`.
The host console uses the `ADMIN_PASSCODE` from `server/.env`.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Backend port |
| `NODE_ENV` | `development` | Use `production` in deployment |
| `ADMIN_PASSCODE` | random in development | Host passcode; required in production and at least 12 characters |
| `FRONTEND_ORIGINS` | local preview URLs | Comma-separated CORS allowlist |
| `ADMIN_LOGIN_ATTEMPTS` | `5` production, `50` otherwise | Login attempts per 10 minutes |
| `CONTENT_FILE` | `server/data/content.json` | Saved content file; `:memory:` disables disk persistence |

## Tests

The non-UI suite starts its own test servers and needs no running process:

```bash
npm run smoke
```

That runs three checks:

- `smoke:foundation`: auth, rooms, sockets, reconnect, lock, reset
- `smoke:engines`: every game engine driven to completion, including secret-leak checks
- `smoke:games`: real Socket.IO play-through of One of Us

Browser tests need the backend and web preview running, plus Chrome. They read
`ADMIN_PASSCODE` from the environment or `server/.env`:

```bash
npm run smoke:ui        # login, routes, invite links, lobby, layout, reset, 404
npm run smoke:game-ui   # full One of Us game, host controls, lock, all viewports
npm run smoke:ui-all    # the other six games end-to-end in Chrome
```

Screenshots are written to `.shots/` (gitignored). Set `ADMIN_PASSCODE`,
`WEB_URL`, `API_URL`, or `SCREENSHOT_DIR` to override defaults.

## Project layout

```text
server/
  index.js          HTTP API, health, game catalog
  config.js         Runtime configuration and admin passcode rules
  contentStore.js   Editable content collections, validation, file persistence
  protocol.js       Socket.IO lifecycle, broadcasts, player/admin actions
  rooms.js          In-memory room store, players, scores, history
  data/
    content.json    Saved content edits, created on first save and gitignored
  games/
    index.js        Game registry
    common.js       Shared engine helpers and state shapes
    content.js      Built-in words, questions, people, places, prompts
    actItOut.js
    oneOfUs.js
    whoIsIt.js
    whoWroteThat.js
    truthOrDare.js
    turnGuess.js    Who Am I? and Where Am I?
web/
  index.html        Player shell
  admin.html        Host shell
  app.js            Player connection and session flow
  admin.js          Host console
  admin.css         Host console layout and responsive styles
  games.js          Player screens for all seven games
  styles.css        Shared Material Expressive-inspired dark UI
  404.html           Custom not-found page
  404.css            Custom not-found styling
  config.js         Runtime API URL
  vercel.json       Static-host rewrites, 404 behavior, and security headers
prototypes/         Parked prototypes that are not part of the game catalog
scripts/            Foundation, engine, protocol, and Chrome UI smoke tests
```

## Privacy model

- The server is authoritative. Secret assignments are kept in server state.
- Public room state is sent to everyone; it never contains unrevealed words,
  answer authors, or current Truth-or-Dare prompt text.
- Each player receives a private `you.game` view. The host receives `admin.game`,
  which contains control and submission counts but not unrevealed secrets.
- Admin authorization uses a passcode, an opaque in-memory bearer token stored in
  `sessionStorage`, and a token check on the Socket.IO handshake. URL passcodes
  are stripped and never accepted as login input.

## Content bank

English is the only v1 locale. The built-in content lives in
`server/games/content.js`:

| Collection | Entries |
| --- | --- |
| One of Us words | 30 |
| Who Is It questions | 30 |
| Who Am I people | 40 |
| Where Am I places | 40 |
| Who Wrote That prompts | 20 |
| Truth or Dare truths | 20 |
| Truth or Dare dares | 20 |
| Act It Out prompts | 40 |

`server/contentStore.js` loads these defaults at startup and overlays any saved
collections from `server/data/content.json`. If that file does not exist, the
defaults are used and the file is created on the first save.

The host console Content tab reads the collections from
`GET /api/admin/content`. Edits are kept in the browser until Save changes sends
`PUT /api/admin/content/:key`. The server normalizes and validates the whole
collection, then writes the file atomically. Reset collection restores that
collection's built-in entries. If the file cannot be written, the edit stays in
memory and the Content tab shows a disk save warning.

Content changes apply to future rounds and turns. A game that is already running
keeps the prompts it has already assigned. Set `CONTENT_FILE=:memory:` for tests
or previews that should not write a file. To add another locale, extend the
records and the `/api/games` locale field without changing the protocol.

## Deployment

See [DEPLOY.md](DEPLOY.md). The production backend is expected at
`https://familygame.wisp.uno` and the frontend at
`https://familygame.vercel.app`. Set the frontend origin in the backend's
`FRONTEND_ORIGINS` before testing.

## Notes and limits

- Restarting the backend clears all rooms, sessions, and scores. Saved content
  survives a restart when `server/data/content.json` is on persistent storage.
- Short invite links use `/g/CODE`. The legacy `/game?invitecode=CODE` path
  still works for older links.
- Unknown paths show the custom 404 page instead of the player app.
- The UI is dark-only. There is no theme switcher or per-device theme storage.
- Players reconnect automatically with a seat token. A host reload keeps the room
  while the backend process stays alive.
- `PLAN.md` is the original planning brief. It contains ideas that are now
  superseded by the implemented v1 rules in this README.
