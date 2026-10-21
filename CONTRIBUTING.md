# Contributing

Thanks for helping. This is a small project, so the bar is simple: keep it
working, keep it private, and keep it kind.

## Getting set up

```bash
git clone https://github.com/VoidX3D/FamilyGame.git
cd FamilyGame
npm install
npm --prefix server install
cp server/.env.example server/.env
```

Set `ADMIN_PASSCODE` in `server/.env` to something you will remember, then:

```bash
npm run dev:server   # the API on http://localhost:12800
npm run dev:web      # the front end on http://localhost:5173
```

Open <http://localhost:5173/> for a player and
<http://localhost:5173/admin> for the host.

## Before you open a pull request

```bash
npm run smoke          # the server suites
npm run smoke:ui       # the browser suites, with the two dev servers running
npm run smoke:game-ui
npm run smoke:ui-all
```

All four should pass. The browser suites need Chrome. If a suite fails and
you cannot see why, run it on its own with `npm run smoke:games` and read
the message; they are written to say what went wrong.

## How the code is arranged

```
server/          the API, the room store and the game engines
  games/         one file per game, each behind the same interface
web/             the player and host pages, no build step
scripts/         the test suites
```

Two rules matter more than the rest:

1. **The server is the only authority.** A secret never enters another
   player's payload, and the browser is never asked to decide whether a
   guess is right.
2. **A game is one file.** It exports `create`, `publicView`,
   `playerView`, `adminView`, `action`, `adminAction` and `nextRound`. If
   you are writing a new game, copy the shape of an existing one rather
   than inventing a new one.

## Style

- Plain JavaScript, no framework, no build step. The front end is ES
  modules that the browser loads directly.
- Comments explain **why**, not what. The code already says what.
- Every source file carries the header
  `/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */`. Please
  keep it.
- Keep the dark theme. The colours live in the `:root` block at the top of
  `web/styles.css`.

## Content changes

The words, questions, people and places live in
`server/data/default-content.json`. A pull request that adds or rewords
content is very welcome. Please keep it:

- family friendly, and suitable for children,
- funny rather than useful,
- free of anything that is hateful or sexual.

The host console can also edit the content at runtime, and the server
remembers what a room has already used so questions do not repeat.

## Branches

- `main` is the source of truth.
- `backend` is **generated**. Never commit to it and never merge it into
  another branch. See `DEPLOY.md`.

## Reporting problems

Bugs go in the issue tracker. Security problems do not: see
[SECURITY.md](SECURITY.md).

---

Made by **VoidX3D (Sincere Bhattarai)**.
