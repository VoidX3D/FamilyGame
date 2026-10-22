# TODO

What still has to be done, with a priority.

| Priority | Meaning |
| --- | --- |
| **P0** | Blocks the launch. Do these first. |
| **P1** | Should be done. The fix exists but is not finished or not verified. |
| **P2** | Nice to have. Real, but the app works without it. |
| **P3** | When there is time. |

---

## P0 — blocks the launch

Nothing is in P0. Everything that was here has been done. See
[`PROGRESS.md`](PROGRESS.md) for what changed.

---

## P1 — should be done

The fix is written but is not finished, not verified, or not deployed.

| Item | State |
| --- | --- |
| **The host console must not go blind on a reconnect** | The room is looked up on every connect now. It still needs a real disconnect-and-reconnect test in Chrome, and a deploy. |
| **The drawing must survive a mid-turn phone reload** | The stroke ids carry a per-page prefix now. It still needs the reload tested on a real phone-sized viewport, and a deploy. |
| **The turn history must stay visible in Who Am I? and Where Am I?** | The redaction that hid it is gone. It still needs a play-through that checks the history mid-round. |
| **The seat token must stay out of IndexedDB** | The token lives in `localStorage` now and the remembered room record expires after a week. It needs the old IndexedDB entries cleared on the upgrade path, and a check that the token really is gone from IndexedDB. |
| **The whole session needs a deploy** | Everything above is written and the suites pass. None of it is live until the backend branch is published and the front end is rebuilt. |
| **The preview images need a script** | `preview/` is refreshed by hand from the shots the browser suite leaves in `.shots/`. A small script would copy the right ones across, so the pictures never fall behind the code. |

---

## P2 — nice to have

| Item | What is wrong |
| --- | --- |
| **The five new games have no browser test** | They have a play-through in the engine suite now, but the browser suites do not play them. The bugs this round were all in the client screens, so the browser suite is where they would have been caught. |
| **The host console still uses a native confirm** | Starting a game or a playlist puts a browser dialog on the screen. It works, but it does not look like the rest of the app. |
| **`web/pages.css` was minified** | It was minified into one rule per line, which is not the house style. It should be re-formatted to match the other stylesheets. Do not change what the rules do while re-formatting it. |
| **Draw It still has no ellipse tool** | The pen, the eraser, the fill, a line and a box are there. An ellipse would be the natural next one, and it is the same shape of change as the box: a tool the server knows, and a stroke the clients replay the same way. |
| **The guess list does not scroll to the newest entry** | The list is capped and it shows the oldest first, so the room has to scroll down to see the latest guess. Skribble keeps the newest in view. |
| **The host console has no way to change the turn length mid-game** | The length is picked in the setup phase and then it is what it is. `addTime` gives twenty seconds, which is not the same thing. |

---

## P3 — when there is time

### API contract tests for the new endpoints

The suites cover the socket protocol and the game engines well. The REST
side is covered only by `smoke:server` and `smoke:cors`.

Write a contract suite for the newer endpoints: the content endpoints
(`GET /api/admin/content`, `PUT /api/admin/content/:key`, the two reset
routes), the auth endpoints (`login`, `me`, `logout`), and the OpenAPI and
docs routes. It should assert the status codes, the error codes and the
shape of the response, and it should check that `/api/openapi.json` still
describes every route the server actually serves.

### A suite that checks the generated files are up to date

`npm run icons -- --check` and `npm run sitemap -- --check` both exist. They
are not run by `npm run smoke` yet, so a hand-edit to `web/icons.js` or
`web/sitemap.xml` would not be caught. The same goes for the Swagger UI
assets: the `swagger-ui-dist` version is pinned in `server/package.json` and
nothing checks that the version in the licence note matches.

---

Made by **VoidX3D (Sincere Bhattarai)**.
