# STATUS

The current state of Family Game Hub. Everything in this file is either
live right now or is an exact statement about the code in `main`.

Last reviewed: **2026-10-23**.

## Live

| Thing | URL |
| --- | --- |
| Front end (Vercel) | <https://funfamilygame.vercel.app> |
| Backend (Wispbyte) | <https://familygame.wisp.uno> |
| API documentation | <https://familygame.wisp.uno/api/docs> |
| OpenAPI description | <https://familygame.wisp.uno/api/openapi.json> |
| Health check | <https://familygame.wisp.uno/healthz> |

| Port | What |
| --- | --- |
| **12800** | The API. This is the port the hosting service requires, and it is the only API port in the project. |
| 5173 | The front-end dev server (`npm run dev:web`). Not a deployment port. |

## What is deployed

| Piece | Where it lives | How it is published |
| --- | --- | --- |
| Front end | `web/` in `main` | Vercel builds `main` and serves it as static files. |
| Backend | `server/` in `main` | The `sync-backend` workflow publishes a subtree split of `server/` to the generated `backend` branch; the hosting panel pulls that branch and runs the API. |
| Content bank | `server/data/games/*.json` | One built-in bundle per game. Saved edits go to `server/data/content.json` on the host; the old monolith is read-only compatibility data. |
| API docs | `server/docsPage.js` + `swagger-ui-dist` | Served by the backend at `/api/docs`. |

The `backend` branch is **generated**. It is an output of the workflow, not
a branch to work on. See `AGENTS.md` §4.

## The games

Thirteen games are in the catalogue. The id is the key used in the API, in
`server/games/index.js` and in the `RENDERERS` map in `web/games.js`.

| Id | Name | Players | Rounds | Points |
| --- | --- | --- | --- | --- |
| `one-of-us` | One of Us | 3 to 10 | 3 | Crew 1 each, imposter 2. |
| `draw-it` | Draw It | 3 to 10 | One turn each | Each correct guess 1, the drawer 1. |
| `who-is-it` | Who Is It? | 3 to 10 | 3 | Most-voted player(s) 1 each. |
| `who-am-i` | Who Am I? | 3 to 10 | 3 | Exact person guess 1. |
| `where-am-i` | Where Am I? | 3 to 10 | 3 | Exact place guess 1. |
| `act-it-out` | Act It Out | 3 to 10 | One turn each | Actor and correct guesser 1 each. |
| `truth-or-dare` | Truth or Dare | 3 to 10 | 2 cycles | No points. |
| `who-wrote-that` | Who Wrote That?! | 3 to 10 | 3 | Each correct author match 1. |
| `caption-this` | Caption This | 3 to 10 | 3 | Captions earn votes plus a crowd-favorite bonus. |
| `emoji-guess` | Emoji Guess | 3 to 10 | 5 | First correct guess 3, later correct guesses 1. |
| `spyfall` | Spyfall | 3 to 10 | 3 | Agents and spy score from the room vote. |
| `would-you-rather` | Would You Rather? | 3 to 10 | 5 | Players on the majority side score 1. |
| `two-truths-one-lie` | Two Truths & One Lie | 3 to 10 | 3 | Correct guesses score; the storyteller scores for fooled players. |

**Draw It is the only game with a clock.** Everything else advances when the
required players have done their part, or when the host uses a control.

## The content bank

Fourteen collections, split across thirteen game bundles in
`server/data/games/*.json`, with their shapes in `server/data/content-schema.json`.

| Collection | Game | Entries |
| --- | --- | --- |
| `oneOfUsWords` | One of Us | 30 |
| `whoIsItQuestions` | Who Is It? | 78 |
| `people` | Who Am I? | 40 |
| `places` | Where Am I? | 40 |
| `whoWrotePrompts` | Who Wrote That?! | 20 |
| `truths` | Truth or Dare | 20 |
| `dares` | Truth or Dare | 20 |
| `charades` | Act It Out | 40 |
| `drawingWords` | Draw It | 80 |
| `emojiPuzzles` | Emoji Guess | 35 |
| `captionPrompts` | Caption This | 42 |
| `spyfallLocations` | Spyfall | 36 |
| `wouldYouRatherQuestions` | Would You Rather? | 48 |
| `twoTruthsTopics` | Two Truths & One Lie | 38 |

A room remembers the content it has already used, for the whole session, so
a game night never brings the same question back.

## The HTTP API

| Route | What |
| --- | --- |
| `GET /healthz` | Version, uptime, open rooms and players, content status, allowed frontends, memory. Public on purpose. |
| `GET /api/games` | The game catalogue. |
| `GET /api/rooms` | The open rooms. |
| `GET /api` | The API index: what this service offers and where to find it. |
| `GET /api/openapi.json` | The machine-readable API description. |
| `GET /api/docs` | Swagger UI. |
| `POST /api/admin/login` | Exchange the passcode for a bearer token. |
| `GET /api/admin/me` | Check the token. |
| `POST /api/admin/logout` | Drop the token. |
| `GET /api/admin/content` | The content collections. |
| `PUT /api/admin/content/:key` | Replace one collection. |
| `POST /api/admin/content/:key/reset` | Restore one collection to its built-in entries. |
| `POST /api/admin/content/reset` | Restore every collection. |

Everything that happens **during** a game is a Socket.IO event, not a REST
route: the room lifecycle, the player actions, the host controls and the
drawing strokes. The full list is at the bottom of `/api/docs`.

## The state of the work

| Area | State |
| --- | --- |
| The thirteen games | Playing. Every one has a server engine, a player screen and a play-through in the suites. |
| The five social games | Submission, waiting, reveal, scoring, and content-schema contracts are covered by focused engine regressions and Chrome smoke suites. |
| The host console | Working. The authenticated room is restored when the host reconnects or opens a new tab; the server and browser suites cover the path. |
| The front end | Working as a PWA, installed and offline-capable. |
| The API and its docs | Live, documented, and covered by the suites. |
| The content editor | Working, with the schema now in JSON and a big collection drawn in pages. |
| The future architecture | Per-game JSON is live. Database migration and page-first design are documented but intentionally deferred. |
| Draw It | Reworked to match skribble.io: many guesses per player, a shared list of guesses, the word revealed at the end with who got it, and no way for the drawer to end the turn. |
| The icons | Lucide's, as real SVG files, generated by `npm run icons`. |
| The addresses | One file, `web/endpoints.js`. Nothing else writes down a host or a port. |
| The API docs | The real Swagger UI, dark, and legible in every part of it. |
| The front-end `/api` path | Proxied to the backend, so `https://funfamilygame.vercel.app/api/` works. |

The open work, with priorities, is in [`TODO.md`](TODO.md). The history is in
[`PROGRESS.md`](PROGRESS.md). The reasons behind the current shape are in
[`DECISIONS.md`](DECISIONS.md).

---

Made by **VoidX3D (Sincere Bhattarai)**.
