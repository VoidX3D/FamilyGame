/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* Player-side game screens. Every screen is rendered from server state:
 * no secret ever lives in this file, and no timer is started here. */

import { avatar, initials, toneClass } from "./dom.js";
import { icon } from "./icons.js";

const drafts = new Map();

const PHASE_LABELS = {
  reveal: "Reveal your role",
  hints: "Clue round",
  vote: "Voting",
  "imposter-guess": "The imposter guesses",
  guess: "Guessing",
  act: "Acting",
  results: "Results",
  complete: "Final results",
  writing: "Writing answers",
  guessing: "Guessing authors",
  voting: "Voting",
  explain: "Say why",
  collect: "Write your prompts",
  play: "Turns",
  between: "Between games",
};

/* Games that reuse a phase name with a different meaning. In Who Am I? and
 * Where Am I? the "reveal" phase means the answer is being shown, not that a
 * role is being revealed. The social games reuse "reveal", "vote",
 * "writing" and "guessing" for their own meanings. */
const PHASE_LABEL_OVERRIDES = {
  "who-am-i": { reveal: "The answer" },
  "where-am-i": { reveal: "The answer" },
  "emoji-guess": { guessing: "Guessing the emoji" },
  "caption-this": { writing: "Writing captions", voting: "Voting" },
  "two-truths-one-lie": { writing: "Writing statements", guessing: "Finding the lie" },
  "would-you-rather": { vote: "Choose a side", explain: "Say why" },
  spyfall: { reveal: "Your role", vote: "Who is the spy?" },
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function add(parent, ...children) {
  for (const child of children) {
    if (child) parent.append(child);
  }
  return parent;
}

function button(label, className, onClick) {
  const node = el("button", className ?? "btn btn-primary", label);
  node.type = "button";
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

function block(...children) {
  const node = el("section", "game-block");
  return add(node, ...children);
}

function blockTitle(text) {
  return el("h3", "block-title", text);
}

function note(text, tone = "") {
  const node = el("p", "game-note");
  if (tone) node.dataset.tone = tone;
  node.textContent = text;
  return node;
}

function errorSlot() {
  const node = note("");
  node.dataset.tone = "error";
  node.hidden = true;
  return node;
}

function showInlineError(node, message) {
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
}

function waiting(text) {
  return el("p", "game-wait", text);
}

function youBadge() {
  return el("span", "you-badge", "You");
}

function pill(text, className = "pill") {
  return el("span", className, text);
}

/* Drafts are scoped to this specific run of the game. `startedAt` changes on
 * every replay, so a restarted game never pre-fills the previous run's text. */
function keyOf(game, field) {
  return `${game.id}|${game.startedAt ?? 0}|${game.round}|${game.phase}|${field}`;
}

function bindInput(node, key) {
  node.dataset.field = key;
  const saved = drafts.get(key);
  if (saved !== undefined) node.value = saved;
  node.addEventListener("input", () => {
    if (node.value) drafts.set(key, node.value);
    else drafts.delete(key);
  });
  return node;
}

function bindSelect(node, key) {
  node.dataset.field = key;
  const saved = drafts.get(key);
  if (saved !== undefined) node.value = saved;
  node.addEventListener("change", () => {
    if (node.value) drafts.set(key, node.value);
    else drafts.delete(key);
  });
  return node;
}

/* Removes a draft once its content has been accepted by the server. */
function clearDraft(key) {
  drafts.delete(key);
}

/* Drops drafts that can no longer be reached, so a long game night does not
 * keep growing the map. */
function pruneDrafts(game) {
  const prefix = `${game.id}|${game.startedAt ?? 0}|`;
  for (const key of drafts.keys()) {
    if (!key.startsWith(prefix)) drafts.delete(key);
  }
}

function textInput(placeholder, key, options = {}) {
  const input = el("input", "field-input");
  input.type = options.type ?? "text";
  if (options.inputMode) input.inputMode = options.inputMode;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.min) input.min = options.min;
  if (options.max) input.max = options.max;
  input.placeholder = placeholder;
  input.autocomplete = options.autocomplete ?? "off";
  input.setAttribute("aria-label", placeholder);
  if (options.spellcheck === false) input.spellcheck = false;
  return bindInput(input, key);
}

function textarea(placeholder, key, maxLength = 180) {
  const node = el("textarea", "field-input field-textarea");
  node.rows = 3;
  node.maxLength = maxLength;
  node.placeholder = placeholder;
  node.setAttribute("aria-label", placeholder);
  return bindInput(node, key);
}

function captureFocus(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active) || !active.dataset?.field) return null;
  return {
    field: active.dataset.field,
    start: active.selectionStart,
    end: active.selectionEnd,
  };
}

function restoreFocus(root, focus) {
  if (!focus?.field) return;
  const selector = `[data-field="${CSS.escape(focus.field)}"]`;
  const node = root.querySelector(selector);
  if (!node) return;
  node.focus();
  if (typeof focus.start === "number" && node.setSelectionRange) {
    try {
      node.setSelectionRange(focus.start, focus.end);
    } catch {
      // Inputs like number do not support selection ranges.
    }
  }
}

function actOn(node, actions, payload, fallback) {
  return () => {
    node.disabled = true;
    Promise.resolve(actions.send(payload))
      .then(() => {
        node.disabled = false;
      })
      .catch((error) => {
        node.disabled = false;
        actions.toast(error?.message || fallback || "That action did not work.");
      });
  };
}

/* Shared submit flow for every text form in the game screens.
 * `read` returns the action payload, or null when the input is not valid. */
function formSubmit({ button: btn, actions, read, fallback, errorNode, onSuccess }) {
  btn.addEventListener("click", () => {
    const payload = read();
    if (!payload) {
      actions.toast(fallback ?? "Fill that in first.");
      if (errorNode) showInlineError(errorNode, fallback ?? "Fill that in first.");
      return;
    }

    if (errorNode) errorNode.hidden = true;
    btn.disabled = true;

    Promise.resolve(actions.send(payload))
      .then((result) => {
        btn.disabled = false;
        onSuccess?.(result);
      })
      .catch((error) => {
        btn.disabled = false;
        const message = error?.message || fallback || "That did not go through.";
        actions.toast(message);
        if (errorNode) showInlineError(errorNode, message);
      });
  });

  return btn;
}

function phaseLabel(game) {
  if (game.phase === "guess") {
    if (game.contentType === "place") return "Place clues";
    if (game.contentType === "person") return "Person clues";
  }
  const override = PHASE_LABEL_OVERRIDES[game.id]?.[game.phase];
  return override ?? PHASE_LABELS[game.phase] ?? "In progress";
}

function gameHeader(state, game) {
  const head = el("header", "game-head");
  head.append(el("p", "eyebrow", `Room ${state.public.code}`));
  head.append(el("h2", "game-title", game.name));
  const meta = el("div", "game-meta-row");

  if (game.oneTurnEach) {
    meta.append(pill(`Turn ${game.turnNumber} of ${game.totalTurns}`));
  } else if (game.endless) {
    meta.append(pill(`Pass ${game.pass ?? 1}`));
  } else if (game.maxRounds > 0) {
    meta.append(pill(`Round ${game.round} of ${game.maxRounds}`));
  }

  meta.append(pill(phaseLabel(game), "pill pill-accent"));

  if (game.hasScore) {
    const mine = state.public.scores?.[state.you?.playerId] ?? 0;
    meta.append(pill(`Game: ${mine}`, "pill"));
    if (state.public.playlist) {
      const session = state.public.sessionScores?.[state.you?.playerId] ?? 0;
      meta.append(pill(`Session: ${session}`, "pill pill-session"));
    }
  }

  head.append(meta);
  return head;
}

function progressBar(completed, total) {
  const wrap = el("div", "progress-track");
  const fill = el("div", "progress-fill");
  fill.style.width = `${total ? Math.round((completed / total) * 100) : 0}%`;
  wrap.append(fill);
  return wrap;
}

/* One score list, used for the current game and for the running total. */
function scoreList(rows, state, { showSession = false } = {}) {
  const list = el("ul", "score-list");
  rows.forEach((row, index) => {
    const item = el("li", "score-row");
    if (row.inGame === false) item.classList.add("is-spectator");

    item.append(el("span", "score-rank", String(index + 1)));
    item.append(avatar(row.name, row.id));
    item.append(el("span", "player-name", row.name));
    if (row.id === state.you?.playerId) item.append(youBadge());
    if (row.inGame === false) item.append(pill("Sat out", "pill"));
    item.append(el("span", "score-points", String(row.points)));
    if (showSession) {
      item.append(el("span", "session-points", `${row.session} session`));
    }
    list.append(item);
  });
  return list;
}

