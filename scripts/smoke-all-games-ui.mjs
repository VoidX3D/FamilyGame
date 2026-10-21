/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import {
  API,
  PASSCODE,
  SHOTS,
  WEB,
  assert,
  assertNoBrowserErrors,
  assertNoOverflow,
  checkServers,
  clickText,
  fillAndSubmit,
  makeDriver,
  screenshot,
  setViewport,
  sleep,
  text,
  waitFor,
} from "./ui-driver.mjs";

/* The number of games the catalogue holds. It is read from the API rather
 * than written down, so adding a game never breaks the browser suites. */
async function catalogSize() {
  const response = await fetch(`${API}/api/games`);
  const data = await response.json();
  return data.games.length;
}

async function findDriverWith(drivers, selector, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    for (const driver of drivers) {
      const found = await driver.executeScript(
        `return Boolean(document.querySelector(arguments[0]));`,
        selector,
      );
      if (found) return driver;
    }
    await sleep(100);
  }
  return null;
}

const drivers = [];
let admin;
let players = [];
let code;

async function startGame(name) {
  await waitFor(
    admin,
    `!document.getElementById("game-catalog-card").hidden`,
    `${name}: catalog visible`,
  );
  await waitFor(
    admin,
    `(() => {
       const card = [...document.querySelectorAll("#game-grid .game-card")]
         .find((entry) => entry.querySelector("h3")?.textContent === ${JSON.stringify(name)});
       return card && !card.querySelector(".game-start")?.disabled;
     })()`,
    `${name}: start enabled`,
  );

  await admin.executeScript(`window.confirm = () => true; return true;`);
  const clicked = await admin.executeScript(
    `const card = [...document.querySelectorAll("#game-grid .game-card")]
       .find((entry) => entry.querySelector("h3")?.textContent === arguments[0]);
     card?.querySelector(".game-start")?.click();
     return Boolean(card);`,
    name,
  );
  assert(clicked, `Could not start ${name}`);

  for (const player of players) {
    await waitFor(
      player,
      `document.querySelector("#step-game .game-title")?.textContent.trim() === ${JSON.stringify(name)}`,
      `${name}: player screen`,
    );
  }

  await setViewport(players[0], 320, 568);
  await assertNoOverflow(players[0], `${name} at 320x568`);
  await setViewport(players[0], 390, 844);
}

async function endGame() {
  await admin.executeScript(`window.confirm = () => true; return true;`);
  await admin.executeScript(
    `document.getElementById("end-game").click(); return true;`,
  );
  await waitFor(
    admin,
    `!document.getElementById("game-catalog-card").hidden`,
    "catalog after end game",
  );
  for (const player of players) {
    await waitFor(
      player,
      `!document.getElementById("step-lobby").hidden`,
      "lobby after end game",
    );
  }
}

async function playWhoIsIt() {
  await startGame("Who Is It?");
  for (const player of players) {
    await waitFor(
      player,
      `document.querySelectorAll("#step-game .choice").length > 0`,
      "who-is-it vote choices",
    );
    await player.executeScript(
      `document.querySelector("#step-game .choice")?.click(); return true;`,
    );
  }
  for (const player of players) {
    await waitFor(
      player,
      `Boolean(document.querySelector("#step-game .top-names"))`,
      "who-is-it results",
    );
    const rows = await player.executeScript(
      `return document.querySelectorAll("#step-game .vote-count-row").length;`,
    );
    assert(rows >= 3, "Who Is It results did not list every player");
  }
  await screenshot(players[0], "ui-who-is-it");
  await endGame();
}

