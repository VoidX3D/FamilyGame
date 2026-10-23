# Deployment notes

The app has two independent pieces:

1. **Backend** : Express + Socket.IO, deployed to Wispbyte. It must stay running
   and allow WebSocket upgrades.
2. **Frontend** : static files in `web/`, deployed to Vercel.

Rooms are in memory, so use a single backend instance for v1. A restart or
redeploy clears live rooms.

## Updating the deployed server

`backend` is **generated**, not edited. The sync workflow takes the `server/`
folder from `main` and publishes it to `backend` as a single commit on top of
the previous one, so the branch only ever moves forward.

On the hosting machine, update it with:

```bash
npm run deploy:update
```

or by hand:

```bash
git fetch origin backend
git branch --force backend origin/backend
```

**Do not merge `backend` into another branch.** It is a subtree of `main`
with its own history, so Git cannot reconcile the two.

| If you want to… | Do this |
| --- | --- |
| Update the deployed server | `npm run deploy:update` |
| Update your working copy of `main` | `git checkout main && git pull --ff-only origin main` |
| See the server code without switching branch | `git show origin/backend:index.js` |

### When git says it cannot reconcile the branches

> `fatal: Need to specify how to reconcile divergent branches.`
> `fatal: refusing to merge unrelated histories.`
> `error: Your local changes to the following files would be overwritten by merge.`

None of these mean the repository is broken. The `backend` branch is
generated, so there is nothing to merge with it.

**The fix is one command:**

```bash
npm run deploy:update
```

It fetches the branch, sets aside anything that was edited on this
machine, and puts the local copy back in step with the server. On the
hosting machine, in the panel's terminal, the same thing by hand:

```bash
cd /path/to/the/repository
git fetch origin backend
git checkout backend
git reset --hard origin/backend
npm install
npm start
```

**This cannot happen again.** The `sync-backend` workflow publishes
`backend` as one commit on top of the last one, with no force push, and
every commit it has ever published stays in that history. So the branch
is a straight line, and any clone, however old, fast-forwards with a
plain `git pull`. There is no version of it that has to be reconciled.

To make that the default on a new machine:

```bash
git config --global pull.ff only
```

A pull then refuses a non-fast-forward with a clear message instead of
stopping halfway, and it never creates a merge commit behind your back.

**If the server did not update after a push, this is why.** The panel
pulls the branch; if the pull failed, the old code kept running. Check
the panel's log for the message above.

## 1. Backend (Wispbyte)

Expected public URL: `https://familygame.wisp.uno`

**No configuration is required.** The repository ships `server/.env`, the
server reads it itself, and the defaults already point at the deployed
frontend. The panel only needs to set a port, if it does not already.

Settings depend on how the panel is pointed at the repository:

- If the project root is the repository root:
  - Install: `npm --prefix server install`
  - Start: `npm --prefix server start`
- If the project root is `server/`:
  - Install: `npm install`
  - Start: `npm start`

The server reads `server/.env` no matter which of those is used, and a real
environment variable always wins over the file. `npm start` also passes
`--env-file-if-exists=.env`, so both paths are covered.

### What the defaults are

| Setting | Default | Notes |
| --- | --- | --- |
| `PORT` | `12800` | The panel's own port wins. |
| `FRONTEND_ORIGINS` | `http://localhost:5173, http://127.0.0.1:5173, https://funfamilygame.vercel.app` | The deployed frontend is included, so the site works out of the box. A pattern such as `https://*.vercel.app` survives a domain change. |
| `ADMIN_PASSCODE` | generated | See below. |
| `ADMIN_LOGIN_ATTEMPTS` | `10` per address in ten minutes | |
| `TRUST_PROXY` | `1` | Correct for one proxy. Use `false` if the API is exposed directly. |
| `CONTENT_FILE` | `server/data/content.json` | Use `:memory:` to keep edits in memory only. |
| `RATE_LIMIT_CHECK` / `_JOIN` / `_ACTION` | `60` / `30` / `180` per minute | |

### The host passcode