function scoreboard(state, game, title = "Scores") {
  if (!game.hasScore) return null;
  const playlistMode = Boolean(state.public.playlist);
  const allPlayers = state.public.players ?? game.players ?? [];
  const players = playlistMode ? allPlayers : game.players ?? allPlayers;

  const rows = players
    .map((player) => {
      const inGame = (game.players ?? []).some((entry) => entry.id === player.id);
      return {
        ...player,
        inGame,
        points: state.public.scores?.[player.id] ?? 0,
        session: state.public.sessionScores?.[player.id] ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.session - a.session ||
        a.name.localeCompare(b.name),
    );

  return block(blockTitle(title), scoreList(rows, state, { showSession: playlistMode }));
}

function sessionScoreboard(state, title = "Game night totals") {
  const players = state.public.players ?? [];
  if (players.length === 0) return null;

  const rows = players
    .map((player) => ({
      ...player,
      inGame: true,
      points: state.public.sessionScores?.[player.id] ?? 0,
      session: state.public.sessionScores?.[player.id] ?? 0,
    }))
    .sort(
      (a, b) => b.session - a.session || a.name.localeCompare(b.name),
    );

  return block(blockTitle(title), scoreList(rows, state));
}

/* One tappable list of people. Every voting-style game uses the same
 * control, only the action and the label change. */
function choiceList(players, { actions, label, payloadFor, fallback }) {
  const list = el("div", "choice-list");
  for (const player of players ?? []) {
    const node = el("button", "choice");
    node.type = "button";
    node.append(avatar(player.name, player.id), el("span", "choice-name", player.name));
    node.append(el("span", "choice-action", label));
    node.addEventListener(
      "click",
      actOn(node, actions, payloadFor(player), fallback),
    );
    list.append(node);
  }
  return list;
}

function voteChoices(state, game, actions) {
  const players = (game.players ?? []).filter(
    (player) => player.id !== state.you?.playerId,
  );
  return choiceList(players, {
    actions,
    label: "Vote",
    fallback: "That vote did not go through.",
    payloadFor: (player) => ({ type: "vote", targetId: player.id }),
  });
}

function roleWordCard(game, mine) {
  const card = el("section", "role-card");
  if (mine.isImposter) {
    card.classList.add("is-imposter");
    card.append(el("p", "role-label", "Your role"));
    card.append(el("h3", "role-title", "Imposter"));
    card.append(
      note(
        `You do not know the secret word. The category is ${game.category}. Blend in with the crew.`,
      ),
    );
  } else {
    card.classList.add("is-crew");
    card.append(el("p", "role-label", "Your role"));
    card.append(el("h3", "role-title", "Crew"));
    card.append(el("p", "role-caption", "The secret word is"));
    card.append(el("p", "word-display", mine.word ?? "…"));
    card.append(note(`Category: ${game.category}`));
  }
  return card;
}

function oneOfUs(state, game, mine, actions) {
  const nodes = [];

  if (game.phase === "reveal") {
    nodes.push(roleWordCard(game, mine));
    if (mine.canReady) {
      const ready = button("Got it, I'm ready");
      ready.addEventListener(
        "click",
        actOn(ready, actions, { type: "ready" }, "That did not go through."),
      );
      nodes.push(ready);
    } else {
      nodes.push(
        waiting(
          `Ready. ${game.readyCount} of ${game.totalPlayers} players have seen their role.`,
        ),
      );
    }
  }

  /* The hint round. The clues are spoken out loud, so the screen only
   * keeps the room in step: it shows whose turn it is, and the next
   * phone lights up when they are done. */
  if (game.phase === "hints") {
    nodes.push(roleWordCard(game, mine));

    const round = `Round ${game.hintRound ?? 1} of ${game.hintRounds ?? 2}`;

    if (mine.isSpeaker) {
      const card = el("section", "role-card is-speaker");
      card.append(el("p", "role-label", "Your turn"));
      card.append(el("h3", "role-title", "Say your clue"));
      card.append(
        note(
          "Say one clue out loud. Do not say the word itself, and keep it vague.",
        ),
      );
      card.append(el("p", "role-caption", round));
      nodes.push(card);

      const done = button("Done, next person");
      done.addEventListener(
        "click",
        actOn(done, actions, { type: "nextHint" }, "Could not hand over the turn."),
      );
      nodes.push(done);
    } else {
      nodes.push(
        block(
          blockTitle(`Waiting for ${game.speakerName ?? "the next player"}`),
          note("They are giving a clue. Listen, and think about who might be faking it."),
          el("p", "role-caption", round),
        ),
      );
      nodes.push(
        waiting(
          `${game.spokenCount ?? 0} of ${game.totalSpeakers ?? game.totalPlayers} clues given this round.`,
        ),
      );
    }
  }

  if (game.phase === "vote") {
    if (mine.yourVote) {
      const target = game.players.find((player) => player.id === mine.yourVote);
      nodes.push(block(blockTitle("Your vote"), note(`You voted for ${target?.name ?? "someone"}.`)));
      nodes.push(
        waiting(`${game.voteCount} of ${game.totalPlayers} votes are in.`),
      );
    } else {
      nodes.push(
        block(
          blockTitle("Who is the imposter?"),
          note("Vote for the player you think was faking it."),
          voteChoices(state, game, actions, "vote", "Vote"),
        ),
      );
      nodes.push(
        waiting(`${game.voteCount} of ${game.totalPlayers} votes are in.`),
      );
    }
  }

  if (game.phase === "imposter-guess") {
    if (mine.canGuess) {
      const form = block(
        blockTitle("You were caught!"),
        note("Guess the secret word to steal the win."),
      );
      const input = textInput("Your guess", keyOf(game, "imposter-guess"), {
        maxLength: 90,
      });
      form.append(input);
      const error = errorSlot();
      form.append(error);
      const submit = button("Submit guess");
      formSubmit({
        button: submit,
        actions,
        errorNode: error,
        fallback: "Type your guess first.",
        read: () => {
          const value = input.value.trim();
          return value ? { type: "guess", guess: value } : null;
        },
        onSuccess: () => clearDraft(keyOf(game, "imposter-guess")),
      });
      form.append(submit);
      nodes.push(form);
    } else {
      nodes.push(
        waiting("The imposter was caught and is guessing the word…"),
      );
    }
  }

  if (game.phase === "results" || game.phase === "complete") {
    const crewWon = game.winner === "crew";
    const wasCaught = game.caught === true;

    /* The room needs to be told what actually happened, because "the
     * imposter escaped" covers two very different endings. */
    const topVote = game.voteCounts?.[0] ?? null;
    let outcome;
    if (crewWon) {
      outcome = `${game.imposterName} was caught.`;
    } else if (game.outcomeReason === "no_guess") {
      outcome = `${game.imposterName} was caught, but no guess was made.`;
    } else if (game.outcomeReason === "vote_tie" || game.decisiveVote === false) {
      outcome = "The vote was tied, so the imposter escaped.";
    } else if (game.outcomeReason === "wrong_vote") {
      outcome = topVote?.name
        ? `The room voted for ${topVote.name}, who was not the imposter.`
        : "The room voted for somebody who was not the imposter.";
    } else if (wasCaught) {
      outcome = `${game.imposterName} was caught, but guessed the word anyway.`;
    } else {
      outcome = `${game.imposterName} fooled the room.`;
    }

    const banner = el("section", `result-banner ${crewWon ? "is-win" : "is-loss"}`);
    banner.append(
      el("h3", "result-title", crewWon ? "Crew wins!" : "Imposter wins!"),
    );
    banner.append(note(outcome));
    nodes.push(banner);

    const reveal = block(blockTitle("The reveal"));
    /* The whole reveal is the name of the imposter. The engine has
     * published it since the beginning and the screen never showed it,
     * so the room finished the game without ever finding out. */
    if (game.imposterName) {
      reveal.append(el("p", "role-caption", "The imposter was"));
      reveal.append(el("p", "word-display", game.imposterName));
    }
    reveal.append(el("p", "role-caption", "The secret word was"));
    reveal.append(el("p", "word-display", game.word ?? "-"));
    reveal.append(note(`Category: ${game.category}`));
    if (game.imposterGuess) {
      reveal.append(note(`The imposter guessed: ${game.imposterGuess}`));
    }
    if (Array.isArray(game.voteCounts)) {
      const list = el("ul", "vote-count-list");
      for (const row of game.voteCounts) {
        const item = el("li", "vote-count-row");
        item.append(el("span", "player-name", row.name));
        item.append(el("span", "vote-count", `${row.count} ${row.count === 1 ? "vote" : "votes"}`));
        list.append(item);
      }
      reveal.append(list);
    }
    if (Array.isArray(game.voteBreakdown) && game.voteBreakdown.length > 0) {
      const breakdown = voteBreakdown(game.voteBreakdown);
      if (breakdown) {
        reveal.append(blockTitle("Who voted for whom"));
        reveal.append(breakdown);
      }
    }
    nodes.push(reveal);
    nodes.push(
      note(
        mine.isImposter
          ? "You were the imposter."
          : "You were part of the crew.",
      ),
    );
    nodes.push(scoreboard(state, game));
    if (state.public.playlist) nodes.push(sessionScoreboard(state));
    nodes.push(
      game.phase === "complete"
        ? waiting("All rounds are complete. The host can play again.")
        : waiting("Waiting for the host to start the next round…"),
    );
  }

  return nodes;
}

function whoIsIt(state, game, mine, actions) {
  const nodes = [];

  if (game.phase === "vote") {
    nodes.push(
      block(
        blockTitle("The question"),
        el("p", "prompt-big", game.question),
      ),
    );
    if (mine.yourVote) {
      const target = game.players.find((player) => player.id === mine.yourVote);
      nodes.push(
        block(
          blockTitle("Your vote"),
          note(`You voted for ${target?.name ?? "someone"}.`),
        ),
      );
    } else {
      nodes.push(
        block(
          blockTitle("Pick a player"),
          voteChoices(state, game, actions, "vote", "Vote"),
        ),
      );
    }
    nodes.push(
      waiting(`${game.votedCount} of ${game.totalPlayers} votes are in.`),
    );
  }

  if (game.phase === "results" || game.phase === "complete") {
    nodes.push(block(blockTitle("The question"), el("p", "prompt-big", game.question)));
    if (game.topNames?.length) {
      nodes.push(
        block(
          blockTitle(
            game.topNames.length === 1 ? "The room picked" : "The room tied",
          ),
          el("p", "top-names", game.topNames.join(" · ")),
        ),
      );
    }
    nodes.push(block(blockTitle("Every vote"), countList(game.results?.counts)));
    const breakdown = voteBreakdown(game.results?.voters);
    if (breakdown) nodes.push(breakdown);
    nodes.push(scoreboard(state, game));
    if (state.public.playlist) nodes.push(sessionScoreboard(state));
    nodes.push(
      game.phase === "complete"
        ? waiting("All rounds are complete. The host can play again.")
        : waiting("Waiting for the host to start the next round…"),
    );
  }

  return nodes;
}

function countList(rows) {
  const list = el("ul", "vote-count-list");
  if (!Array.isArray(rows) || rows.length === 0) {
    list.append(el("li", "empty-state", "No votes recorded."));
    return list;
  }
  const max = Math.max(...rows.map((row) => row.count), 1);
  for (const row of rows) {
    const item = el("li", "vote-count-row");
    item.append(avatar(row.name, row.playerId));
    item.append(el("span", "player-name", row.name));
    const meter = el("span", "vote-meter");
    const fill = el("span", "vote-meter-fill");
    fill.style.width = `${Math.round((row.count / max) * 100)}%`;
    meter.append(fill);
    item.append(meter);
    item.append(el("span", "vote-count", String(row.count)));
    list.append(item);
  }
  return list;
}

/* "See who voted for whom", used by every voting game. */
function voteBreakdown(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const details = el("details", "vote-breakdown");
  details.append(el("summary", null, "See who voted for whom"));
  const list = el("ul", "vote-count-list");
  for (const row of rows) {
    const item = el("li", "vote-count-row");
    item.append(el("span", "player-name", row.voterName));
    item.append(el("span", "vote-count", `Voted for ${row.targetName}`));
    list.append(item);
  }
  details.append(list);
  return details;
}

function actItOut(state, game, mine, actions) {
  const nodes = [];

  if (game.phase === "act") {
    if (mine.isActor) {
      const card = el("section", "role-card is-crew");
      card.append(el("p", "role-label", "You are acting"));
      card.append(el("h3", "role-title", mine.yourPrompt?.text ?? "Your prompt"));
      card.append(note(`Category: ${mine.category}`));
      card.append(
        note(
          "Act it out. The room shouts guesses. Tap the first person who gets it.",
        ),
      );
      nodes.push(card);

      const controls = el("div", "button-row");
      const skip = button("New prompt", "btn btn-tonal");
      skip.addEventListener(
        "click",
        actOn(skip, actions, { type: "skipPrompt" }, "Could not get a new prompt."),
      );
      const give = button("Give up", "btn btn-text");
      give.addEventListener("click", actOn(give, actions, { type: "giveUp" }, "Could not give up the turn."));
      controls.append(skip, give);
      nodes.push(controls);

      const choices = block(
        blockTitle("Who guessed it first?"),
        note("Tap the first correct guesser. You both score 1."),
      );
      choices.append(
        choiceList(mine.guessChoices, {
          actions,
          label: "Correct",
          fallback: "That did not go through.",
          payloadFor: (player) => ({ type: "correct", playerId: player.id }),
        }),
      );
      nodes.push(choices);
    } else {
      nodes.push(
        block(
          blockTitle("Category"),
          el("p", "prompt-big", mine.category),
          note(`${mine.actorName} is acting. Shout guesses out loud.`),
        ),
      );
      nodes.push(waiting("The actor will tap the first correct guesser."));
    }
  }

  if (game.phase === "results" || game.phase === "complete") {
    const result = game.result;
    const correct = Boolean(result?.correct);
    const banner = el(
      "section",
      `result-banner ${correct ? "is-win" : "is-loss"}`,
    );
    banner.append(
      el("h3", "result-title", correct ? "Guessed!" : "No points this turn"),
    );
    banner.append(
      note(
        correct
          ? `${result.guesserName} guessed it first. ${result.actorName} and ${result.guesserName} each score 1.`
          : result?.skippedByHost
            ? `${result.actorName}'s turn was skipped by the host.`
            : `${result?.actorName ?? "The actor"} gave up the turn.`,
      ),
    );
    nodes.push(banner);

    nodes.push(
      block(
        blockTitle("The prompt was"),
        el("p", "word-display", result?.prompt?.text ?? "-"),
        note(`Category: ${result?.category ?? "-"}`),
      ),
    );

    nodes.push(scoreboard(state, game));
    if (state.public.playlist) nodes.push(sessionScoreboard(state));

    if (mine.canNext) {
      const next = button("Next actor");
      next.addEventListener("click", actOn(next, actions, { type: "next" }, "Could not move on."));
      nodes.push(next);
    } else if (game.phase === "complete") {
      nodes.push(waiting("That was the last acting turn. Waiting for the host."));
    } else {
      nodes.push(waiting("Waiting for the actor to start the next turn…"));
    }

    if (game.phase === "complete") nodes.push(actHistory(game));
  }

  return nodes;
}

function turnGuess(state, game, mine, actions) {
  const nodes = [];
  const subject = game.contentType === "place" ? "place" : "person";

  if (game.phase === "guess") {
    if (mine.isActive) {
      nodes.push(
        block(
          blockTitle(`You are guessing your ${subject}`),
          note(
            "Everyone else can see the answer. Ask yes/no questions out loud, then type a guess. You can guess as many times as you like.",
          ),
        ),
      );

      const form = block(blockTitle("Your guess"));
      const key = keyOf(game, "turn-guess");
      const input = textInput(`Type a ${subject}`, key, { maxLength: 90 });
      form.append(input);
      const submit = button("Guess");
      submit.addEventListener("click", () => {
        const value = input.value.trim();
        if (!value) {
          actions.toast("Type a guess first.");
          return;
        }
        submit.disabled = true;
        Promise.resolve(actions.send({ type: "guess", guess: value }))
          .then(() => {
            input.value = "";
            drafts.delete(key);
          })
          .catch((error) => {
            submit.disabled = false;
            actions.toast(error?.message || "That guess did not go through.");
          });
      });
      form.append(submit);
      nodes.push(form);

      if ((mine.yourGuesses ?? []).length > 0) {
        const list = el("ul", "guess-list");
        for (const guess of mine.yourGuesses) {
          list.append(el("li", "guess-row", guess));
        }
        nodes.push(block(blockTitle("Wrong guesses so far"), list));
      }

      const give = button("I give up, reveal the answer", "btn btn-text");
      give.addEventListener("click", actOn(give, actions, { type: "giveUp" }, "Could not give up the turn."));
      nodes.push(give);
    } else {
      const assignment = mine.assignment;
      nodes.push(
        block(
          blockTitle("The answer"),
          el("p", "word-display", assignment?.name ?? "-"),
          assignment?.group ? note(`Group: ${assignment.group}`) : null,
          note(
            `You can see it. Give ${mine.activePlayerName} clues out loud, but never say the name.`,
          ),
        ),
      );
      nodes.push(waiting(`${mine.activePlayerName} is guessing.`));
    }
  }

  if (game.phase === "reveal") {
    const result = game.result;
    const correct = Boolean(result?.correct);
    const title = correct
      ? "Correct!"
      : result?.gaveUp
        ? "They gave up"
        : "Turn skipped";
    const banner = el(
      "section",
      `result-banner ${correct ? "is-win" : "is-loss"}`,
    );
    banner.append(el("h3", "result-title", title));
    banner.append(
      note(
        correct
          ? `${result.playerName} guessed it. +1 point.`
          : result?.guess
            ? `${result.playerName}'s last guess was “${result.guess}”.`
            : "No points this turn.",
      ),
    );
    nodes.push(banner);

    nodes.push(
      block(
        blockTitle("The answer was"),
        el("p", "word-display", result?.answer?.name ?? "-"),
        result?.answer?.group ? note(`Group: ${result.answer.group}`) : null,
      ),
    );

    nodes.push(scoreboard(state, game));
    if (state.public.playlist) nodes.push(sessionScoreboard(state));

    if (mine.canNext) {
      const next = button("Next turn");
      next.addEventListener("click", actOn(next, actions, { type: "next" }, "Could not move on."));
      nodes.push(next);
    } else {
      nodes.push(
        waiting(
          `${result?.playerName ?? "The guesser"} will start the next turn when ready.`,
        ),
      );
    }
  }

  if (game.phase === "complete") {
    // The host ended the game. Show the final standings rather than a stale
    // turn result, which may not exist at all.
    nodes.push(
      block(
        blockTitle("That's a wrap"),
        note("The host finished the game. Here is the final score."),
      ),
    );
    if (game.result) {
      nodes.push(
        block(
          blockTitle("Last turn"),
          el("p", "word-display", game.result.answer?.name ?? "-"),
          note(
            game.result.correct
              ? `${game.result.playerName} guessed it. +1 point.`
              : game.result.gaveUp
                ? `${game.result.playerName} gave up.`
                : "No points that turn.",
          ),
        ),
      );
    }
    nodes.push(scoreboard(state, game));
    if (state.public.playlist) nodes.push(sessionScoreboard(state));
    nodes.push(turnHistory(game));
    nodes.push(waiting("Waiting for the host."));
  }

  return nodes;
}

function actHistory(game) {
  const rows = [...(game.history ?? [])].reverse();
  if (rows.length === 0) return null;

  const list = el("ul", "history-list");
  for (const row of rows) {
    const item = el("li", "history-row");
    item.append(el("span", "player-name", row.actorName));
    item.append(el("span", "history-type", row.prompt));
    item.append(
      pill(
        row.correct ? `${row.guesserName} +1` : row.skippedByHost ? "Skipped" : "Missed",
        row.correct ? "badge badge-correct" : "badge badge-wrong",
      ),
    );
    list.append(item);
  }
  return block(blockTitle("Acting history"), list);
}

function turnHistory(game) {
  const rows = [...(game.history ?? [])].reverse();
  if (rows.length === 0) return null;

  const list = el("ul", "history-list");
  for (const row of rows) {
    const item = el("li", "history-row");
    item.append(el("span", "player-name", row.playerName));
    item.append(el("span", "history-type", row.answerName));
    item.append(
      pill(
        row.correct ? "+1" : row.skippedByHost ? "Skipped" : "Missed",
        row.correct ? "badge badge-correct" : "badge badge-wrong",
      ),
    );
    list.append(item);
  }
  return block(blockTitle("Turn history"), list);
}

function playlistBreak(state) {
  const playlist = state.public.playlist;
  const nodes = [];
  const head = el("header", "game-head");
  head.append(el("p", "eyebrow", `Room ${state.public.code}`));
  head.append(el("h2", "game-title", "Game night"));
  const meta = el("div", "game-meta-row");
  if (playlist) {
    meta.append(
      pill(
        playlist.finished
          ? "Finished"
          : `Game ${Math.min(playlist.index + 1, playlist.total)} of ${playlist.total}`,
        "pill pill-accent",
      ),
    );
  }
  head.append(meta);
  nodes.push(head);

  nodes.push(
    block(
      blockTitle(playlist?.finished ? "That's a wrap" : "Between games"),
      note(
        playlist?.finished
          ? "The playlist is finished. The host can start another game or return to the lobby."
          : playlist?.next
            ? `Next up: ${playlist.next.name}.`
            : "The host is deciding what comes next.",
      ),
    ),
  );

  const last = playlist?.completed?.at(-1);
  if (last) {
    const list = el("ul", "result-list");
    for (const row of (last.scores ?? []).slice(0, 10)) {
      const item = el("li", "result-row");
      item.append(avatar(row.name, row.playerId));
      item.append(el("span", "player-name", row.name));
      item.append(
        el(
          "span",
          "score-points",
          String(row.points),
        ),
      );
      list.append(item);
    }
    nodes.push(
      block(
        blockTitle(`Last game: ${last.name}`),
        last.reason === "skipped"
          ? note("This game was skipped by the host.")
          : last.reason === "ended"
            ? note("The host ended this game early.")
            : null,
        list,
      ),
    );
  }

  nodes.push(sessionScoreboard(state));

  const upcoming = (playlist?.queue ?? []).filter(
    (entry) => entry.status === "upcoming",
  );
  if (upcoming.length > 0 && !playlist?.finished) {
    const list = el("ul", "clue-list");
    for (const entry of upcoming.slice(0, 8)) {
      const item = el("li", "clue-row");
      item.append(el("span", "player-name", entry.name));
      list.append(item);
    }
    nodes.push(block(blockTitle("Coming up"), list));
  }

  nodes.push(
    waiting(
      playlist?.finished
        ? "Waiting for the host to close the game night."
        : "Waiting for the host to start the next game.",
    ),
  );

  return nodes;
}

/* The parts of a running game that are public. A spectator may as well watch
 * along - it is what the rest of the room is looking at. */
function publicGameContent(game) {
  if (!game) return null;

  if (game.question) {
    return block(blockTitle("The question"), el("p", "prompt-big", game.question));
  }
  if (game.prompt?.text) {
    return block(
      blockTitle("The question"),
      el("p", "prompt-big", game.prompt.text),
    );
  }
  if (game.category) {
    return block(
      blockTitle("Category"),
      el("p", "prompt-big", game.category),
      game.actorName ? note(`${game.actorName} is acting.`) : null,
    );
  }
  if (game.activePlayerName) {
    return block(
      blockTitle("Current turn"),
      el("p", "prompt-big", game.activePlayerName),
      note("Everyone except the guesser can see the answer."),
    );
  }
  if (game.currentType) {
    return block(
      blockTitle("Current turn"),
      el(
        "p",
        "prompt-big",
        `${game.currentPlayerName ?? "Someone"} · ${game.currentType}`,
      ),
    );
  }
  if (Array.isArray(game.clues) && game.clues.length > 0) {
    const list = el("ul", "clue-list");
    for (const clue of game.clues) {
      const item = el("li", "clue-row");
      item.append(avatar(clue.name, clue.playerId));
      const copy = el("div", "clue-copy");
      copy.append(el("p", "player-name", clue.name));
      copy.append(el("p", "clue-text", clue.text));
      item.append(copy);
      list.append(item);
    }
    return block(blockTitle("Clues from the room"), list);
  }
  return null;
}

function spectatorScreen(state) {
  const game = state.public.game;
  const nodes = [];
  const head = el("header", "game-head");
  head.append(el("p", "eyebrow", `Room ${state.public.code}`));
  head.append(el("h2", "game-title", game?.name ?? "Game in progress"));
  const meta = el("div", "game-meta-row");
  meta.append(pill("Spectator", "pill pill-accent"));
  head.append(meta);
  nodes.push(head);

  nodes.push(
    block(
      blockTitle("You're sitting out this game"),
      note(
        "You were disconnected when this game started. You can watch the scores, and you'll rejoin automatically when the host starts the next game.",
      ),
    ),
  );

  if (game) {
    const progress = el("div", "game-meta-row");
    if (game.oneTurnEach) {
      progress.append(pill(`Turn ${game.turnNumber} of ${game.totalTurns}`));
    } else if (game.endless) {
      progress.append(pill(`Pass ${game.pass ?? 1}`));
    } else if (game.maxRounds > 0) {
      progress.append(pill(`Round ${game.round} of ${game.maxRounds}`));
    }
    progress.append(pill(phaseLabel(game), "pill pill-accent"));
    nodes.push(block(blockTitle("Current game"), progress));

    const content = publicGameContent(game);
    if (content) nodes.push(content);

    nodes.push(scoreboard(state, game, "Current game scores"));
  }

  if (state.public.playlist) nodes.push(sessionScoreboard(state));
  nodes.push(waiting("Waiting for the next game."));

  return nodes;
}

function whoWroteThat(state, game, mine, actions) {
  const nodes = [];
  const prompt = game.prompt?.text ?? "";

  if (game.phase === "writing") {
    nodes.push(block(blockTitle("The question"), el("p", "prompt-big", prompt)));
    if (mine.submittedAnswer) {
      nodes.push(
        block(blockTitle("Your answer"), note(mine.yourAnswer)),
      );
      nodes.push(
        waiting(`${game.writingCount} of ${game.totalPlayers} answers are in.`),
      );
    } else {
      const form = block(blockTitle("Write your answer"));
      const input = textarea("Keep it short and funny", keyOf(game, "answer"));
      form.append(input);
      const error = errorSlot();
      form.append(error);
      const submit = button("Submit answer");
      formSubmit({
        button: submit,
        actions,
        errorNode: error,
        fallback: "Write an answer first.",
        read: () => {
          const value = input.value.trim();
          return value ? { type: "answer", answer: value } : null;
        },
        onSuccess: () => clearDraft(keyOf(game, "answer")),
      });
      form.append(submit);
      nodes.push(form);
    }
  }

  if (game.phase === "guessing") {
    nodes.push(block(blockTitle("The question"), el("p", "prompt-big", prompt)));
    if (mine.submittedGuesses) {
      nodes.push(waiting(`${game.guessCount} of ${game.totalPlayers} guess sheets are in.`));
    } else {
      const form = block(
        blockTitle("Who wrote that?"),
        note("Match every anonymous answer to its author."),
      );
      const list = el("div", "answer-list");
      (game.answers ?? []).forEach((answer, index) => {
        const card = el("article", "answer-card");
        card.append(el("p", "answer-index", `Answer ${index + 1}`));
        card.append(el("p", "answer-text", answer.text));
        if (answer.id === mine.yourAnswerId) {
          card.append(pill("Your answer", "badge badge-you"));
        } else {
          const select = el("select", "field-input");
          select.dataset.answer = answer.id;
          select.setAttribute("aria-label", `Author for answer ${index + 1}`);
          // An empty value means "not chosen yet" and is never submitted.
          const placeholder = el("option", null, "Choose an author…");
          placeholder.value = "";
          select.append(placeholder);
          for (const player of game.players ?? []) {
            if (player.id === state.you?.playerId) continue;
            const option = el("option", null, player.name);
            option.value = player.id;
            select.append(option);
          }
          bindSelect(select, keyOf(game, `guess-${answer.id}`));
          card.append(select);
        }
        list.append(card);
      });
      form.append(list);
      const error = errorSlot();
      form.append(error);
      const submit = button("Submit my guesses");
      formSubmit({
        button: submit,
        actions,
        errorNode: error,
        fallback: "Pick an author for every answer.",
        read: () => {
          const guesses = {};
          let missing = false;
          for (const select of list.querySelectorAll("select[data-answer]")) {
            if (!select.value) {
              missing = true;
              select.classList.add("is-invalid");
            } else {
              select.classList.remove("is-invalid");
            }
            guesses[select.dataset.answer] = select.value;
          }
          return missing ? null : { type: "guesses", guesses };
        },
      });
      form.append(submit);
      nodes.push(form);
      nodes.push(waiting(`${game.guessCount} of ${game.totalPlayers} guess sheets are in.`));
    }
  }

  if (game.phase === "results" || game.phase === "complete") {
    nodes.push(block(blockTitle("The question"), el("p", "prompt-big", prompt)));
    const list = el("div", "answer-list");
    for (const answer of game.answers ?? []) {
      const card = el("article", "answer-card");
      card.append(el("p", "answer-text", answer.text));
      card.append(el("p", "answer-author", `Written by ${answer.authorName}`));
      if (answer.correctGuessers?.length) {
        card.append(
          note(
            `Guessed correctly by ${answer.correctGuessers
              .map((entry) => entry.name)
              .join(", ")}`,
          ),
        );
      } else {
        card.append(note("Nobody guessed this one."));
      }
      list.append(card);
    }
    nodes.push(block(blockTitle("The reveal"), list));
    nodes.push(
      block(
        blockTitle("Your score this game"),
        note(`You matched ${mine.yourCorrectCount ?? 0} answers correctly.`),
      ),
    );
    nodes.push(scoreboard(state, game));
    if (state.public.playlist) nodes.push(sessionScoreboard(state));
    nodes.push(
      game.phase === "complete"
        ? waiting("All rounds are complete. The host can play again.")
        : waiting("Waiting for the host to start the next round…"),
    );
  }

  return nodes;
}

function truthOrDare(state, game, mine, actions) {
  const nodes = [];

  if (game.phase === "collect") {
    nodes.push(
      block(
        blockTitle("Write the prompts"),
        note("Send one truth question and one dare for the room. Keep both kind and family-friendly."),
      ),
    );
    if (mine.submitted) {
      nodes.push(
        block(
          blockTitle("Your truth"),
          note(mine.yourTruth),
          blockTitle("Your dare"),
          note(mine.yourDare),
        ),
      );
      nodes.push(
        waiting(`${game.submittedCount} of ${game.totalPlayers} players have submitted.`),
      );
    } else {
      const form = block(blockTitle("Your prompts"));
      form.append(note("Truth question"));
      const truth = textarea("Ask something fun", keyOf(game, "truth"));
      form.append(truth);
      form.append(note("Dare"));
      const dare = textarea("Give a safe, silly challenge", keyOf(game, "dare"));
      form.append(dare);
      const submit = button("Submit both");
      const error = errorSlot();
      form.append(error);
      formSubmit({
        button: submit,
        actions,
        errorNode: error,
        fallback: "Write both a truth and a dare.",
        read: () => {
          const truthValue = truth.value.trim();
          const dareValue = dare.value.trim();
          if (!truthValue || !dareValue) return null;
          return { type: "submit", truth: truthValue, dare: dareValue };
        },
        onSuccess: () => {
          clearDraft(keyOf(game, "truth"));
          clearDraft(keyOf(game, "dare"));
        },
      });
      form.append(submit);
      nodes.push(form);
    }
  }

  if (game.phase === "play") {
    nodes.push(
      block(
        blockTitle(`Round ${game.round} of ${game.maxRounds}`),
        progressBar(game.completedTurns, game.totalTurns),
        note(`${game.completedTurns} of ${game.totalTurns} turns complete.`),
      ),
    );

    if (mine.isCurrent && mine.currentTurn) {
      const card = el("section", "turn-card");
      card.append(
        el(
          "p",
          "turn-label",
          mine.currentTurn.type === "truth" ? "Your turn · Truth" : "Your turn · Dare",
        ),
      );
      card.append(el("p", "prompt-big", mine.currentTurn.text));
      card.append(note("Read it out, do it, then pass the turn on."));
      const done = button("Done, next turn");
      done.addEventListener("click", actOn(done, actions, { type: "done" }, "Could not finish the turn."));
      card.append(done);
      nodes.push(card);
    } else {
      nodes.push(
        waiting(
          `${mine.waitingForName ?? "Another player"} has the current turn. Watch and cheer!`,
        ),
      );
    }

    nodes.push(historyList(game));
  }

  if (game.phase === "complete") {
    nodes.push(
      block(
        blockTitle("That's a wrap"),
        note("Every player has taken their turns. The host can play again or end the game."),
      ),
    );
    nodes.push(historyList(game));
  }

  return nodes;
}

function historyList(game) {
  const rows = [...(game.history ?? [])].reverse();
  if (rows.length === 0) {
    return block(
      blockTitle("Turn history"),
      el("p", "empty-state", "No turns yet."),
    );
  }

  const list = el("ul", "history-list");
  for (const turn of rows) {
    const item = el("li", "history-row");
    item.append(el("span", "player-name", turn.name));
    item.append(el("span", "history-type", turn.type));
    if (turn.skipped) item.append(pill("Skipped"));
    list.append(item);
  }
  return block(blockTitle("Turn history"), list);
}

/* The palette the drawer can pick from. */
const DRAW_COLORS = [
  "#f8f7f2",
  "#ff8a6b",
  "#ffd166",
  "#55d6be",
  "#6c8cff",
  "#7dd3fc",
  "#86efac",
  "#f9a8d4",
  "#c4b5fd",
  "#ff7b9c",
];

/* The brush sizes, as a fraction of the canvas width. */
const DRAW_SIZES = [0.004, 0.008, 0.014, 0.024, 0.04];

const DRAW_TOOLS = [
  { id: "pen", label: "Pen", icon: "pencil" },
  { id: "erase", label: "Eraser", icon: "eraser" },
  { id: "fill", label: "Fill", icon: "bucket" },
  { id: "line", label: "Line", icon: "line" },
  { id: "square", label: "Box", icon: "square" },
];

const BOARD_BACKGROUND = "#0d1526";

const FLUSH_MS = 120;

/* The drawing board.
 *
 * The canvas is one node that is created once and moved around, never
 * rebuilt. That matters: the rest of the screen is re-rendered on every
 * state push, and a fresh canvas element would come up blank in the
 * middle of somebody's drawing.
 */
/* A prefix that is unique to this page load, so two phones never send the
 * same stroke id, and a reload does not repeat one. */
const drawSessionId = Math.random().toString(36).slice(2, 8);

const drawState = {
  canvas: null,
  ctx: null,
  sessionId: drawSessionId,
  strokes: [],
  turnKey: "",
  ownIds: new Set(),
  actions: null,
  canDraw: false,
  countdownNode: null,
  deadline: 0,
  buffer: [],
  lastFlush: 0,
  counter: 0,
  painting: false,
  shape: null,
  redoStack: [],
  expanded: false,
  clock: null,
  observer: null,
  tool: "pen",
  color: DRAW_COLORS[0],
  size: DRAW_SIZES[1],
};



function drawTurnKey(game) {
  return `${game.id}|${game.turnNumber ?? 0}|${game.phase}`;
}

function ensureDrawCanvas(game) {
  if (drawState.canvas) return drawState.canvas;

  const canvas = el("canvas", "draw-canvas");
  canvas.width = 800;
  canvas.height = 600;
  canvas.setAttribute("aria-label", "The drawing board");

  const ctx = canvas.getContext("2d");
  drawState.canvas = canvas;
  drawState.ctx = ctx;

  const pointFrom = (event) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return [
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    ];
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (!drawState.canDraw) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    drawState.painting = true;
    const point = pointFrom(event);
    if (!point) return;

    if (drawState.tool === "fill") {
      // The fill is a single click, not a drag.
      drawState.painting = false;
      canvas.releasePointerCapture?.(event.pointerId);
      applyFill(point);
      return;
    }

    drawState.buffer = [point];
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drawState.painting || !drawState.canDraw) return;
    event.preventDefault();
    const point = pointFrom(event);
    if (!point) return;

    if (drawState.tool === "line" || drawState.tool === "square") {
      // A shape is drawn when the finger is lifted, so the preview follows
      // the finger and the shape only appears once.
      drawState.shape = point;
      drawShapePreview();
      return;
    }

    drawState.buffer.push(point);
    drawSegment(point);
    flushStroke(false);
  });

  const stop = (event) => {
    if (!drawState.painting) return;
    drawState.painting = false;
    canvas.releasePointerCapture?.(event.pointerId);

    if (drawState.tool === "line" || drawState.tool === "square") {
      const from = drawState.buffer[0];
      const to = drawState.shape;
      drawState.shape = null;
      if (from && to) {
        drawState.buffer = [from, to];
        drawShape();
        flushStroke(true);
      }
      return;
    }

    flushStroke(true);
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("pointerleave", stop);

  /* The canvas is sized by the layout, so it follows the width of the
   * phone. The observer also catches the screen being turned. */
  if (typeof ResizeObserver !== "undefined") {
    drawState.observer = new ResizeObserver(() => resizeDrawCanvas(canvas));
    drawState.observer.observe(canvas);
  } else {
    window.addEventListener("resize", () => resizeDrawCanvas(canvas));
  }

  return canvas;
}

