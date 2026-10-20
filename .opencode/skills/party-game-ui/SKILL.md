---
name: Party Game UI
description: Use when building or reviewing player screens, lobby, private assignments, waiting states, reveals, results, or the admin console for the Family Game Hub.
---

# Party Game UI

The phone is the controller; the family is in the same room. Optimize for speed, clarity, and secrecy — not for scrolling or reading.

## Screen types

1. **Join** — code first, then name. Show a clear error for wrong code, full room, or game already started.
2. **Lobby** — room code, player chips, "waiting for host". Show connected count and who is offline.
3. **Private assignment** — "Only you" badge, tap-to-reveal, large text, no accidental shoulder-surfing.
4. **Action** — one task: type a clue, vote, submit an answer, guess.
5. **Waiting** — "3 of 7 submitted", names of who is still deciding, and the current phase. Never a lone spinner.
6. **Reveal/result** — one oversized answer or score, then detail, then the next action.
7. **Admin console** — dense roster, room code, game picker, Start/Force advance/End. Never show secrets.

## Layout rules

- `100dvh`, safe-area insets, sticky header, sticky bottom action bar.
- Content scrolls; the primary action does not.
- 16–20 px screen padding. 48 px minimum tap targets.
- Inputs must be 16 px font size to prevent iOS zoom.
- No hover-only affordances. No tiny close buttons.
- Test at 360×640, 390×844, and a 10-player roster.

## Privacy

- Private data lives only in memory on the player's device; never in the URL.
- Private screens use a distinct surface and say "Only you can see this".
- Pass-the-phone screens: large "I'm ready" button before revealing.
- Do not put another player's secret in a shared screen, even briefly.
- Admin console never receives secrets.

## Waiting and progress

Always answer: what is happening, who are we waiting for, and what can I do?

```html
<p class="status">Waiting for 2 players</p>
<p class="hint">Sita and Ram have not voted yet.</p>
```

Do not blame or shame slow players.

## Results

- Lead with the answer, not the table.
- Scoreboard rows: rank, name, points, delta. Highlight the current player.
- Ties are normal; show them cleanly.
- Primary action is admin-driven: "Next round" or "Back to lobby".

## Copy

- Short, warm, family-friendly. No technical jargon.
- Buttons are verbs: "Join room", "Submit clue", "Reveal my answer".
- Errors explain the fix: "That code doesn't match a room. Check the 5 characters and try again."
- English first; keep strings in `web/i18n/en.json` for later Nepali.

## Admin console

- Big room code and join URL.
- Player list with connected/offline state.
- Game cards show min players and whether they are locked.
- Start disabled with a reason: "Need at least 3 players" or "2 players are offline".
- During a game: phase, submitted count, Force advance, End game.
- No secrets, no debug dumps.
