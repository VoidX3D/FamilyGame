# PROGRESS

A running log of the work, newest first. One commit, one entry (or one
group of related entries). Entries are written for somebody who has never
seen the project, so they say what broke and what changed.

Read [`STATUS.md`](STATUS.md) for what is true right now, and
[`TODO.md`](TODO.md) for what is still open.

---

## 2026-10-22

### The five new games had no content at all

The content file had the five collections for the social games, but the
schema did not. The content store only loads the collections the schema
declares, so all five were silently thrown away and every round fell
back to the engine's placeholder: "Stay in or go out", "Rainbow", a
blank drawing, "Airport".

- The schema now declares all five: `wouldYouRatherQuestions`,
  `captionPrompts`, `emojiPuzzles`, `twoTruthsTopics` and
  `spyfallLocations`.
- The content is real now: 48 would-you-rather questions, 42 caption
  prompts, 35 emoji puzzles, 38 two-truths topics and 36 locations.
- The suite now checks that the schema and the content file agree, and
  that every game asks for a collection that is really there. This is
  how it slipped through: the old check walked the schema, so a
  collection missing from the schema was invisible to it.

### Emoji Guess never scored a point

The engine worked out who had solved it and what they were owed, and
then never handed the points over. Everybody finished with zero. The
first solver is worth three, the rest are worth one.

### Caption This never showed the result

The tallies were published in the list of captions, where the client
looks for a result, so the room saw the captions and never saw who
won. The engine publishes them properly now, and the screen shows the
author, the votes and the bonus.

### Emoji Guess never said what the emojis meant

The answer was computed and never published, so the end of the round
said "revealed" and nothing else.

### The reveals were half finished

One of Us never said who the imposter was. The engine has published the
name since the first version, and the reveal screen showed the word, the
category, the imposter's guess and the vote counts, and then stopped. The
room finished the game without ever finding out who the imposter was,
which is the one thing the reveal is for. Spyfall had the same problem
with the spy.

Would You Rather collected a reason from everybody and threw it away. The
split between the two sides was not shown either. The whole point of the
game is hearing why people chose.

Two Truths & One Lie could not really be played. The three statements
were published but never drawn, so a player had to pick which one was the
lie without being able to read any of them. The result was never shown
either. And the result is published under a different name than the
other games use, so the screen was looking in the wrong place.

### The new games had the wrong phase names on screen

They reuse phase names from the older games, so Emoji Guess said
"Guessing authors" and Two Truths & One Lie said "Writing answers".
Each game now has its own labels.

### The playlist looked broken

Adding games to the queue worked, but the screen kept saying "Add games
to build the queue" afterwards, because the render overwrote the message
the builder had just written. The queue looked empty and the Start
button looked dead, so the whole thing read as broken. The hint now
belongs to the builder, which is the only part that knows how many
games are queued.

---

## 2026-10-21

### One place for the addresses, and no more stale ports

`web/net.js` had its own copy of the API address, with `localhost:12800`
as a fallback, and `web/config.js` had another. Two copies of the same
thing, one of them a magic fallback, and the front end could quietly talk
to the wrong host.

- `web/endpoints.js` is now the one file that says where things are. It
  has no DOM in it, so the browser, the dev server, the test driver and
  the sitemap script all read the same numbers.
- `web/config.js` decides which one to use and exports it. It takes the
  address from `window.APP_CONFIG`, then from a `<meta name="api-url">`
  tag, and only then from the defaults.
- `web/net.js` imports the answer. It has no host or port in it at all.
- `server/config.js` defaulted to port **3000**, the port from before the
  hosting service moved. A fresh install from the example settings file
  would have started on the wrong port. The default and the example are
  12800 now, and the OpenAPI description builds its local address from
  the port the server is actually using.
- The dev server's content security policy, the browser driver's
  defaults and the sitemap script all follow the shared file.
- The backend keeps its own list of allowed frontends, because the
  `backend` branch is a split of `server/` alone and cannot reach
  `web/endpoints.js`. The CORS suite now checks the two lists agree, so
  they cannot drift apart silently.

### One way to spell a word, for every game

`Cactus`, `cactus`, `CACTUS` and `CaCtUs` all had to work, and they had
to work the same way in every game. The comparison lived in two places
and did not fold accents or read `&` as "and".

