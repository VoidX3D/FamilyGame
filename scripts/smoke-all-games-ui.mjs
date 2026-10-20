import {
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
    `document.querySelectorAll("#game-grid .game-card").length === 7`,
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