`server/.env` sets `ADMIN_PASSCODE`, and the server uses it as it is:

```text
[admin] passcode configured from ADMIN_PASSCODE
```

If `ADMIN_PASSCODE` is ever removed, the server makes a strong one (24
random characters), writes it to `server/data/admin-passcode`, which is not
committed, and prints it in the startup log. It stays the same after a
restart or a redeploy, so the host is not locked out. `npm run passcode`
prints whichever one is in use.

Note that this repository is public, so the passcode in `server/.env` is
readable by anyone. That is fine for a game that only your family uses, but
it is worth knowing.

The startup log says where the passcode came from:

```text
Family Game API listening on http://0.0.0.0:12800 (production)
Allowed frontend origins: http://localhost:5173, http://127.0.0.1:5173, https://funfamilygame.vercel.app
Content file: server/data/content.json
[admin] passcode configured from ADMIN_PASSCODE
```

### If the site loads but the host console cannot sign in

The browser blocks the request before the server sees it, and the console
shows:

```text
Cross-Origin Request Blocked: ... (Reason: CORS header 'Access-Control-Allow-Origin' missing)
```

The frontend's origin is not in `FRONTEND_ORIGINS`. The server logs the
refused origin, with the line to add:

```text
[cors] Refused https://wrong.example.com. Add it to FRONTEND_ORIGINS on the backend.
```

Production startup fails if `ADMIN_PASSCODE` is set but shorter than 12
characters.

After deployment, verify:

```bash
curl https://familygame.wisp.uno/healthz
# {"ok":true,...,"games":7}

curl -H "Origin: https://funfamilygame.vercel.app" \
  -D - -o /dev/null https://familygame.wisp.uno/api/games | grep -i access-control
# Access-Control-Allow-Origin: https://funfamilygame.vercel.app
```


## 2. Frontend (Vercel)

- Root directory: `web`
- Framework preset: Other
- Build command: none
- Output directory: `.`
- `web/vercel.json` rewrites the five admin routes, `/admin/live`,
  `/admin/settings`, `/game`, and `/g/:code`. Unknown paths fall through to
  `404.html`.
- The vendored Socket.IO, GSAP, and Lenis files are already in `web/vendor/`.
- Security headers include CSP, frame denial, nosniff, and a strict referrer
  policy. If the backend hostname changes, update `connect-src` in
  `web/vercel.json` as well as `web/config.js`.

After Vercel assigns the domain:

1. Set the backend's `FRONTEND_ORIGINS` to the exact origin
   `https://funfamilygame.vercel.app`. Add a custom domain too if used.
2. Redeploy/restart the backend so CORS and Socket.IO accept that origin.
3. Open the frontend, sign in at `/admin`, create a room, and join from at least
   three separate browser profiles.
4. Confirm the host sees players appear live (WebSocket working), start a game,
   and complete one round.

## 3. Smoke checklist in production

- [ ] `/healthz` reports `games: 13`
- [ ] `/api/games` returns all thirteen games
- [ ] Host passcode works; wrong passcode is rejected
- [ ] Room code and short `/g/CODE` invite link can be copied from the host console
- [ ] Three players can join from different devices or browser profiles
- [ ] Room lock rejects a new player
- [ ] One of Us roles are private and the reveal works
- [ ] Act It Out prompts are visible only to the actor
- [ ] Truth or Dare prompt text is visible only to the current player
- [ ] A player can refresh and resume their seat
- [ ] The host can end a game and the room returns to the lobby
- [ ] The Content tab loads fourteen collections, and a saved edit survives a restart
- [ ] An unknown path shows the custom 404 page

## Current deployment state

- The backend answers at `https://familygame.wisp.uno` and the frontend at
  `https://funfamilygame.vercel.app`.
- The backend's `FRONTEND_ORIGINS` must contain `https://funfamilygame.vercel.app`.
  If it still names an older domain, the browser blocks the site and the host
  console cannot sign in. Check the backend log for the refused origin.
- No secrets belong in git. `server/.env` and `server/data/content.json` are
  ignored; configure production secrets in the Wispbyte panel.