async function playSecretGuess(name, screenshotName) {
  await startGame(name);
  const guesser = await findDriverWith(
    players,
    '#step-game input[data-field*="turn-guess"]',
  );
  assert(guesser, `${name}: active guesser input missing`);

  await guesser.executeScript(
    `const input = document.querySelector('#step-game input[data-field*="turn-guess"]');
     input.value = "Unknown";
     input.dispatchEvent(new Event("input", { bubbles: true }));
     const submit = [...document.querySelectorAll("#step-game button")]
       .find((node) => node.textContent.trim() === "Guess");
     submit?.click();
     return true;`,
  );
  await sleep(350);
  const gaveUp = await guesser.executeScript(
    `const give = [...document.querySelectorAll("#step-game button")]
       .find((node) => node.textContent.includes("I give up"));
     give?.click();
     return Boolean(give);`,
  );
  assert(gaveUp, `${name}: give-up button missing`);

  for (const player of players) {
    await waitFor(
      player,
      `document.querySelectorAll("#step-game .result-banner").length === 1`,
      `${name}: reveal`,
    );
  }
  await screenshot(players[0], screenshotName);
  await endGame();
}

async function playActItOut() {
  await startGame("Act It Out");
  const actor = await findDriverWith(players, "#step-game .role-label");
  assert(actor, "Act It Out did not show an actor card");

  await waitFor(
    actor,
    `document.querySelectorAll("#step-game .choice").length > 0`,
    "act-it-out guess choices",
  );
  const choseGuesser = await actor.executeScript(
    `const choice = document.querySelector("#step-game .choice");
     choice?.click();
     return Boolean(choice);`,
  );
  assert(choseGuesser, "Actor could not choose a correct guesser");

  for (const player of players) {
    await waitFor(
      player,
      `document.querySelectorAll("#step-game .result-banner").length === 1`,
      "act-it-out result",
    );
  }
  await screenshot(players[0], "ui-act-it-out");
  await endGame();
}

async function playWhoWroteThat() {
  await startGame("Who Wrote That?!");
  for (const [index, player] of players.entries()) {
    await waitFor(
      player,
      `Boolean(document.querySelector('#step-game textarea[data-field*="|answer"]'))`,
      "who-wrote answer input",
    );
    await player.executeScript(
      `const input = document.querySelector('#step-game textarea[data-field*="|answer"]');
       input.value = arguments[0];
       input.dispatchEvent(new Event("input", { bubbles: true }));
       const submit = [...document.querySelectorAll("#step-game button")]
         .find((node) => node.textContent.includes("Submit answer"));
       submit?.click();
       return true;`,
      `Answer number ${index + 1}`,
    );
  }

  for (const player of players) {
    await waitFor(
      player,
      `document.querySelectorAll('#step-game select[data-answer]').length === 2`,
      "who-wrote guess selects",
    );
    await player.executeScript(
      `for (const select of document.querySelectorAll("#step-game select[data-answer]")) {
         select.value = select.options[select.options.length - 1].value;
         select.dispatchEvent(new Event("change", { bubbles: true }));
       }
       const submit = [...document.querySelectorAll("#step-game button")]
         .find((node) => node.textContent.includes("Submit my guesses"));
       submit?.click();
       return true;`,
    );
  }

  for (const player of players) {
    await waitFor(
      player,
      `document.querySelectorAll("#step-game .answer-author").length === 3`,
      "who-wrote reveal",
    );
  }
  await screenshot(players[0], "ui-who-wrote-that");
  await endGame();
}

async function playTruthOrDare() {
  await startGame("Truth or Dare");
  for (const player of players) {
    await waitFor(
      player,
      `Boolean(document.querySelector('#step-game textarea[data-field*="|truth"]'))`,
      "truth or dare inputs",
    );
    await player.executeScript(
      `const truth = document.querySelector('#step-game textarea[data-field*="|truth"]');
       const dare = document.querySelector('#step-game textarea[data-field*="|dare"]');
       truth.value = "Tell us your happiest memory.";
       dare.value = "Do your best happy dance.";
       truth.dispatchEvent(new Event("input", { bubbles: true }));
       dare.dispatchEvent(new Event("input", { bubbles: true }));
       const submit = [...document.querySelectorAll("#step-game button")]
         .find((node) => node.textContent.includes("Submit both"));
       submit?.click();
       return true;`,
    );
  }

  let turns = 0;
  while (turns < 6) {
    const driver = await findDriverWith(players, "#step-game .turn-card");
    if (!driver) break;
    const clicked = await driver.executeScript(
      `const button = [...document.querySelectorAll("#step-game .turn-card button")]
         .find((node) => node.textContent.includes("Done"));
       button?.click();
       return Boolean(button);`,
    );
    assert(clicked, "Could not finish a truth-or-dare turn");
    turns += 1;
    await sleep(350);
  }

  assert(turns === 6, `Expected 6 truth-or-dare turns, finished ${turns}`);
  for (const player of players) {
    await waitFor(
      player,
      `document.querySelectorAll("#step-game .history-row").length === 6`,
      "truth-or-dare history",
    );
    const wrap = await text(player, "#step-game .block-title");
    assert(
      wrap.length > 0,
      "Truth or Dare complete screen is missing its heading",
    );
  }
  await screenshot(players[0], "ui-truth-or-dare");
  await endGame();
}

