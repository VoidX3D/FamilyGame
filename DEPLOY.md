# Deployment notes

The app has two independent pieces:

1. **Backend** : Express + Socket.IO, deployed to Wispbyte. It must stay running
   and allow WebSocket upgrades.
2. **Frontend** : static files in `web/`, deployed to Vercel.

Rooms are in memory, so use a single backend instance for v1. A restart or
redeploy clears live rooms.

## 1. Backend (Wispbyte)

Expected public URL: `https://familygame.wisp.uno`

Settings depend on how the panel is pointed at the repository:

- If the project root is the repository root:
  - Install: `npm --prefix server install`
  - Start: `npm --prefix server start`
- If the project root is `server/`:
  - Install: `npm install`
  - Start: `npm start`

Required environment variables:

```text
NODE_ENV=production
PORT=<port assigned by Wispbyte, if required>
ADMIN_PASSCODE=<strong private passcode, at least 12 characters>
FRONTEND_ORIGINS=https://funfamilygame.vercel.app
```

`FRONTEND_ORIGINS` must list the exact origin the frontend is served from.
A wrong value makes the browser block every request from the site: the page
loads but the host console cannot sign in, and the console shows
`Could not reach the game server`. The backend logs the refused origin:

```text
[cors] Refused https://wrong.example.com. Add it to FRONTEND_ORIGINS on the backend.
```

The list accepts a pattern, so a domain change does not break the deploy:

```text
FRONTEND_ORIGINS=https://funfamilygame.vercel.app,https://*.vercel.app
```

`TRUST_PROXY` sets how many proxies sit in front of the API. The default `1`
is correct for Wispbyte; use `false` if the API is exposed directly, so a
client cannot spoof its address and slip the IP rate limits.

Production startup fails if `ADMIN_PASSCODE` is missing or shorter than 12
characters. A development server can generate a temporary passcode when the
variable is omitted, but production never does.

Optional:

```text
ADMIN_LOGIN_ATTEMPTS=5
CONTENT_FILE=/path/on/a/persistent/volume/content.json
```

Saved content defaults to `server/data/content.json`. Keep that path on a
writable, persistent volume if host edits should survive restarts and redeploys.
Set `CONTENT_FILE=:memory:` to disable disk persistence.

After deployment, verify:

```bash
curl https://familygame.wisp.uno/healthz
# {"ok":true,...,"games":7}

curl https://familygame.wisp.uno/api/games
# {"ok":true,"locale":"en","games":[...]}
```

If the public hostname changes, update `API_URL` in `web/config.js` (the
production branch currently uses `https://familygame.wisp.uno`).

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

- [ ] `/healthz` reports `games: 7`
- [ ] `/api/games` returns all seven games
- [ ] Host passcode works; wrong passcode is rejected
- [ ] Room code and short `/g/CODE` invite link can be copied from the host console
- [ ] Three players can join from different devices or browser profiles
- [ ] Room lock rejects a new player
- [ ] One of Us roles are private and the reveal works
- [ ] Act It Out prompts are visible only to the actor
- [ ] Truth or Dare prompt text is visible only to the current player
- [ ] A player can refresh and resume their seat
- [ ] The host can end a game and the room returns to the lobby
- [ ] The Content tab loads eight collections, and a saved edit survives a restart
- [ ] An unknown path shows the custom 404 page

## Current deployment state

- The backend answers at `https://familygame.wisp.uno` and the frontend at
  `https://funfamilygame.vercel.app`.
- The backend's `FRONTEND_ORIGINS` must contain `https://funfamilygame.vercel.app`.
  If it still names an older domain, the browser blocks the site and the host
  console cannot sign in. Check the backend log for the refused origin.
- No secrets belong in git. `server/.env` and `server/data/content.json` are
  ignored; configure production secrets in the Wispbyte panel.
