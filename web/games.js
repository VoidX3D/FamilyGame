/* Player-side game screens. Every screen is rendered from server state:
 * no secret ever lives in this file, and no timer is started here. */

const drafts = new Map();

const PHASE_LABELS = {
  reveal: "Reveal your role",
  clues: "Clue round",
  discuss: "Discussion",
  vote: "Voting",
  "imposter-guess": "The imposter guesses",
  guess: "Guessing",
  act: "Acting",
  results: "Results",
  complete: "Final results",
  writing: "Writing answers",
  guessing: "Guessing authors",
  collect: "Write your prompts",
  play: "Turns",
  between: "Between games",
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

function waiting(text) {
  return el("p", "game-wait", text);
}

function initials(name) {
  const parts = String(name ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
}

function toneClass(playerId) {
  let hash = 0;
  for (const char of String(playerId ?? "")) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  }
  return `tone-${hash % 6}`;
}

function avatar(name, id) {
  const node = el("span", `avatar ${toneClass(id)}`, initials(name));
  node.setAttribute("aria-hidden", "true");
  return node;
}

function youBadge() {
  return el("span", "you-badge", "You");
}

function playerRow(name, id, right = []) {
  const row = el("li", "player-row game-player-row");
  add(row, avatar(name, id), el("span", "player-name", name));
  if (id) row.dataset.playerId = id;
  for (const node of right) {
    if (node) row.append(node);
  }
  return row;
}

function pill(text, className = "pill") {
  return el("span", className, text);
}

function keyOf(game, field) {
  return `${game.id}|${game.round}|${game.phase}|${field}`;
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
    Promise.resolve(actions.send(payload)).catch((error) => {
      node.disabled = false;
      actions.toast(error?.message || fallback || "That action did not work.");
    });
  };
}

function phaseLabel(game) {
  if (game.phase === "guess") {
    if (game.contentType === "place") return "Place clues";
    if (game.contentType === "person") return "Person clues";
  }
  return PHASE_LABELS[game.phase] ?? "In progress";
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

  const list = el("ul", "score-list");
  rows.forEach((row, index) => {
    const item = el("li", "score-row");
    if (!row.inGame && playlistMode) item.classList.add("is-spectator");

    item.append(el("span", "score-rank", String(index + 1)));
    item.append(avatar(row.name, row.id));
    item.append(el("span", "player-name", row.name));
    if (row.id === state.you?.playerId) item.append(youBadge());
    if (!row.inGame && playlistMode) item.append(pill("Sat out", "pill"));
    item.append(el("span", "score-points", String(row.points)));
    if (playlistMode) {
      item.append(
        el("span", "session-points", `${row.session} session`),
      );
    }
    list.append(item);
  });

  return block(blockTitle(title), list);
}

function sessionScoreboard(state, title = "Game night totals") {
  const players = state.public.players ?? [];
  if (players.length === 0) return null;

  const rows = players
    .map((player) => ({
      ...player,
      session: state.public.sessionScores?.[player.id] ?? 0,
    }))
    .sort(
      (a, b) => b.session - a.session || a.name.localeCompare(b.name),
    );

  const list = el("ul", "score-list");
  rows.forEach((row, index) => {
    const item = el("li", "score-row");
    item.append(el("span", "score-rank", String(index + 1)));
    item.append(avatar(row.name, row.id));
    item.append(el("span", "player-name", row.name));
    if (row.id === state.you?.playerId) item.append(youBadge());
    item.append(el("span", "score-points", String(row.session)));
    list.append(item);
  });

  return block(blockTitle(title), list);
}