`normalizeAnswer()` in `server/games/common.js` is now the only
sanitiser. It takes out case, punctuation, spacing, the difference
between `&` and "and", and an accent on a Latin letter. It leaves
Devanagari alone on purpose: Devanagari writes its vowels as marks on the
letter, and folding those away turns one name into a different name. The
content has Nepali in it, so this matters.

Draw It uses the same function. The suite has a test that says so.

### The buttons say what they do

- The sound button is the speaker on its own. A plain speaker means sound
  is on, a crossed one means it is off. The words "Sound on" and "Sound
  off" are gone, and the button carries the label for a screen reader.
- The install button says **Install**, with a download icon.

### An emoji in a name is the player's own picture of themselves

If a name has an emoji in it, the round badge shows the emoji instead of
two initials. A flag, a family joined together and a thumb with a skin
tone are each one picture, not two characters.

### The agents' folder

`AGENTS.md` in the root is the open standard, and it stays exactly where
it is. The working memory moved from `agents/` to `.agents/`, because it
is for agents rather than for the product, and a hidden folder says so.

### The documentation page

The Swagger UI is dark, and now it is legible. Swagger draws its schema
section with the light theme's colours, so the model names were dark grey
on a grey card, which is unreadable on a dark page. Every part of that
section now has a colour from the app's own palette.

Two of the bugs were ours, not Swagger's:

- A decorative glow behind the header was a fixed overlay at z-index 0,
  which paints over any content that is not itself positioned. It turned
  every operation card a shade of light. It sits at z-index -1 now.
- The same filter that made the little chevrons visible was applied to
  the whole summary row, which inverted the dark card into a light one.

---

## 2026-10-21

### Draw It now works the way skribble.io works

The old Draw It gave every player one guess. A wrong guess was gone, the
player was locked out of the next one, and the room had no idea what had
already been tried. The drawer also had a "Done, reveal the word" button,
which meant the drawer could decide when the word became visible — the one
thing the drawer must never be able to do.

What it is now:

| Change | What it means |
| --- | --- |
| **The drawer cannot end the turn** | The `done` action is gone from the engine, the client and the view. The clock is the only thing that ends a turn. |
| **A player may guess as often as they like** | A wrong guess does not lock the player out. The input stays open and the next guess is one tap away. |
| **A shared running list of guesses** | Every guess appears on every screen, in order, with the name of the guesser. It is capped at 120 entries so it cannot grow without end. |
| **Close guesses show a hint** | A wrong guess of the same length as the word shows the letters that landed in the right place, with the rest hidden. The hint can never spell the word: a guess that matched every position would have been a correct guess, and a correct guess is not shown in the list. |
| **The word is revealed at the end, with who got it** | The reveal panel names the word and lists every player who found it, with their point. |
| **Undo and redo** | Undo takes the last stroke back. Redo puts it back, as a new stroke, so the whole room sees it again. |
| **Shape tools** | Line and box join the pen, the eraser and the fill. The server knows the tools, so a box looks like a box on every screen. |
| **Ten colours and five brush sizes** | Up from eight colours and four sizes, and the palette no longer had the same yellow twice. |
| **A custom colour picker** | Any colour at all, for the fussy. |
| **A bigger board** | The board has a button that expands it to a square, for when the drawing needs more room. |

The tools are real icons now: Lucide's, not characters that were typed into
the markup.

### The icon set is Lucide's, generated from real SVG files

`web/icons.js` was a hand-written object of inline SVG path strings. Several
of them were approximate and none of them carried a licence. The `♫` on the
sound button was a text character, not an icon at all.

