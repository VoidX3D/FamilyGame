# `agents/`

The shared memory of this repository.

This folder is for **any agent working on Family Game Hub**, and for the
people who work with those agents. It is not a diary and it is not a plan
that a machine regenerates. It is the part of the project that would
otherwise live only in somebody's head: what is true right now, what has
already been done, what is still open, and why the project is built the way
it is.

## The files

| File | What it is for | Read it when |
| --- | --- | --- |
| [`STATUS.md`](STATUS.md) | The current state of the project: the live URLs, the games, what is deployed. | You need to know what exists right now. |
| [`PROGRESS.md`](PROGRESS.md) | A running log of the work that has been done, newest first, with dates. | You want to know how we got here, or whether something has already been tried. |
| [`TODO.md`](TODO.md) | What still has to be done, with priorities. | You are about to pick something up. |
| [`DECISIONS.md`](DECISIONS.md) | The decisions that were made, and why. | You are about to change something and want to know whether the current shape was a deliberate choice. |

## How to read it

Start with **`STATUS.md`** — it is the shortest file and it tells you what is
real today. Then read **`PROGRESS.md`** for the recent history, so you do not
repeat work that has already been done or undo a fix that is still in
flight.

Read `TODO.md` before you start, and `DECISIONS.md` before you change
anything that looks strange. Most of the "odd" choices in this codebase —
no timers, a generated branch, no bundler — are recorded there with the
reason, and re-litigating them wastes a session.

`AGENTS.md` in the repository root is the companion to this folder: it holds
the rules of the house (the server is the only authority, the dark theme
stays dark, do not rewrite `web/admin.js` wholesale) and the practical
instructions for running, testing and extending the project.

## The rule that matters

**This folder is updated in the same commit as the change it describes.**

Not the commit after. Not "I'll write it at the end of the week". The same
one. A commit that changes how the project behaves and does not touch
`agents/` is an incomplete commit.

Concretely:

| If you change | Then in the same commit |
| --- | --- |
| Anything in `server/` or `web/` | Add a dated entry to `PROGRESS.md`. |
| A game, a URL, a port or a deployment | Update `STATUS.md`. |
| The work you finished | Remove it from `TODO.md`, or move it to a lower priority with a note about why. |
| The shape of the project | Add a decision to `DECISIONS.md`, with the reason. |

Entries are written for somebody who has never seen the project. "Fixed the
reconnect bug" is not an entry. "The host console went blind after a socket
reconnect, because a flag stopped it re-joining the room channel; the room
is now looked up on every connect" is an entry.

## House style for these files

- Plain Markdown. Tables where a table is clearer than a list.
- No dates in the future, no "TODO: fill this in", no lorem ipsum.
- Entries are written in the past tense once they are done, and in the
  present tense while they are still open.
- Keep the files short. If a file grows past a few screens, the detail
  belongs in the code or in a comment, and the file should keep a summary.

---

Made by **VoidX3D (Sincere Bhattarai)**.
