# The Family Game Hub front end

The player pages and the host console. No build step, no framework: the
browser loads the ES modules directly. Made by **VoidX3D (Sincere Bhattarai)**.

## What is in here

| File | What it does |
| --- | --- |
| `index.html` | The player shell: the room code, the name, the lobby and the game. |
| `admin.html` | The host console: the room, the playlist, the live game, the content editor and the settings. |
| `app.js` | The player's connection, the seat, the reconnection and the screen flow. |
| `games.js` | Every game screen, including the drawing board. |
| `admin.js` | The host console. |
| `net.js` | The socket and the fetch wrapper. |
| `dom.js` | Small helpers shared by the player app and the game screens. |
| `icons.js` | The inline SVG icons. |
| `styles.css` | The shared dark theme. |
| `admin.css` | The host console layout. |
| `pages.css` | The static pages: privacy and terms. |
| `about.html` | The product story and hosting guide. |
| `manifest.webmanifest` | Install metadata for phones, tablets, and desktops. |
| `service-worker.js` | Offline app-shell caching; live room traffic is never cached. |
| `config.js` | Which API the page talks to. |
| `vercel.json` | The rewrites and the security headers. |
| `vendor/` | The vendored GSAP, Lenis and Socket.IO browser builds. |

## Running it

The front end is static. `npm run dev:web` serves this folder on
<http://localhost:5173> and rewrites the routes the same way the hosting
does.

```bash
npm run dev:web
```

| Page | What it is |
| --- | --- |
| `/` | A player. |
| `/g/CODE` | A player, with the room code already filled in. |
| `/admin` | The host console. |
| `/admin/room` | The room. |
| `/admin/playlist` | The game night queue. |
| `/admin/session` | The live game. |
| `/admin/content` | The content editor. |
| `/admin/config` | The settings. |
| `/privacy.html` | The privacy policy. |
| `/terms.html` | The terms. |
| `/about` | What the hub is, how it works, and how to host it. |

The player remembers the last display name, active seat, and most recent room
code in the browser's local storage. It can be installed as a progressive web
app where the browser supports installation. The service worker caches only
the static shell; room state and Socket.IO traffic remain live and are never
stored by the offline cache.

## How the screens are built

`renderGameScreen` in `games.js` renders a game from the state the server
sent. Every game screen is a function that takes the same four things:

```js
function myGame(state, game, mine, actions) {
  // state: the whole room
  // game:  the public view of the game
  // mine:  the private view of this player
  // actions: send, toast, and the drawing board
  return [/* the nodes to show */];
}
```

Two things worth knowing:

- **The DOM is only replaced when the result changed.** A broadcast from
  another player cannot wipe the text you are typing or take the focus
  from your input. The check is in `paint()`.
- **The canvas is one node that is moved around, never rebuilt.** It is
  the only piece of screen that cannot be re-rendered from a snapshot.

## The drawing board

Draw It is the one game that is not made of text, so it needs a little
more:

- The strokes go out on their own socket event, not in the game state.
  They are a stream, and pushing the whole state on every pointer move
  would not scale to eight phones.
- The canvas is sized to the layout and to the device pixel ratio.
- The tools are a pen, an eraser and a fill, an eight colour palette and
  four brush sizes. The fill is done on the client and replayed with the
  other strokes, so every phone ends up with the same picture.

## The theme

The colours live in the `:root` block at the top of `styles.css`. It is a
dark theme and it is meant to stay that way. The host console adds its own
layer in `admin.css`.

## Tests

From the parent folder, with the server running:

```bash
npm run smoke:ui        # the shell: join, lobby, admin, routes, layout
npm run smoke:game-ui   # a whole One of Us game in a browser
npm run smoke:ui-all    # every game, end to end
```

Screenshots land in `.shots/`, which is not committed. The ones worth
showing are copied into `../preview/`.