The icons are now [Lucide](https://lucide.dev/) (ISC licensed), copied out of
the `lucide-static` package as `.svg` files into `web/assets/icons/` by
`npm run icons`, and `web/icons.js` is generated from those files. The file
carries a header saying so, so nobody hand-edits it.

- `npm run icons` rebuilds it. `npm run icons -- --check` fails if it is out
  of date.
- The sound button has a speaker icon that says whether sound is on or off,
  and the words are dropped on a narrow phone, where the button keeps its
  icon and its accessible name.

### The API address works on the front-end host

`https://funfamilygame.vercel.app/api/` gave Vercel's 404 page, because the
front end is served from Vercel and the API is not. The front end now
proxies `/api` to the backend through a rewrite in `web/vercel.json`, and
the backend has an `/api` index that lists what it offers, so the address
leads somewhere useful instead of nowhere.

### The Swagger UI is the real one, and it is dark

The documentation page was a hand-rolled page that looked like it. It is now
the real Swagger UI, served by the backend from the `swagger-ui-dist`
package, with a dark theme that matches the rest of the app. It is always
the documentation of the running service, because it is served by it.

### The route list is no longer a dead file

`web/manus-routes.json` was read by nothing. It is now the one list of the
site's pages: `npm run sitemap` builds `web/sitemap.xml` and `web/robots.txt`
from it, and fails if a route in the list has no page behind it.

### Smaller things

- The audio layer can no longer fail the page. A refused `resume()` was an
  unhandled promise rejection, which failed the browser suites. The drone
  also waits for a real gesture now instead of starting on the first
  keystroke, and stops when the page is hidden, so a phone in a pocket does
  not hum all evening.
- One of Us told the room "there was no decisive vote" when the vote had
  in fact been clear and simply pointed at the wrong person. It now says
  what happened, and names who the room voted for.
- The `theme-color` in the HTML was the old colour on three pages.
- The dev server did not know the `.webmanifest` type, so the install prompt
  never appeared in local development.
- The suites stopped asserting a fixed number of drawing tools, so the tool
  bar can grow.

---

## 2026-10-21

### The CI gate no longer blocks the backend from being published

The suite asserted that there were exactly eight games. The `sync-backend`
workflow runs `npm run smoke` **before** it publishes the `backend` branch,
so the moment a ninth game was added, the suite failed, the workflow stopped,
and the backend was never published at all. A bigger catalogue would have
taken the API offline.

The suites now check **invariants** instead of a number:

- the core games are present in the catalogue,
- no two games share an id,
- every game exports its seven functions (`create`, `action`, `adminAction`,
  `nextRound`, `publicView`, `playerView`, `adminView`),
- every game has a client screen in the `RENDERERS` map in `web/games.js`,
- every content collection is a non-empty list.

The browser suites compare the number of cards on the start screen with the
catalogue the API returns, instead of a hard-coded eight. Adding a game is
now a normal change that does not touch the suites.

### A missing content collection no longer takes the site down

A collection registered in the schema but missing from the content file
threw while the content store was loading. The throw happened at import
time, so the server never started and the whole site was down — one bad
entry in one JSON file took out every game, for every room, everywhere.

It now reports the collection and carries on. The affected game falls back
to its own built-in fallback entry (Draw It falls back to "Momos", for
example), so the room still plays.

### The content file survives being open somewhere else

The content write renames a temporary file into place, which is the safe way
to write a JSON file. On Windows that rename fails when the file is open
somewhere else — an editor, a backup tool, the hosting panel. The write now
falls back to a direct write when the rename fails, and reports which path it
took, so a failed save is visible in the host console instead of silently
losing the edit.

### The service worker no longer serves stale JavaScript

The service worker served the cached copy first, so after a deploy the first
load returned the **old** JavaScript next to the **new** HTML. The page came
up half old and half new, and a cache-busting query string does not help
when the worker intercepts the request and answers from the cache.

The cache is now a **fallback for when there is no network**, never the
first answer. `/admin`, `/api`, `/g/` and `/game` are never cached at all,
responses marked `no-store` are dropped from the cache, the shell installs
one file at a time instead of racing itself, and the worker's promises are
all inside `waitUntil` so they are not cut short.

### One port for the whole project: 12800

The hosting service requires the API on port 12800, but the port had crept
in two directions. The front-end config, the net helper, the test driver
and the dev server's CSP all pointed at 12800 now. Local development,
production and the test suites all talk to the same port, so there is one
place to change.

### The API documentation is the real Swagger UI

`/api/docs` was a hand-written page that described the API in prose. It is
now the actual Swagger UI, served by the backend from the `swagger-ui-dist`
package, reading the OpenAPI description at `/api/openapi.json`. It has a
dark theme that matches the app, so it does not look like a different
website pasted into the middle of one.

### The content schema moved out of the code into JSON

The shape of every content collection used to be a JavaScript array in
`server/contentStore.js`. Adding a collection meant editing code and
shipping a deploy.

The schema now lives in `server/data/content-schema.json`: the key, the
label, the game it belongs to, the kind of entry and the fields. A new
collection is a JSON entry. The content editor in the host console also
draws a large collection in pages now, instead of trying to render hundreds
of rows at once.

### The host console no longer goes blind after a reconnect

A socket can drop for reasons that have nothing to do with the server: a
phone changing networks, a laptop that slept, a redeploy. The host console
reconnected, but a flag stopped it from re-joining the room channel, so it
sat there with no state and no way to act — the worst possible moment, in
the middle of a game.

The room is now looked up on every connect, so the host console comes back
with the room and the game in it. The fix is written and needs its final
verification and a deploy.

### The drawing survives a mid-turn phone reload

The stroke ids restarted at `c1` on every page load. After a phone
reloaded in the middle of a turn, the new strokes reused ids the server had
already seen and were refused as duplicates, so the board froze halfway
through the drawing.

The ids now carry a per-page prefix, so a stroke from a new page load is
never mistaken for a repeat. The fix is written and needs its final
verification and a deploy.

### The turn history stays visible in Who Am I? and Where Am I?

The redaction helper, which hides answers that have not been revealed yet,
was also hiding answers that **had** already been revealed to the room. The
turn history in Who Am I? and Where Am I? went blank part-way through a
round. The redaction now only hides what is still secret.

### The seat token stays out of IndexedDB

The seat token was written to IndexedDB, which is persistent and survives
a browser data clear. It is now kept in `localStorage`, which the player
can clear from the browser settings.

The name and the last room are still remembered, so a player does not have
to type them again. The remembered room record now expires after a week
rather than living forever.

---

## 2026-10-20

### Draw It was added

The eighth game. One player draws a secret word while the room guesses it.

- The **server owns the clock**. It publishes a deadline with the game
  state and every client counts down from it, so a phone that sleeps can
  never end a turn by accident.
- The **strokes have their own channel**. The drawing is a stream, so it
  travels on `draw:stroke` and the game state only carries the stroke
  count. A full state push on every pointer move would flood the room.
- The word reaches **the drawer alone**. The drawer never sees the guesses,
  and the guesses never reach the drawer.
- The tools: a pen, an eraser and a fill, a colour palette, three brush
  sizes, undo and clear.

Draw It is the one game in the platform that runs on a clock, on purpose.

### One of Us is played, not typed

One of Us used to ask the crew to type their clues. Nobody reads typed
clues in a room; they get shouted over each other.

Now the clues are **spoken out loud**. The screen shows whose turn it is to
speak, and the next phone lights up when they are done. After two rounds of
hints the room **votes by itself**, without the host touching anything. The
imposter can still win by surviving the vote, or by guessing the word after
being caught.

### A room remembers what it has already used

The used-content memory was per game, so a game night played two rounds of
Who Is It? with the same questions.

The memory now lives on the room and is keyed by the collection, for the
whole session rather than for one game. The words, the questions, the
prompts and the people each keep their own history. The memory resets the
next time the room is created.

### The Who Is It question pool was rewritten

78 questions, meant to be funny rather than useful, and a good half of them
Nepali so the game works for the family it was built for. The old pool was
generic enough to be boring after one round.

### The leave button is a real button at the bottom of the screen

Leaving used to be a small control in the corner, close enough to the game
that somebody could hit it by accident mid-round. It is now a real button
at the bottom of the screen, well away from the game.

---

## 2026-10-19

### The audit was carried out and every finding was fixed

A full pass over the front end and the host console, and every finding was
closed rather than filed:

| Area | What was fixed |
| --- | --- |
| Icon buttons | The icon buttons had no accessible name and the wrong hit area. |
| Game view chrome | The header and the footer of a game screen were inconsistent between games. |
| Missing CSS classes | Rules referenced classes that no longer existed, so the layout fell apart in places. |
| The author select | The author dropdown in Who Wrote That?! did not show the authors it should. |
| The clues during the vote | The clues vanished during the vote, so the crew lost the thread. |
| The draft keys | Drafts were kept under a key that was reused between games, so old text came back. |
| The admin error codes | The host console showed the wrong error for a wrong passcode, a locked room and a full room. |
| The content errors | A bad content edit was reported as a crash rather than as a validation error. |
| The sign-out state | After signing out, the console still showed the last room in places. |
| The toast overflow | Toasts ran off the bottom of the screen on a phone. |
| The sticky nav | The sticky navigation in the host console overlapped the content underneath it. |
| The focus rings | Focus rings were removed in several places, which made the console hard to drive with a keyboard. |
| The in-flight guards | A double tap could send the same action twice. |
| The test coverage | The suites did not cover the paths that the audit found broken. |

---

Made by **VoidX3D (Sincere Bhattarai)**.