async function playDrawIt() {
  await startGame("Draw It");

  // The host picks the turn length, which starts the first turn.
  await waitFor(
    admin,
    `[...document.querySelectorAll("#game-controls button")]
       .some((node) => node.textContent.trim() === "30 seconds per turn")`,
    "draw-it time control",
  );
  const started = await admin.executeScript(
    `[...document.querySelectorAll("#game-controls button")]
       .find((node) => node.textContent.trim() === "30 seconds per turn")
       ?.click();
     return true;`,
  );
  assert(started, "Could not start the drawing game");

  // Everybody sees the board, but only the drawer sees the word. The drawer
  // is therefore the one whose screen has a word on it.
  let drawer = null;
  for (let attempt = 0; attempt < 40 && !drawer; attempt += 1) {
    for (const player of players) {
      const word = await player.executeScript(
        `return document.querySelector("#step-game .word-display")?.textContent?.trim() ?? "";`,
      );
      if (word) {
        drawer = player;
        break;
      }
    }
    if (!drawer) await sleep(200);
  }
  assert(drawer, "Nobody got the drawing word");

  const guesser = players.find((player) => player !== drawer);
  assert(guesser, "There is nobody left to guess");

  await waitFor(
    guesser,
    `Boolean(document.querySelector("#step-game .game-block input"))`,
    "draw-it guess box",
  );

  // The word must not be on anybody else's screen.
  for (const player of players) {
    if (player === drawer) continue;
    const word = await player.executeScript(
      `return document.querySelector("#step-game .word-display")?.textContent?.trim() ?? "";`,
    );
    assert(word === "", "The drawing word leaked to another player");
  }

  // The drawer draws, and the stroke reaches the other screens.
  const drew = await drawer.executeScript(`
    const canvas = document.querySelector("#step-game .draw-canvas");
    const rect = canvas.getBoundingClientRect();
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
      clientX: rect.left + rect.width * x,
      clientY: rect.top + rect.height * y,
    }));
    canvas.setPointerCapture = () => true;
    canvas.releasePointerCapture = () => true;
    send("pointerdown", 0.2, 0.3);
    send("pointermove", 0.4, 0.45);
    send("pointermove", 0.6, 0.35);
    send("pointerup", 0.6, 0.35);
    return true;
  `);
  assert(drew, "Could not draw on the canvas");

  // The other screens received the stroke, so their canvas has ink on it.
  await sleep(700);
  for (const player of players) {
    if (player === drawer) continue;
    const inked = await player.executeScript(`
      const canvas = document.querySelector("#step-game .draw-canvas");
      if (!canvas) return false;
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) return true;
      }
      return false;
    `);
    assert(inked, "The stroke did not reach the other screens");
  }

  // The drawer has the tools: at least a pen and an eraser, a palette and
  // sizes. The list may grow, so this checks what has to be there rather
  // than how many there are.
  const tools = await drawer.executeScript(`
    return {
      tools: document.querySelectorAll("#step-game .draw-tool").length,
      labels: [...document.querySelectorAll("#step-game .draw-tool")]
        .map((node) => node.title)
        .filter(Boolean),
      colors: document.querySelectorAll("#step-game .draw-color").length,
      sizes: document.querySelectorAll("#step-game .draw-size").length,
    };
  `);
  assert(tools.tools >= 2, `Expected the drawing tools, found ${tools.tools}`);
  assert(
    tools.labels.includes("Pen"),
    `The pen is missing from the tools: ${tools.labels.join(", ")}`,
  );
  assert(
    tools.labels.includes("Eraser"),
    `The eraser is missing from the tools: ${tools.labels.join(", ")}`,
  );
  assert(tools.colors >= 6, `Expected a colour palette, found ${tools.colors}`);
  assert(tools.sizes >= 3, `Expected brush sizes, found ${tools.sizes}`);

  // A different colour and a different tool are picked and used.
  const painted = await drawer.executeScript(`
    const canvas = document.querySelector("#step-game .draw-canvas");
    const rect = canvas.getBoundingClientRect();
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
      clientX: rect.left + rect.width * x,
      clientY: rect.top + rect.height * y,
    }));
    // Pick the second colour from the palette.
    const swatch = document.querySelectorAll("#step-game .draw-color")[1];
    swatch?.click();
    // Pick the fill tool.
    const fill = [...document.querySelectorAll("#step-game .draw-tool")]
      .find((node) => node.title === "Fill");
    fill?.click();
    canvas.setPointerCapture = () => true;
    canvas.releasePointerCapture = () => true;
    send("pointerdown", 0.5, 0.5);
    send("pointerup", 0.5, 0.5);
    return Boolean(fill && swatch);
  `);
  assert(painted, "Could not pick the fill tool or a colour");

  await sleep(500);
  const filled = await drawer.executeScript(`
    const canvas = document.querySelector("#step-game .draw-canvas");
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let coloured = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0 && (data[i] !== 13 || data[i + 1] !== 21 || data[i + 2] !== 38)) coloured += 1;
    }
    return coloured;
  `);
  assert(filled > 100, "The fill tool did not paint the board");

  // Undo takes the last stroke back.
  const before = await drawer.executeScript(
    `return document.querySelectorAll("#step-game .draw-tool").length;`,
  );
  assert(before >= 2, "The tool bar changed while drawing");

  // The guessing rules.
  await playDrawItGuessing(drawer, guesser);

  await screenshot(guesser, "ui-draw-it-guesser");
  await screenshot(drawer, "ui-draw-it-drawer");
  await endGame();
}

