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

try {
  await checkServers();

  const admin = await makeDriver(1280, 900);
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
    "dynamic game catalog",
  );
  await waitFor(
    admin,
    `/^[A-Z2-9]{5}$/.test(document.getElementById("admin-code").textContent.trim())`,
    "room code",
  );
  const code = await text(admin, "#admin-code");

  const names = ["Aarati", "Bikash", "Chhaya"];
  const players = [];
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
    try {
      await waitFor(
        player,
        `!document.getElementById("name-form").hidden`,
        `${name} name form`,
      );
    } catch (error) {
      const diag = await player.executeScript(
        `return {
           view: document.body.dataset.view,
           codeError: document.getElementById("code-error").textContent,
           codeErrorHidden: document.getElementById("code-error").hidden,
           banner: document.getElementById("connection-banner").textContent,
           bannerHidden: document.getElementById("connection-banner").hidden,
           errors: window.__FG_ERRORS,
           adminCode: document.getElementById("admin-code")?.textContent ?? ""
         };`,
      );
      console.error(`Join diagnostics for ${name}:`, diag);
      console.error(
        "Admin player count:",
        await text(admin, "#hero-player-count"),
      );
      console.error("Admin hint:", await text(admin, "#start-hint"));
      await screenshot(player, `join-fail-${name}`);
      throw error;
    }
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
    "three players in admin",
  );
  await waitFor(
    admin,
    `(() => {
       const card = [...document.querySelectorAll("#game-grid .game-card")]
         .find((entry) => entry.querySelector("h3")?.textContent === "One of Us");
       return card && !card.querySelector(".game-start")?.disabled;
     })()`,
    "start button enabled",
  );

  await admin.executeScript(`window.confirm = () => true; return true;`);
  const started = await admin.executeScript(
    `const card = [...document.querySelectorAll("#game-grid .game-card")]
       .find((entry) => entry.querySelector("h3")?.textContent === "One of Us");
     card?.querySelector(".game-start")?.click();
     return Boolean(card);`,
  );
  assert(started, "Could not click One of Us start");

  for (const player of players) {
    await waitFor(
      player,
      `document.querySelectorAll("#step-game .role-card").length === 1`,
      "role card",
    );
  }

  const roles = await Promise.all(
    players.map((player) =>
      player.executeScript(
        `return document.querySelector("#step-game .role-title")?.textContent.trim() ?? "";`,
      ),
    ),
  );
  assert(
    roles.filter((role) => role === "Imposter").length === 1,
    `Expected exactly one imposter, got ${roles.join(", ")}`,
  );
  assert(
    roles.filter((role) => role === "Crew").length === 2,
    `Expected two crew players, got ${roles.join(", ")}`,
  );

  await screenshot(players[0], "game-role");

  for (const player of players) {
    const clicked = await clickText(
      player,
      "#step-game button",
      "Got it, I'm ready",
    );
    assert(clicked, "Could not ready a player");
  }

  // The room votes for the same person, so the game is deterministic. The
  // imposter is whoever their own screen says they are; the room does not
  // know that, and the vote is made against the name on the button.
  // The role card is only on screen during the reveal and clue phases, so
  // the imposter has to be identified now, before the last clue is sent.
  let imposterName = null;
  for (let index = 0; index < players.length; index += 1) {
    const role = await players[index].executeScript(
      `return document.querySelector("#step-game .role-title")?.textContent?.trim() ?? "";`,
    );
    if (role === "Imposter") {
      imposterName = names[index];
      break;
    }
  }
  assert(imposterName, "No player was shown the imposter role");

  for (const [index, player] of players.entries()) {
    await waitFor(
      player,
      `Boolean(document.querySelector('#step-game input[data-field*="|clue"]'))`,
      `clue input ${index + 1}`,
    );
    await player.executeScript(
      `const input = document.querySelector('#step-game input[data-field*="|clue"]');
       input.value = arguments[0];
       input.dispatchEvent(new Event("input", { bubbles: true }));
       const submit = [...document.querySelectorAll("#step-game button")]
         .find((node) => node.textContent.includes("Submit clue"));
       submit?.click();
       return true;`,
      `A clue from ${names[index]}`,
    );
  }

  await waitFor(
    admin,
    `[...document.querySelectorAll("#game-controls button")]
       .some((node) => node.textContent.trim() === "Start voting")`,
    "start voting control",
  );
  const voteClicked = await clickText(
    admin,
    "#game-controls button",
    "Start voting",
  );
  assert(voteClicked, "Could not start voting");

  for (const [index, player] of players.entries()) {
    await waitFor(
      player,
      `document.querySelectorAll("#step-game .choice").length > 0`,
      "vote choices",
    );
    // Nobody may vote for themselves, so the imposter votes for anyone else.
    const clicked = await player.executeScript(
      `const wanted = arguments[0];
       const choices = [...document.querySelectorAll("#step-game .choice")];
       const choice = wanted
         ? choices.find((node) => node.textContent.includes(wanted))
         : choices[0];
       choice?.click();
       return Boolean(choice);`,
      names[index] === imposterName ? "" : imposterName,
    );
    assert(clicked, `Could not vote for ${imposterName}`);
  }

  const guesser = await findDriverWith(
    players,
    '#step-game input[data-field*="|imposter-guess"]',
  );
  assert(guesser, "The imposter guess input was not found");
  if (guesser) {
    await guesser.executeScript(
      `const input = document.querySelector('#step-game input[data-field*="|imposter-guess"]');
       input.value = "not the word";
       input.dispatchEvent(new Event("input", { bubbles: true }));
       const submit = [...document.querySelectorAll("#step-game button")]
         .find((node) => node.textContent.includes("Submit guess"));
       submit?.click();
       return true;`,
    );
  }

  for (const player of players) {
    await waitFor(
      player,
      `document.querySelectorAll("#step-game .result-banner").length === 1`,
      "round result",
    );
    const word = await text(player, "#step-game .word-display");
    assert(word.length > 0, "Reveal screen did not show the secret word");
  }

  await screenshot(players[0], "game-results");
  await screenshot(admin, "admin-game");

  const resultViewports = [
    { name: "small phone 320x568", width: 320, height: 568 },
    { name: "Redmi 360x640", width: 360, height: 640 },
    { name: "iPhone 390x844", width: 390, height: 844 },
    { name: "Samsung 412x915", width: 412, height: 915 },
    { name: "iPad 768x1024", width: 768, height: 1024 },
    { name: "iPad Air 820x1180", width: 820, height: 1180 },
    { name: "laptop 1366x768", width: 1366, height: 768 },
    { name: "laptop 1440x900", width: 1440, height: 900 },
    { name: "landscape phone 640x360", width: 640, height: 360 },
  ];
  for (const viewport of resultViewports) {
    await setViewport(players[0], viewport.width, viewport.height);
    await assertNoOverflow(players[0], `results ${viewport.name}`);
  }
  await setViewport(players[0], 390, 844);

  const nextClicked = await clickText(
    admin,
    "#game-controls button",
    "Next round",
  );
  assert(nextClicked, "Could not advance to the next round");

  await waitFor(
    players[0],
    `[...document.querySelectorAll("#step-game .pill")]
       .some((node) => node.textContent.trim() === "Round 2 of 3")`,
    "round two",
  );

  await setViewport(players[0], 320, 568);
  await assertNoOverflow(players[0], "game 320x568");
  await setViewport(players[0], 390, 844);

  await sleep(200);
  await admin.executeScript(`window.confirm = () => true; return true;`);
  await admin.executeScript(
    `document.getElementById("end-game").click(); return true;`,
  );
  await waitFor(
    admin,
    `!document.getElementById("game-catalog-card").hidden`,
    "catalog after ending game",
  );
  for (const player of players) {
    await waitFor(
      player,
      `!document.getElementById("step-lobby").hidden`,
      "lobby after game",
    );
  }

  await admin.executeScript(
    `document.getElementById("toggle-lock").click(); return true;`,
  );
  await waitFor(
    admin,
    `document.getElementById("room-lock").textContent.trim() === "Locked"`,
    "room locked",
  );

  const late = await makeDriver(390, 844);
  drivers.push(late);
  await late.get(`${WEB}/`);
  await waitFor(late, 'window.__FG_READY__ === "player"', "late player ready");
  await waitFor(
    late,
    `!document.getElementById("code-submit").disabled`,
    "late player socket connected",
  );
  await fillAndSubmit(late, "room-code", code, "code-form");
  await waitFor(
    late,
    `!document.getElementById("code-error").hidden`,
    "locked room error",
  );
  const lockedError = await text(late, "#code-error");
  assert(/locked/i.test(lockedError), `Unexpected locked message: ${lockedError}`);
  const lateErrors = await late.executeScript(
    `return Array.isArray(window.__FG_ERRORS) ? window.__FG_ERRORS : [];`,
  );
  assert(lateErrors.length === 0, `Late browser errors: ${lateErrors.join(" | ")}`);
  await late.quit();
  const lateIndex = drivers.indexOf(late);
  if (lateIndex >= 0) drivers.splice(lateIndex, 1);

  await admin.executeScript(
    `document.getElementById("toggle-lock").click(); return true;`,
  );
  await waitFor(
    admin,
    `document.getElementById("room-lock").textContent.trim() === "Open"`,
    "room unlocked",
  );

  for (const [index, driver] of drivers.entries()) {
    const errors = await driver.executeScript(
      `return Array.isArray(window.__FG_ERRORS) ? window.__FG_ERRORS : [];`,
    );
    assert(
      errors.length === 0,
      `Browser ${index + 1} reported errors: ${errors.join(" | ")}`,
    );
  }

  console.log("game ui smoke ok (chrome)");
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