function voteChoices(state, game, actions, type = "vote", label = "Vote") {
  const list = el("div", "choice-list");
  for (const player of game.players ?? []) {
    if (player.id === state.you?.playerId) continue;
    const node = el("button", "choice");
    node.type = "button";
    node.append(avatar(player.name, player.id), el("span", "choice-name", player.name));
    node.append(el("span", "choice-action", label));
    node.addEventListener("click", actOn(node, actions, { type, targetId: player.id }));
    list.append(node);
  }
  return list;
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
        actOn(ready, actions, { type: "ready" }),
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

  if (game.phase === "clues") {
    nodes.push(roleWordCard(game, mine));
    if (mine.yourClue) {
      nodes.push(block(blockTitle("Your clue"), note(mine.yourClue)));
      nodes.push(
        waiting(`${game.clueCount} of ${game.totalPlayers} clues submitted.`),
      );
    } else {
      const form = block(blockTitle("Give one clue"));
      form.append(
        note("One short clue about the word. Do not say the word itself."),
      );
      const input = textInput("e.g. steamed, spicy, folded", keyOf(game, "clue"), {
        maxLength: 90,
      });
      form.append(input);
      const submit = button("Submit clue");
      submit.addEventListener("click", () => {
        const value = input.value.trim();
        if (!value) {
          actions.toast("Write a clue first.");
          return;
        }
        submit.disabled = true;
        Promise.resolve(actions.send({ type: "clue", clue: value })).catch(
          (error) => {
            submit.disabled = false;
            actions.toast(error?.message || "That clue did not go through.");
          },
        );
      });
      form.append(submit);
      nodes.push(form);
    }
  }

  if (game.phase === "discuss") {
    nodes.push(block(blockTitle("Clues from the room"), clueList(game)));
    nodes.push(note("Talk it through. The host will start the vote."));
    nodes.push(waiting("Waiting for the host to open voting…"));
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
          note("Vote for the player you think is faking it."),
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
      const submit = button("Submit guess");
      submit.addEventListener("click", () => {
        const value = input.value.trim();
        if (!value) {
          actions.toast("Type your guess first.");
          return;
        }
        submit.disabled = true;
        Promise.resolve(actions.send({ type: "guess", guess: value })).catch(
          (error) => {
            submit.disabled = false;
            actions.toast(error?.message || "That guess did not go through.");
          },
        );
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
    const banner = el("section", `result-banner ${crewWon ? "is-win" : "is-loss"}`);
    banner.append(
      el("h3", "result-title", crewWon ? "Crew wins!" : "Imposter wins!"),
    );
    banner.append(
      note(
        crewWon
          ? `${game.imposterName} was caught.`
          : `${game.imposterName} fooled the room.`,
      ),
    );
    nodes.push(banner);

    const reveal = block(blockTitle("The reveal"));
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
    nodes.push(reveal);
    nodes.push(
      note(
        mine.isImposter
          ? "You were the imposter."
          : "You were part of the crew.",
      ),
    );
    nodes.push(scoreboard(state, game));
    nodes.push(
      game.phase === "complete"
        ? waiting("All rounds are complete. The host can play again.")
        : waiting("Waiting for the host to start the next round…"),
    );
  }

  return nodes;
}

function clueList(game) {
  const list = el("ul", "clue-list");
  if (!Array.isArray(game.clues) || game.clues.length === 0) {
    list.append(el("li", "empty-state", "No clues yet."));
    return list;
  }
  for (const clue of game.clues) {
    const item = el("li", "clue-row");
    item.append(avatar(clue.name, clue.playerId));
    const copy = el("div", "clue-copy");
    copy.append(el("p", "player-name", clue.name));
    copy.append(el("p", "clue-text", clue.text));
    item.append(copy);
    list.append(item);
  }
  return list;
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
          blockTitle(game.topNames.length === 1 ? "The room picked" : "The room picked"),
          el("p", "top-names", game.topNames.join(" · ")),
        ),
      );
    }
    nodes.push(block(blockTitle("Every vote"), countList(game.results?.counts)));
    if (game.results?.voters?.length) {
      const details = el("details", "vote-breakdown");
      details.append(el("summary", null, "See who voted for whom"));
      const list = el("ul", "vote-count-list");
      for (const vote of game.results.voters) {
        const item = el("li", "vote-count-row");
        item.append(el("span", "player-name", vote.voterName));
        item.append(el("span", "vote-count", `Voted for ${vote.targetName}`));
        list.append(item);
      }
      details.append(list);
      nodes.push(details);
    }
    nodes.push(scoreboard(state, game));
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
        actOn(skip, actions, { type: "skipPrompt" }),
      );
      const give = button("Give up", "btn btn-text");
      give.addEventListener("click", actOn(give, actions, { type: "giveUp" }));
      controls.append(skip, give);
      nodes.push(controls);

      const choices = block(
        blockTitle("Who guessed it first?"),
        note("Tap the first correct guesser. You both score 1."),
      );
      const list = el("div", "choice-list");
      for (const player of mine.guessChoices ?? []) {
        const node = el("button", "choice");
        node.type = "button";
        node.append(
          avatar(player.name, player.id),
          el("span", "choice-name", player.name),
        );
        node.append(el("span", "choice-action", "Correct"));
        node.addEventListener(
          "click",
          actOn(node, actions, { type: "correct", playerId: player.id }),
        );
        list.append(node);
      }
      choices.append(list);
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
      next.addEventListener("click", actOn(next, actions, { type: "next" }));
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
      give.addEventListener("click", actOn(give, actions, { type: "giveUp" }));
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

  if (game.phase === "reveal" || game.phase === "complete") {
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
      next.addEventListener("click", actOn(next, actions, { type: "next" }));
      nodes.push(next);
    } else if (game.phase === "complete") {
      nodes.push(waiting("Waiting for the host."));
    } else {
      nodes.push(
        waiting(
          `${result?.playerName ?? "The guesser"} will start the next turn when ready.`,
        ),
      );
    }
  }

  if (game.phase === "complete") {
    nodes.push(turnHistory(game));
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
      const submit = button("Submit answer");
      submit.addEventListener("click", () => {
        const value = input.value.trim();
        if (!value) {
          actions.toast("Write an answer first.");
          return;
        }
        submit.disabled = true;
        Promise.resolve(actions.send({ type: "answer", answer: value })).catch(
          (error) => {
            submit.disabled = false;
            actions.toast(error?.message || "That answer did not go through.");
          },
        );
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
          select.append(el("option", null, "Choose an author…"));
          for (const player of game.players ?? []) {
            if (player.id === state.you?.playerId) continue;
            const option = el("option", null, player.name);
            option.value = player.id;
            select.append(option);
          }
          bindSelect(select, keyOf(game, `guess-${answer.id}`));
          const saved = mine.yourGuesses?.[answer.id];
          if (saved) select.value = saved;
          card.append(select);
        }
        list.append(card);
      });
      form.append(list);
      const submit = button("Submit my guesses");
      submit.addEventListener("click", () => {
        const guesses = {};
        let missing = false;
        for (const select of list.querySelectorAll("select[data-answer]")) {
          if (!select.value) missing = true;
          guesses[select.dataset.answer] = select.value;
        }
        if (missing) {
          actions.toast("Pick an author for every answer.");
          return;
        }
        submit.disabled = true;
        Promise.resolve(actions.send({ type: "guesses", guesses })).catch(
          (error) => {
            submit.disabled = false;
            actions.toast(error?.message || "Those guesses did not go through.");
          },
        );
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
      submit.addEventListener("click", () => {
        const truthValue = truth.value.trim();
        const dareValue = dare.value.trim();
        if (!truthValue || !dareValue) {
          actions.toast("Write both a truth and a dare.");
          return;
        }
        submit.disabled = true;
        Promise.resolve(
          actions.send({ type: "submit", truth: truthValue, dare: dareValue }),
        ).catch((error) => {
          submit.disabled = false;
          actions.toast(error?.message || "Those prompts did not go through.");
        });
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
      done.addEventListener("click", actOn(done, actions, { type: "done" }));
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
  const list = el("ul", "history-list");
  for (const turn of [...(game.history ?? [])].reverse()) {
    const item = el("li", "history-row");
    item.append(el("span", "player-name", turn.name));
    item.append(el("span", "history-type", turn.type));
    if (turn.skipped) item.append(pill("Skipped"));
    list.append(item);
  }
  return block(blockTitle("Turn history"), list);
}

const RENDERERS = {
  "act-it-out": actItOut,
  "one-of-us": oneOfUs,
  "who-is-it": whoIsIt,
  "who-am-i": turnGuess,
  "where-am-i": turnGuess,
  "who-wrote-that": whoWroteThat,
  "truth-or-dare": truthOrDare,
};

function gameFooter(actions) {
  const foot = el("div", "game-footer");
  if (actions.onLeave) {
    const leave = button("Leave room", "btn btn-text", actions.onLeave);
    foot.append(leave);
  }
  return foot;
}

export function renderGameScreen(root, state, actions) {
  const game = state?.public?.game ?? null;
  const focus = captureFocus(root);
  root.replaceChildren();

  if (state?.you?.spectator) {
    for (const node of spectatorScreen(state)) {
      if (node) root.append(node);
    }
    root.append(gameFooter(actions));
    restoreFocus(root, focus);
    return;
  }

  if (!game) {
    if (state?.public?.phase === "between") {
      for (const node of playlistBreak(state)) {
        if (node) root.append(node);
      }
    } else {
      root.append(waiting("Starting the game…"));
    }
    root.append(gameFooter(actions));
    restoreFocus(root, focus);
    return;
  }

  const mine = state.you?.game ?? {};
  root.append(gameHeader(state, game));

  const renderer = RENDERERS[game.id];
  if (renderer) {
    for (const node of renderer(state, game, mine, actions)) {
      if (node) root.append(node);
    }
  } else {
    root.append(note("This game screen is not available yet."));
  }

  root.append(gameFooter(actions));
  restoreFocus(root, focus);
}
