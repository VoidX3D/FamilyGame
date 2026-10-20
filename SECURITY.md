# Security Policy

## Supported versions

The project is a single small server and a static front end. There is only
one version, and it is the one on `main`.

| Version | Supported |
| --- | --- |
| `main` | Yes |

## Reporting a problem

If you find something that looks like a security problem, please **do not
open a public issue**. Send it privately instead.

- GitHub: use **Security → Report a vulnerability** on
  <https://github.com/VoidX3D/FamilyGame>
- Or email the maintainer through the address on their profile.

Include what you did, what you expected, and what happened. A room code and
a passcode are enough to reproduce most of it, and they are yours to share.

You will get an acknowledgement within a few days, and a fix or an
explanation of why it is not a problem.

## What the service holds

Very little, by design. It is worth knowing what you are protecting when
you report something.

| Thing | Where it lives | For how long |
| --- | --- | --- |
| A room, its players and its scores | The memory of the server | Until the room is emptied or goes idle for 30 minutes |
| A player's seat token | Their own browser, `localStorage` | Until they leave |
| The host session token | The host's browser, `sessionStorage` | 12 hours |
| The content bank | A JSON file on the machine running the server | Until it is reset |
| The host passcode | Never stored. Compared and forgotten | — |

There are no accounts, no email addresses, no analytics and no third party
requests from the game.

## How the service is protected

- The host passcode is compared with a constant time comparison and is never
  written down anywhere.
- A failed passcode does not reveal whether the room exists.
- Sign-in attempts are limited per address, and joining is limited per
  address and per connection.
- The server is the only authority on what a player may see. The browser is
  never trusted with a secret.
- The WebSocket handshake refuses an origin that is not in the allowlist.
- The content file is written atomically, so a crash cannot leave it half
  written.

## Running your own

If you do not want to trust a shared server, run your own. The readme has
the steps. A self hosted copy never talks to anyone else.

---

Made by **VoidX3D (Sincere Bhattarai)**.