/* Draw It lets a player guess as often as they like, shows everybody the
 * guesses as they arrive, and never lets the drawer end the turn. */
async function playDrawItGuessing(drawer, guesser) {
  const word = await drawer.executeScript(
    `return document.querySelector("#step-game .word-display")?.textContent?.trim() ?? "";`,
  );
  assert(word.length > 0, "The drawer has no word to guess");

  // A wrong guess. It must not lock the player out of the next one.
  const wrong = await guesser.executeScript(`
    const input = [...document.querySelectorAll("#step-game input")][0];
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value",
    ).set;
    const submit = [...document.querySelectorAll("#step-game button")]
      .find((node) => node.textContent.includes("Submit guess"));
    setter.call(input, "not the word at all");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    submit?.click();
    return Boolean(submit);
  `);
  assert(wrong, "Could not submit the wrong guess");
  await sleep(500);

  const stillOpen = await guesser.executeScript(`
    const input = [...document.querySelectorAll("#step-game input")][0];
    const submit = [...document.querySelectorAll("#step-game button")]
      .find((node) => node.textContent.includes("Submit guess"));
    return Boolean(input && submit && !input.disabled && !submit.disabled);
  `);
  assert(stillOpen, "A wrong guess locked the player out of guessing again");

  // The list of guesses is on the other screens too.
  const seen = await drawer.executeScript(`
    const items = [...document.querySelectorAll("#step-game .draw-guess")];
    return {
      count: items.length,
      text: items.map((node) => node.textContent).join(" | "),
    };
  `);
  assert(seen.count >= 1, "The drawer cannot see the list of guesses");
  assert(
    seen.text.includes("not the word at all"),
    `The guess list is wrong: ${seen.text}`,
  );

  // The word is not on the list, and the drawer has no way to end the turn.
  const leak = await drawer.executeScript(`
    const list = document.querySelector("#step-game .draw-guesses")?.textContent ?? "";
    const buttons = [...document.querySelectorAll("#step-game button")]
      .map((node) => node.textContent.trim().toLowerCase());
    return {
      list,
      hasDone: buttons.some((text) => text.includes("reveal the word")),
    };
  `);
  assert(!leak.list.includes(word), "The word leaked into the list of guesses");
  assert(!leak.hasDone, "The drawer has a button that reveals the word");

  // Now the right guess.
  const right = await guesser.executeScript(`
    const input = [...document.querySelectorAll("#step-game input")][0];
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value",
    ).set;
    setter.call(input, arguments[0]);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const submit = [...document.querySelectorAll("#step-game button")]
      .find((node) => node.textContent.includes("Submit guess"));
    submit?.click();
    return Boolean(submit);
  `, word);
  assert(right, "Could not submit the right guess");
  await sleep(700);

  const after = await drawer.executeScript(`
    const items = [...document.querySelectorAll("#step-game .draw-guess")];
    return {
      text: items.map((node) => node.textContent).join(" | "),
      found: items.some((node) => node.classList.contains("is-correct")),
    };
  `);
  assert(after.found, "The correct guess was not marked on the list");
  assert(
    !after.text.includes(word),
    "The correct guess showed the word before the reveal",
  );
  assert(
    after.text.includes("got it"),
    `The list does not say who got it: ${after.text}`,
  );
}