/* The shape being dragged out, before the finger is lifted. */
function drawShapePreview() {
  const ctx = drawState.ctx;
  const canvas = drawState.canvas;
  if (!ctx || !canvas) return;

  redrawBoard();
  const from = drawState.buffer[0];
  const to = drawState.shape;
  if (!from || !to) return;

  ctx.strokeStyle = drawState.color;
  ctx.lineWidth = drawState.size * canvas.width;
  ctx.lineCap = "round";
  ctx.beginPath();
  const a = strokePoint(ctx, from, canvas.width, canvas.height);
  const b = strokePoint(ctx, to, canvas.width, canvas.height);
  if (drawState.tool === "square") {
    ctx.rect(
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.abs(b[0] - a[0]),
      Math.abs(b[1] - a[1]),
    );
  } else {
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
}

/* Draws the shape for good, as a stroke the other phones will also see. */
function drawShape() {
  const ctx = drawState.ctx;
  const canvas = drawState.canvas;
  if (!ctx || !canvas) return;

  ctx.strokeStyle = drawState.color;
  ctx.lineWidth = drawState.size * canvas.width;
  ctx.lineCap = "round";
  ctx.beginPath();
  const a = strokePoint(ctx, drawState.buffer[0], canvas.width, canvas.height);
  const b = strokePoint(ctx, drawState.buffer[1], canvas.width, canvas.height);
  if (drawState.tool === "square") {
    ctx.rect(
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.abs(b[0] - a[0]),
      Math.abs(b[1] - a[1]),
    );
  } else {
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
}

function resizeDrawCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  redrawBoard();
}

function strokePoint(ctx, point, width, height) {
  return [point[0] * width, point[1] * height];
}

function drawSegment(point) {
  const ctx = drawState.ctx;
  const canvas = drawState.canvas;
  if (!ctx || !canvas) return;

  const points = drawState.buffer;
  if (points.length < 2) return;

  const [from, to] = [points[points.length - 2], points[points.length - 1]];
  ctx.strokeStyle =
    drawState.tool === "erase" ? BOARD_BACKGROUND : drawState.color;
  ctx.lineWidth = drawState.size * canvas.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const a = strokePoint(ctx, from, canvas.width, canvas.height);
  const b = strokePoint(ctx, to, canvas.width, canvas.height);
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function redrawBoard() {
  const ctx = drawState.ctx;
  const canvas = drawState.canvas;
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of drawState.strokes) {
    drawStroke(stroke);
  }
}

function drawStroke(stroke) {
  const ctx = drawState.ctx;
  const canvas = drawState.canvas;
  if (!ctx || !canvas || !Array.isArray(stroke.points)) return;

  if (stroke.tool === "fill") {
    const [point] = stroke.points;
    if (point) {
      fillAt(point, stroke.color || DRAW_COLORS[0]);
    }
    return;
  }

  ctx.strokeStyle =
    stroke.tool === "erase" ? BOARD_BACKGROUND : stroke.color || DRAW_COLORS[0];
  ctx.lineWidth = (stroke.width || 0.011) * canvas.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  if (stroke.tool === "square" && stroke.points.length >= 2) {
    const a = strokePoint(ctx, stroke.points[0], canvas.width, canvas.height);
    const b = strokePoint(ctx, stroke.points[1], canvas.width, canvas.height);
    ctx.rect(
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.abs(b[0] - a[0]),
      Math.abs(b[1] - a[1]),
    );
  } else {
    stroke.points.forEach((point, index) => {
      const [x, y] = strokePoint(ctx, point, canvas.width, canvas.height);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }
  ctx.stroke();
}

/* Paints the area around a point with one colour. The fill is done here and
 * replayed with the other strokes, so every phone ends up with the same
 * picture. */
function fillAt(point, color) {
  const ctx = drawState.ctx;
  const canvas = drawState.canvas;
  if (!ctx || !canvas) return;

  const width = canvas.width;
  const height = canvas.height;
  const startX = Math.round(point[0] * width);
  const startY = Math.round(point[1] * height);
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const offset = (startY * width + startX) * 4;

  const target = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
  const fill = hexToRgba(color);
  if (
    target[0] === fill[0] &&
    target[1] === fill[1] &&
    target[2] === fill[2] &&
    target[3] === fill[3]
  ) {
    return;
  }

  const seen = new Uint8Array(width * height);
  const stack = [startX, startY];

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (seen[y * width + x]) continue;
    seen[y * width + x] = 1;

    const at = (y * width + x) * 4;
    if (
      data[at] !== target[0] ||
      data[at + 1] !== target[1] ||
      data[at + 2] !== target[2] ||
      data[at + 3] !== target[3]
    ) {
      continue;
    }

    // Walk left and right, then look at the rows above and below.
    let left = x;
    while (left > 0 && !seen[y * width + left - 1]) {
      const p = (y * width + left - 1) * 4;
      if (
        data[p] !== target[0] ||
        data[p + 1] !== target[1] ||
        data[p + 2] !== target[2] ||
        data[p + 3] !== target[3]
      ) {
        break;
      }
      left -= 1;
    }

    let right = x;
    while (right < width - 1 && !seen[y * width + right + 1]) {
      const p = (y * width + right + 1) * 4;
      if (
        data[p] !== target[0] ||
        data[p + 1] !== target[1] ||
        data[p + 2] !== target[2] ||
        data[p + 3] !== target[3]
      ) {
        break;
      }
      right += 1;
    }

    for (let px = left; px <= right; px += 1) {
      const p = (y * width + px) * 4;
      data[p] = fill[0];
      data[p + 1] = fill[1];
      data[p + 2] = fill[2];
      data[p + 3] = fill[3];
      if (y > 0) stack.push(px, y - 1);
      if (y < height - 1) stack.push(px, y + 1);
    }
  }

  ctx.putImageData(image, 0, 0);
}

function hexToRgba(value) {
  const text = String(value ?? "#ffffff").replace("#", "");
  const full =
    text.length === 3
      ? text
          .split("")
          .map((part) => part + part)
          .join("")
      : text.padEnd(6, "0").slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
    255,
  ];
}

/* The drawer fills an area with the current colour. */
/* The next stroke id.
 *
 * The id has to be unique for the whole session, not just for this page
 * load. Otherwise a phone that reloads mid-turn sends the same id again
 * and the server refuses it, and with it every stroke after that. */
function nextStrokeId() {
  drawState.counter += 1;
  return `${drawState.sessionId}-${drawState.counter}`;
}

function applyFill(point) {
  const stroke = {
    id: nextStrokeId(),
    tool: "fill",
    points: [point],
    color: drawState.color,
    width: drawState.size,
  };
  drawState.ownIds.add(stroke.id);
  drawState.strokes.push(stroke);
  fillAt(point, drawState.color);
  drawState.actions?.stroke?.(stroke);
}

function flushStroke(force) {
  const now = Date.now();
  if (!force && now - drawState.lastFlush < FLUSH_MS) return;
  if (drawState.buffer.length < 2) {
    if (force) drawState.buffer = [];
    return;
  }

  drawState.lastFlush = now;
  const points = drawState.buffer;
  drawState.buffer = [];

  const id = nextStrokeId();
  drawState.ownIds.add(id);

  drawState.actions?.stroke?.({
    id,
    tool: drawState.tool,
    points,
    color: drawState.color,
    width: drawState.size,
  });
}

/* Called by the app when the server sends a stroke. */
export function applyDrawStroke(stroke) {
  if (!stroke?.id) return;
  if (drawState.strokes.some((entry) => entry.id === stroke.id)) return;
  drawState.strokes.push(stroke);
  if (drawState.ownIds.has(stroke.id)) return;
  drawStroke(stroke);
}

/* Called by the app when the drawer takes a stroke back. */
export function removeDrawStroke(payload) {
  const id = payload?.id;
  if (!id) return;
  const index = drawState.strokes.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  const [removed] = drawState.strokes.splice(index, 1);
  // The drawer's own strokes can be put back.
  if (removed && drawState.ownIds.has(removed.id)) {
    drawState.redoStack.push(removed);
  }
  redrawBoard();
}

/* Puts a stroke that was taken back. It goes out as a new stroke, so the
 * whole room sees it again. */
function redoDrawStroke() {
  const stroke = drawState.redoStack.pop();
  if (!stroke) return;

  const next = {
    ...stroke,
    id: nextStrokeId(),
  };
  drawState.ownIds.add(next.id);
  drawState.strokes.push(next);
  drawStroke(next);
  drawState.actions?.stroke?.(next);
}

/* Called by the app when the drawer wipes the board. */
export function clearDrawBoard() {
  drawState.strokes = [];
  drawState.ownIds.clear();
  drawState.buffer = [];
  redrawBoard();
}

/* Called by the app when a player joins or reconnects mid-turn. */
export function syncDrawBoard(payload) {
  if (!payload) return;
  const strokes = Array.isArray(payload.strokes) ? payload.strokes : [];

  // The server's list is the truth, but a stroke that is still on its way
  // is kept, so nothing the drawer has just drawn disappears.
  const known = new Set(strokes.map((entry) => entry.id));
  const inFlight = drawState.strokes.filter(
    (entry) => !known.has(entry.id) && drawState.ownIds.has(entry.id),
  );

  drawState.strokes = [...strokes, ...inFlight];
  redrawBoard();
}

export function resetDrawBoard() {
  drawState.strokes = [];
  drawState.ownIds.clear();
  drawState.buffer = [];
  drawState.turnKey = "";
}

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function startDrawClock() {
  if (drawState.clock) return;
  drawState.clock = setInterval(() => {
    const node = drawState.countdownNode;
    if (!node || !node.isConnected) return;
    const remaining = drawState.deadline - Date.now();
    node.textContent = formatClock(remaining);
    node.classList.toggle("is-urgent", remaining <= 10_000);
  }, 250);
}

/* The tools the drawer uses: the pen, the eraser, the fill, a straight
 * line and a box, the colour palette and the brush size. Only the drawer
 * sees it. */
function drawToolBar(actions) {
  const bar = el("div", "draw-tools");

  const tools = el("div", "draw-tool-row");
  for (const tool of DRAW_TOOLS) {
    const button = el("button", "draw-tool");
    button.type = "button";
    button.title = tool.label;
    button.setAttribute("aria-label", tool.label);
    button.append(icon(tool.icon, { size: 20 }));
    if (drawState.tool === tool.id) {
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    }
    button.addEventListener("click", () => {
      drawState.tool = tool.id;
      for (const other of tools.querySelectorAll(".draw-tool")) {
        other.classList.remove("is-active");
        other.removeAttribute("aria-pressed");
      }
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    });
    tools.append(button);
  }

  // Undo, redo and a bigger board.
  const extras = el("div", "draw-tool-row draw-extras");

  const undo = el("button", "draw-tool draw-tool-small");
  undo.type = "button";
  undo.title = "Undo the last stroke";
  undo.setAttribute("aria-label", "Undo the last stroke");
  undo.append(icon("undo", { size: 18 }));
  undo.addEventListener("click", () => drawState.actions?.undo?.());
  extras.append(undo);

  const redo = el("button", "draw-tool draw-tool-small");
  redo.type = "button";
  redo.title = "Redo the last stroke";
  redo.setAttribute("aria-label", "Redo the last stroke");
  redo.append(icon("redo", { size: 18 }));
  redo.addEventListener("click", () => redoDrawStroke());
  extras.append(redo);

  const expand = el("button", "draw-tool draw-tool-small");
  expand.type = "button";
  expand.title = "Make the board bigger";
  expand.setAttribute("aria-label", "Make the board bigger");
  expand.append(icon("maximize", { size: 18 }));
  expand.addEventListener("click", () => {
    drawState.expanded = !drawState.expanded;
    drawState.canvas?.classList.toggle("is-expanded", drawState.expanded);
    expand.classList.toggle("is-active", drawState.expanded);
    if (drawState.expanded) {
      drawState.canvas?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  });
  extras.append(expand);

  tools.append(extras);

  const palette = el("div", "draw-tool-row draw-palette");
  for (const color of DRAW_COLORS) {
    const swatch = el("button", "draw-color");
    swatch.type = "button";
    swatch.style.background = color;
    swatch.title = color;
    swatch.setAttribute("aria-label", `Colour ${color}`);
    if (drawState.color === color && drawState.tool !== "erase") {
      swatch.classList.add("is-active");
    }
    swatch.addEventListener("click", () => {
      drawState.color = color;
      if (drawState.tool === "erase") {
        drawState.tool = "pen";
        for (const other of tools.querySelectorAll(".draw-tool")) {
          other.classList.remove("is-active");
          other.removeAttribute("aria-pressed");
        }
        const pen = tools.querySelector(".draw-tool");
        pen?.classList.add("is-active");
        pen?.setAttribute("aria-pressed", "true");
      }
      for (const other of palette.querySelectorAll(".draw-color")) {
        other.classList.remove("is-active");
      }
      swatch.classList.add("is-active");
    });
    palette.append(swatch);
  }

  // Any colour at all, for the fussy.
  const custom = el("input", "draw-color-custom");
  custom.type = "color";
  custom.value = drawState.color;
  custom.title = "Pick any colour";
  custom.setAttribute("aria-label", "Pick any colour");
  custom.addEventListener("input", () => {
    drawState.color = custom.value;
    if (drawState.tool === "erase") drawState.tool = "pen";
    for (const other of palette.querySelectorAll(".draw-color")) {
      other.classList.remove("is-active");
    }
  });
  palette.append(custom);

  const sizes = el("div", "draw-tool-row draw-sizes");
  DRAW_SIZES.forEach((size, index) => {
    const dot = el("button", "draw-size");
    dot.type = "button";
    dot.title = `Brush ${index + 1}`;
    dot.setAttribute("aria-label", `Brush size ${index + 1}`);
    dot.style.setProperty("--dot", `${Math.max(5, size * 420)}px`);
    if (drawState.size === size) dot.classList.add("is-active");
    dot.addEventListener("click", () => {
      drawState.size = size;
      for (const other of sizes.querySelectorAll(".draw-size")) {
        other.classList.remove("is-active");
      }
      dot.classList.add("is-active");
    });
    sizes.append(dot);
  });

  bar.append(tools, palette, sizes);
  return bar;
}

function drawIt(state, game, mine, actions) {
  const nodes = [];
  drawState.actions = actions;
  drawState.canDraw = Boolean(mine?.canDraw);

  const turnKey = drawTurnKey(game);
  if (turnKey !== drawState.turnKey) {
    drawState.turnKey = turnKey;
    drawState.strokes = [];
    drawState.ownIds.clear();
    drawState.buffer = [];
    drawState.redoStack = [];
    drawState.shape = null;
    redrawBoard();
  }

  /* If the server has more strokes than this screen has, this player
   * joined or reconnected mid-turn. Ask for the drawing so far. */
  if ((game.strokeCount ?? 0) > drawState.strokes.length) {
    actions.requestSync?.();
  }

  if (game.phase === "setup") {
    nodes.push(
      block(
        blockTitle("Waiting for the host"),
        note(
          "The host picks how long each turn lasts, then the first player starts drawing.",
        ),
      ),
    );
    return nodes;
  }

  if (game.phase === "complete") {
    nodes.push(
      block(
        blockTitle("That's a wrap"),
        note("Every player has had a turn."),
      ),
    );
    nodes.push(scoreboard(state, game));
    if (state.public.playlist) nodes.push(sessionScoreboard(state));
    nodes.push(drawHistory(game));
    return nodes;
  }

  // The board itself. The head sits above it, so the clock is on screen
  // while the drawer is drawing.
  const head = el("div", "draw-head");
  const who = el("div", "draw-who");
  who.append(el("span", "draw-who-label", "Drawing now"));
  who.append(el("span", "draw-who-name", game.drawerName ?? "Someone"));
  const clock = el(
    "span",
    "draw-clock",
    formatClock(Math.max(0, (game.deadline ?? 0) - Date.now())),
  );
  head.append(who, clock);
  drawState.countdownNode = clock;
  drawState.deadline = game.deadline ?? 0;
  startDrawClock();

  const board = el("div", "draw-board");
  board.append(ensureDrawCanvas(game));

  nodes.push(head, board);

  if (mine.isDrawer) {
    /* The order here matters. The board comes first, because it is what
     * the drawer is looking at. The tools come next, because they are
     * what the drawer is reaching for. The word is pinned to the bottom
     * of the screen, so it stays in sight while the board is being drawn
     * on and the tools are being used. */
    nodes.push(drawToolBar(actions));

    const word = el("section", "draw-word");
    word.append(blockTitle("Your word"));
    word.append(el("p", "word-display", mine.yourWord?.text ?? "-"));
    word.append(
      el(
        "p",
        "draw-word-category",
        `Category: ${mine.yourWord?.category ?? "Fun"}. Never say it out loud.`,
      ),
    );
    nodes.push(word);

    const tools = el("div", "button-row");
    const undo = button("Undo", "btn btn-tonal");
    undo.addEventListener("click", () => {
      drawState.actions?.undo?.();
    });
    const clear = button("Clear the board", "btn btn-text");
    clear.addEventListener("click", () => {
      drawState.actions?.clearBoard?.();
    });
    tools.append(undo, clear);
    nodes.push(tools);
  } else if (mine.youGuessed) {
    nodes.push(
      block(
        blockTitle("You got it"),
        el("p", "game-note", "You found the word. Watch the board until the turn ends."),
      ),
    );
  } else {
    const form = block(blockTitle("Your guess"));
    const input = textInput("Type what you think it is", keyOf(game, "guess"), {
      maxLength: 60,
      autocomplete: "off",
      spellcheck: false,
    });
    form.append(input);
    const error = errorSlot();
    form.append(error);
    const hint = note("", "muted");
    hint.hidden = true;
    form.append(hint);
    const submit = button("Submit guess");
    formSubmit({
      button: submit,
      actions,
      errorNode: error,
      fallback: "Type a guess first.",
      read: () => {
        const value = input.value.trim();
        return value ? { type: "guess", text: value } : null;
      },
      onSuccess: (result) => {
        if (result?.correct) {
          clearDraft(keyOf(game, "guess"));
          input.disabled = true;
          submit.disabled = true;
          hint.hidden = true;
          return;
        }
        /* A wrong guess is not the end of it. The input is emptied and
         * stays open, so the next guess is one tap away. */
        clearDraft(keyOf(game, "guess"));
        input.value = "";
        input.focus();
        if (result?.mask && result.matched > 0) {
          hint.textContent = `Close. ${result.mask.replace(/_/g, "·")}`;
          hint.hidden = false;
        } else {
          hint.hidden = true;
        }
      },
    });
    form.append(submit);
    nodes.push(form);
  }

  /* The running list of guesses, shared by the whole room. It is the
   * heart of the game: everybody sees what everybody is thinking. */
  const guesses = drawGuessList(game);
  if (guesses) nodes.push(guesses);

  // The revealed tiles, and how close the room is.
  const tiles = el("div", "draw-tiles");
  if (mine.youGuessed) {
    tiles.append(el("span", "draw-tile is-found", "You got it"));
  } else if (game.phase === "reveal" && game.word) {
    tiles.append(el("span", "draw-tile is-found", game.word.text));
  }
  if (game.guessedCount > 0 && !mine.youGuessed) {
    tiles.append(
      el("span", "draw-tile", `${game.guessedCount} got it`),
    );
  }
  if (game.wrongCount > 0) {
    tiles.append(el("span", "draw-tile", `${game.wrongCount} wrong`));
  }
  if (tiles.childElementCount > 0) {
    nodes.push(block(blockTitle("The room"), tiles));
  }

  if (game.phase === "reveal") {
    const reveal = block(
      blockTitle("The word was"),
      el("p", "word-display", game.word?.text ?? "-"),
      note(
        game.result?.guessed
          ? `${game.drawerName} drew "${game.word?.text}".`
          : `Nobody got "${game.word?.text}" in time.`,
      ),
    );

    /* Who got it, and what it was worth. */
    const winners = game.result?.guessers ?? [];
    if (winners.length > 0) {
      const list = el("ul", "history-list");
      for (const winner of winners) {
        const row = el("li", "history-row");
        row.append(el("span", "player-name", winner.name));
        row.append(pill("+1", "badge badge-correct"));
        list.append(row);
      }
      reveal.append(list);
    }
    nodes.push(reveal);
  }

  nodes.push(scoreboard(state, game));
  if (state.public.playlist) nodes.push(sessionScoreboard(state));

  return nodes;
}

/* The running list of guesses.
 *
 * A wrong guess is shown as it was typed. A correct one is not: that text
 * is the word, and the word stays secret until the turn is over. */
function drawGuessList(game) {
  const entries = game.guessLog ?? [];
  if (entries.length === 0) return null;

  const list = el("ul", "draw-guesses");
  for (const entry of entries) {
    const item = el("li", "draw-guess");
    if (entry.correct) {
      item.classList.add("is-correct");
      item.append(el("span", "draw-guess-name", entry.playerName));
      item.append(el("span", "draw-guess-text", "got it!"));
    } else {
      item.append(el("span", "draw-guess-name", entry.playerName));
      item.append(el("span", "draw-guess-text", entry.text));
      if (entry.mask && entry.matched > 0) {
        item.append(el("span", "draw-guess-mask", entry.mask));
      }
    }
    list.append(item);
  }

  const wrapper = block(blockTitle("Guesses"), list);
  wrapper.classList.add("draw-guesses-block");
  return wrapper;
}

function drawHistory(game) {
  const rows = [...(game.history ?? [])].reverse();
  if (rows.length === 0) return null;

  const list = el("ul", "history-list");
  for (const row of rows) {
    const item = el("li", "history-row");
    item.append(el("span", "player-name", row.drawerName));
    item.append(el("span", "history-type", row.word));
    item.append(
      pill(
        row.guessed ? `${row.guesserCount} got it` : "Nobody",
        row.guessed ? "badge badge-correct" : "badge badge-wrong",
      ),
    );
    list.append(item);
  }
  return block(blockTitle("Turn history"), list);
}

function newSocialGame(state, game, mine, actions) {
  const nodes = [];
  const wrap = block(blockTitle(game.name));
  if (game.id === "emoji-guess") {
    wrap.append(el("p", "word-display", game.puzzle?.emoji ?? "❓"));
    wrap.append(note(`Solved: ${game.solvedCount ?? 0}/${game.totalPlayers ?? game.players.length}`));
    if (mine.canGuess) {
      const input = textInput("What do the emojis mean?", keyOf(game, "emoji"), { maxLength: 90 });
      const submit = button("Guess");
      formSubmit({ button: submit, actions, fallback: "Type a guess first.", read: () => input.value.trim() ? { type: "guess", guess: input.value.trim() } : null, onSuccess: () => { clearDraft(keyOf(game, "emoji")); input.value = ""; } });
      wrap.append(input, submit);
    } else if (mine.hasSolved) wrap.append(note("You solved it. Let the room catch up."));
    if (game.phase === "results" || game.phase === "complete") wrap.append(note(`Answer: ${game.answer ?? "revealed"}`));
  } else if (game.id === "would-you-rather") {
    wrap.append(note(game.optionA ?? "Option A"));
    if (mine.canVote) { wrap.append(button(game.optionA, "btn btn-primary", actOn(button("", "", null), actions, { type: "vote", choice: "a" }, "Choose an option."))); wrap.append(button(game.optionB, "btn btn-tonal", actOn(button("", "", null), actions, { type: "vote", choice: "b" }, "Choose an option."))); }
    else if (mine.canExplain) { const input=textarea("Why? (optional)",keyOf(game,"reason"),180); const submit=button("Share reason"); formSubmit({button:submit,actions,read:()=>({type:"explain",text:input.value}),fallback:"Skip or write a reason.",onSuccess:()=>clearDraft(keyOf(game,"reason"))}); wrap.append(input,submit); }
    else {
      wrap.append(note(`A: ${game.optionA}  •  B: ${game.optionB}`));
      /* The whole point of the game is hearing why people chose. The
       * reasons were collected and then never shown. */
      const counts = game.voteCounts;
      if (counts) {
        const tally = el("div", "vote-count-list");
        const rowA = el("div", "vote-count-row");
        rowA.append(el("span", "player-name", `A: ${game.optionA}`));
        rowA.append(el("span", "history-type", `${counts.a} chose this`));
        const rowB = el("div", "vote-count-row");
        rowB.append(el("span", "player-name", `B: ${game.optionB}`));
        rowB.append(el("span", "history-type", `${counts.b} chose this`));
        tally.append(rowA, rowB);
        wrap.append(tally);
      }
      if (game.results?.length) {
        const list = el("ul", "history-list");
        for (const reason of game.results) {
          const item = el("li", "history-row");
          item.append(el("span", "player-name", reason.playerName));
          item.append(el("span", "history-type", reason.text));
          list.append(item);
        }
        wrap.append(list);
      }
    }
  } else if (game.id === "caption-this") {
    wrap.append(note(game.prompt?.text ?? "Caption the scene"));
    if (mine.canCaption) { const input=textarea("Write a caption",keyOf(game,"caption"),160); const submit=button("Submit caption"); formSubmit({button:submit,actions,read:()=>input.value.trim()?{type:"caption",caption:input.value}:null,fallback:"Write a caption first.",onSuccess:()=>clearDraft(keyOf(game,"caption"))}); wrap.append(input,submit); }
    if (game.captions?.length) {
      for (const caption of game.captions) {
        /* A caption of your own is not a caption you can vote for. It
         * used to be a button that looked live and did nothing when
         * tapped, so it is marked as yours and switched off. */
        const own = caption.text === mine.yourCaption;
        const canPick = Boolean(mine.canVote) && caption.id !== mine.yourCaptionId;
        const node = button(
          own ? `${caption.text} (your caption)` : caption.text,
          canPick ? "btn btn-tonal" : "btn btn-tonal is-muted",
          canPick
            ? actOn(
                button("", "", null),
                actions,
                { type: "vote", captionId: caption.id },
                "Choose a caption.",
              )
            : null,
        );
        if (!canPick) node.disabled = true;
        wrap.append(node);
      }
    }
    /* The tallies only come out when the round is over. Before that the
     * captions are buttons to vote on, and afterwards they are the
     * result, with the votes and the bonus. */
    if (game.result?.length) {
      const list = el("ul", "history-list");
      for (const row of game.result) {
        const item = el("li", "history-row");
        item.append(el("span", "player-name", row.authorName));
        item.append(el("span", "history-type", row.text));
        item.append(
          pill(
            `${row.votes} vote${row.votes === 1 ? "" : "s"}${row.bonus ? " +2" : ""}`,
            row.bonus ? "badge badge-correct" : "badge",
          ),
        );
        list.append(item);
      }
      wrap.append(list);
    }
  } else if (game.id === "two-truths-one-lie") {
    if (mine.canSubmit) {
      const inputs=[0,1,2].map(i=>textarea(`Statement ${i+1}`,keyOf(game,`statement-${i}`),140));
      const select=el("select","field-input");
      [0,1,2].forEach(i=>{const o=el("option","",`Statement ${i+1} is the lie`);o.value=String(i);select.append(o);});
      bindSelect(select,keyOf(game,"lie"));
      const submit=button("Submit statements");
      formSubmit({button:submit,actions,read:()=>({type:"statements",statements:inputs.map(i=>i.value),lieIndex:Number(select.value)}),fallback:"Write all three statements.",onSuccess:()=>inputs.forEach(i=>i.value="")});
      wrap.append(...inputs,select,submit);
    } else {
      /* The statements are the whole game. They were published but
       * never shown, so a player had to guess which one was the lie
       * without being able to read them. */
      /* The public view publishes this one as "results". */
      const outcome = game.results;
      const statements = game.statements ?? [];
      if (statements.length) {
        wrap.append(note(`${game.storytellerName ?? "Someone"} says:`));
        const list = el("ul", "history-list");
        statements.forEach((text, index) => {
          const item = el("li", "history-row");
          item.append(el("span", "player-name", `Statement ${index + 1}`));
          item.append(el("span", "history-type", text));
          if (outcome && outcome.lieIndex === index) {
            item.append(pill("the lie", "badge badge-wrong"));
          }
          list.append(item);
        });
        wrap.append(list);
      }
      if (mine.canGuess) {
        [0,1,2].forEach(i=>wrap.append(button(`Statement ${i+1} is the lie`,"btn btn-tonal",actOn(button("", "", null),actions,{type:"guess",statementIndex:i},"Choose a statement."))));
      }
      if (outcome) {
        wrap.append(
          note(
            outcome.correctCount === 1
              ? `${outcome.storytellerName} fooled one of you.`
              : `${outcome.storytellerName} fooled ${outcome.correctCount} of you.`,
          ),
        );
      } else if (!mine.canGuess) {
        wrap.append(waiting("Waiting for the room…"));
      }
    }
  } else {
    if (mine.canReady) wrap.append(button("I’m ready", "btn btn-primary", actOn(button("","",null),actions,{type:"ready"},"Ready failed.")));
    if (mine.location) wrap.append(el("p","word-display",mine.location.name));
    if (mine.canVote) game.players.filter(p=>p.id!==state.you.playerId).forEach(p=>wrap.append(button(p.name,"btn btn-tonal",actOn(button("","",null),actions,{type:"vote",targetId:p.id},"Choose a player."))));
    if (game.phase === "results" || game.phase === "complete") {
      const result = game.result;
      if (result?.location?.name) wrap.append(note(`Location: ${result.location.name}`));
      if (result?.spyName) {
        wrap.append(
          note(
            result.caught
              ? `${result.spyName} was the spy, and the room caught them.`
              : `${result.spyName} was the spy, and got away with it.`,
          ),
        );
      }
    }
  }
  nodes.push(wrap);
  if (game.phase === "results" || game.phase === "complete") nodes.push(scoreboard(state, game));
  return nodes;
}

const RENDERERS = {
  "act-it-out": actItOut,
  "draw-it": drawIt,
  "one-of-us": oneOfUs,
  "who-is-it": whoIsIt,
  "who-am-i": turnGuess,
  "where-am-i": turnGuess,
  "who-wrote-that": whoWroteThat,
  "truth-or-dare": truthOrDare,
  "emoji-guess": newSocialGame,
  "caption-this": newSocialGame,
  "spyfall": newSocialGame,
  "would-you-rather": newSocialGame,
  "two-truths-one-lie": newSocialGame,
};

/* The leave button sits at the bottom of the screen, well away from the
 * game, because it is a button people can press by accident. */
function gameFooter(actions) {
  const foot = el("div", "game-footer");
  if (actions.onLeave) {
    const leave = button("Leave this room", "btn btn-tonal btn-leave", actions.onLeave);
    foot.append(leave);
  }
  return foot;
}

/* Puts the new content on screen. The DOM is only replaced when the result
 * actually changed, so a broadcast from another player cannot wipe the text
 * you are typing or steal the focus from your input. */
function paint(root, nodes, focus) {
  const stage = document.createElement("div");
  for (const node of nodes) {
    if (node) stage.append(node);
  }

  if (stage.innerHTML === root.innerHTML) {
    restoreFocus(root, focus);
    return;
  }

  root.replaceChildren(...stage.childNodes);
  restoreFocus(root, focus);
}

export function renderGameScreen(root, state, actions) {
  const game = state?.public?.game ?? null;
  const focus = captureFocus(root);
  const nodes = [];

  if (!game) {
    if (state?.public?.phase === "between") {
      nodes.push(...playlistBreak(state));
    } else {
      nodes.push(waiting("Starting the game…"));
    }
    nodes.push(gameFooter(actions));
    paint(root, nodes, focus);
    return;
  }

  if (state?.you?.spectator) {
    nodes.push(...spectatorScreen(state));
    nodes.push(gameFooter(actions));
    paint(root, nodes, focus);
    return;
  }

  const mine = state.you?.game ?? {};
  nodes.push(gameHeader(state, game));

  // Drafts from an earlier run of this game (or an earlier game in a
  // playlist) can never be submitted again, so drop them.
  pruneDrafts(game);

  const renderer = RENDERERS[game.id];
  if (renderer) {
    const rendered = renderer(state, game, mine, actions).filter(Boolean);
    // A phase the screen does not know about must never render as a blank
    // page.
    if (rendered.length === 0) {
      rendered.push(note("Waiting for the host…"));
    }
    nodes.push(...rendered);
  } else {
    nodes.push(note("This game screen is not available yet."));
  }

  nodes.push(gameFooter(actions));
  paint(root, nodes, focus);
}
