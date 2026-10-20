---
name: Realtime Socket UI
description: Use when wiring the frontend to the Wispbyte Socket.IO backend. Covers server-authoritative snapshots, action acknowledgements, reconnect, private state, and 10-player rendering.
---

# Realtime Socket UI

The server owns the game. The client renders snapshots and sends intents. Never mirror game rules in the browser.

## Connection

- One Socket.IO client per tab.
- URL comes from `web/config.js` (`APP_CONFIG.API_URL`).
- Auth payload:
  - player: `{ role: "player", code, token }`
  - admin: `{ role: "admin", token }`
- Keep `transports: ["websocket", "polling"]` so Wispbyte/Cloudflare can fall back.
- Reconnection is automatic; do not recreate the socket manually.

```js
const socket = io(APP_CONFIG.API_URL, {
  transports: ["websocket", "polling"],
  auth: { role: "player", code, token },
});
```

## State contract

- `state` — full redacted snapshot. Render it; do not merge guesses.
- `state.public` — everyone sees this.
- `state.you` — only this player's secrets; may be `null` while waiting.
- `state.admin` — only the admin console receives it.
- `error` — `{ code, message }`; show inline, do not alert().
- `toast` — transient confirmation.

Never expect a delta protocol. Snapshots are small at 10 players and far less bug-prone.

## Actions

- Emit with an acknowledgement and a 5-second timeout.
- Disable the submitted control until the ack or timeout.
- On timeout, re-enable and show "Still trying…" — do not resubmit automatically.
- The server rejects duplicate actions; the UI should also disable.

```js
function send(event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error("timeout"));
      if (!res?.ok) return reject(new Error(res?.message ?? "failed"));
      resolve(res);
    });
  });
}
```

## Reconnect

- On `connect`, re-send the stored room code and token.
- Show a persistent banner: "Reconnecting…" / "Back online".
- Do not clear the screen or lose typed text during a drop.
- If the token is rejected, return to Join with the code prefilled.
- If the room no longer exists, explain that the server restarted and a new room is needed.

## Rendering

- Keep a single `store.state` and pure render functions per screen.
- Re-render the smallest section that changed.
- Preserve focus and input values across snapshots; do not rebuild a form while the player is typing.
- Use `textContent` for all player-authored strings. Never `innerHTML` with names, clues, answers, or prompts.
- Lists are capped at 10 players; no virtualization needed.

## Privacy

- Secret data is only in `state.you` and only in memory.
- Never write prompts, words, cards, or answers to `localStorage`.
- `localStorage` may hold only the player token and remembered room code.
- Do not log state snapshots to the console in production.

## Multi-tab and mobile

- Phone lock suspends the socket; reconnect and re-auth on resume.
- A second tab may take over the seat. If the server closes the old socket, show "Opened in another tab".
- Test with 10 tabs, airplane mode, refresh mid-round, and admin reconnect.
