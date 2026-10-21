# The Family Game Hub server

The API, the room store and the game engines. Made by **VoidX3D (Sincere
Bhattarai)**.

This folder is also published on its own, as the `backend` branch, so the
hosting panel can run the API without the front end. See
[../DEPLOY.md](../DEPLOY.md).

## What is in here

| File | What it does |
| --- | --- |
| `index.js` | The HTTP API: the service check, the game catalogue, the content routes and the API documentation. |
| `config.js` | Every setting: the port, the CORS allowlist, the host passcode and the rate limits. It reads `.env` itself. |
| `protocol.js` | The Socket.IO layer: the room lifecycle, the state broadcasts, the player actions, the host controls and the drawing board. |
| `rooms.js` | The rooms themselves, in memory: the players, the scores, the history and the playlist. |
| `contentStore.js` | The content bank: the built-in lists, the host edits, the validation and the file on disk. |
| `auth.js` | The host passcode and the session tokens. |
| `rateLimit.js` | A small fixed window limiter. |
| `util.js` | Room codes, tokens, name cleaning and the constant time comparison. |
| `openapi.js` | The OpenAPI description of the service. |
| `docsPage.js` | The dark API documentation page. |
| `games/` | One file per game. |

## Running it

```bash
npm install
npm start          # or: npm run dev, which watches for changes
```

The API listens on `http://localhost:12800`, the same port the hosting
service uses.

```bash
curl http://localhost:12800/healthz
curl http://localhost:12800/api/games
open http://localhost:12800/api/docs
```

## Writing a game

A game is one file in `games/`. It exports the same seven things every
time, so the platform does not need to know what the game is:

```js
export const meta = {
  id: "my-game",
  name: "My Game",
  tagline: "What it is, in one line.",
  minPlayers: 3,
  maxPlayers: 10,
  maxRounds: 3,
  hasScore: true,
};

export function create(room) {}        // the starting state
export function publicView(game) {}    // what everyone may see
export function playerView(game, id) {} // what one player may see
export function adminView(game) {}     // what the host may see
export function action(room, game, id, payload) {}
export function adminAction(room, game, type) {}
export function nextRound(room, game) {}
```

Two rules that are not negotiable:

1. **A secret never leaves the server.** If it is in `publicView`, or in
   another player's `playerView`, the game is broken.
2. **The client is never asked to decide.** A guess is checked by the
   engine, not by the browser.

`common.js` has the helpers: `gameState`, `publicBase`, `award`,
`pickUnused`, `roomMemory`, `shuffle` and the rest.

### The room remembers

`roomMemory(room, "collectionKey")` returns the ids a room has already
used for that collection. The list is kept for the whole session, not just
for one game, so a game night never brings the same question back.

### The clock

Only Draw It uses one. The engine puts a deadline in the game state and the
protocol's clock tick ends the turn when it passes. A client that misses an
event never decides that time is up.

## Tests

The whole suite is in the parent folder:

```bash
npm run smoke          # the server suites
npm run smoke:engines  # every game engine, driven to the end
npm run smoke:games    # every game over a real socket
```