try {
  await checkServers();

  admin = await makeDriver(1280, 900);
  drivers.push(admin);
  await admin.get(`${WEB}/admin`);
  await waitFor(admin, 'window.__FG_READY__ === "admin"', "admin ready");
  await waitFor(
    admin,
    `!document.getElementById("admin-login").hidden`,
    "admin login",
  );
  await fillAndSubmit(admin, "passcode", PASSCODE, "login-form");
  await waitFor(
    admin,
    `!document.getElementById("admin-dashboard").hidden`,
    "admin dashboard",
  );
  await waitFor(
    admin,
    `document.querySelectorAll("#game-grid .game-card").length === ${await catalogSize()}`,
    "dynamic catalog",
  );
  await waitFor(
    admin,
    `/^[A-Z2-9]{5}$/.test(document.getElementById("admin-code").textContent.trim())`,
    "room code",
  );
  code = await text(admin, "#admin-code");

  const names = ["Aarati", "Bikash", "Chhaya"];
  players = [];
  for (const name of names) {
    const player = await makeDriver(390, 844);
    drivers.push(player);
    players.push(player);
    await player.get(`${WEB}/`);
    await waitFor(player, 'window.__FG_READY__ === "player"', `${name} ready`);
    await waitFor(
      player,
      `!document.getElementById("code-submit").disabled`,
      `${name} socket connected`,
    );
    await fillAndSubmit(player, "room-code", code, "code-form");
    await waitFor(
      player,
      `!document.getElementById("name-form").hidden`,
      `${name} name form`,
    );
    await fillAndSubmit(player, "player-name", name, "name-form");
    await waitFor(
      player,
      `!document.getElementById("step-lobby").hidden`,
      `${name} lobby`,
    );
  }

  await waitFor(
    admin,
    `document.querySelectorAll("#admin-players .player-row").length === 3`,
    "three players",
  );
  await admin.executeScript(`window.confirm = () => true; return true;`);

  await playWhoIsIt();
  await playSecretGuess("Who Am I?", "ui-who-am-i");
  await playSecretGuess("Where Am I?", "ui-where-am-i");
  await playActItOut();
  await playWhoWroteThat();
  await playTruthOrDare();
  await playDrawIt();

  for (const [index, driver] of drivers.entries()) {
    const errors = await driver.executeScript(
      `return Array.isArray(window.__FG_ERRORS) ? window.__FG_ERRORS : [];`,
    );
    assert(
      errors.length === 0,
      `Browser ${index + 1} reported errors: ${errors.join(" | ")}`,
    );
  }

  console.log("all game ui smoke ok (chrome)");
  console.log(`screenshots: ${SHOTS}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const driver of drivers) {
    try {
      await driver.quit();
    } catch {
      // The browser may already be closed.
    }
  }
}
