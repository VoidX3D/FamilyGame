import {
  PASSCODE,
  SHOTS,
  WEB,
  assert,
  assertNoBrowserErrors,
  assertNoOverflow,
  checkServers,
  fillAndSubmit,
  makeDriver,
  setViewport,
  sleep,
  text,
  waitFor,
} from "./ui-driver.mjs";

const drivers = [];

try {
  await checkServers();

  const admin = await makeDriver(1440, 1000);
  drivers.push(admin);

  await admin.get(`${WEB}/admin?passcode=should-not-be-used`);
  await waitFor(admin, 'window.__FG_READY__ === "admin"', "admin ready");
  await waitFor(
    admin,
    '!document.getElementById("admin-login").hidden',
    "admin login",
  );

  const stripped = await admin.executeScript(
    `return {
       search: location.search,
       path: location.pathname,
       passcode: document.getElementById("passcode").value,
       theme: Boolean(document.querySelector("[data-theme-choice]")),
     };`,
  );
  assert(stripped.search === "", `Passcode remained in URL: ${stripped.search}`);
  assert(stripped.passcode === "", "URL passcode was accepted by the form");
  assert(stripped.path === "/admin", `Unexpected login path: ${stripped.path}`);
  assert(!stripped.theme, "Removed theme control is still rendered");

  await fillAndSubmit(admin, "passcode", "wrong-passcode", "login-form");
  await waitFor(
    admin,
    '!document.getElementById("login-error").hidden',
    "invalid passcode error",
  );
  assert(
    /incorrect|passcode/i.test(await text(admin, "#login-error")),
    "Invalid passcode did not show a clear error",
  );

  await fillAndSubmit(admin, "passcode", PASSCODE, "login-form");
  await waitFor(
    admin,
    '!document.getElementById("admin-dashboard").hidden',
    "admin dashboard",
  );
  await waitFor(
    admin,
    `/^[A-Z2-9]{5}$/.test(document.getElementById("admin-code").textContent.trim())`,
    "room code",
  );

  const code = await text(admin, "#admin-code");
  const invite = await text(admin, "#admin-join-url");
  assert(invite === `${WEB}/g/${code}`, `Unexpected invite URL: ${invite}`);

  for (const [tab, route] of [
    ["playlist", "/admin/playlist"],
    ["live", "/admin/session"],
    ["content", "/admin/content"],
    ["settings", "/admin/config"],
    ["room", "/admin/room"],
  ]) {
    await admin.executeScript(
      `document.querySelector('[data-admin-tab="${tab}"]').click(); return true;`,
    );
    await waitFor(
      admin,
      `location.pathname === ${JSON.stringify(route)}`,
      `${tab} route`,
    );
    const active = await admin.executeScript(
      `return document.querySelector(".admin-nav-item.is-active")?.dataset.adminTab;`,
    );
    assert(active === tab, `${tab} route did not activate its tab: ${active}`);
  }

  await admin.executeScript(
    `document.querySelector('[data-admin-tab="playlist"]').click(); return true;`,
  );
  await waitFor(
    admin,
    `location.pathname === "/admin/playlist"`,
    "playlist route",
  );
  await admin.navigate().refresh();
  await waitFor(
    admin,
    `location.pathname === "/admin/playlist" && !document.getElementById("admin-dashboard").hidden`,
    "direct admin route after refresh",
  );

  for (const [label, width, height] of [
    ["laptop 1440", 1440, 1000],
    ["desktop 1920", 1920, 1080],
    ["phone 390", 390, 844],
    ["phone 360", 360, 800],
  ]) {
    await setViewport(admin, width, height);
    await assertNoOverflow(admin, label);
  }
  await setViewport(admin, 1440, 1000);

  const names = ["Aarati", "Bikash", "Chhaya"];
  const players = [];

  for (const [index, name] of names.entries()) {
    const player = await makeDriver(390, 844);
    drivers.push(player);
    players.push(player);
    await player.get(`${WEB}/g/${code}`);
    await waitFor(player, 'window.__FG_READY__ === "player"', `${name} ready`);
    await waitFor(
      player,
      '!document.getElementById("name-form").hidden',
      `${name} invite verified`,
    );

    const inviteState = await player.executeScript(
      `return {
         path: location.pathname,
         code: document.getElementById("room-code").value,
         pending: document.getElementById("pending-code").textContent.trim(),
       };`,
    );
    assert(
      inviteState.code === code && inviteState.pending === code,
      `${name} invite did not prefill the room: ${JSON.stringify(inviteState)}`,
    );

    if (index === 0) {
      await waitFor(
        player,
        '!document.getElementById("code-submit").disabled',
        "player socket connected",
      );
      await assertNoOverflow(player, "player join 390");
      await setViewport(player, 320, 568);
      await assertNoOverflow(player, "player join 320");
      await setViewport(player, 390, 844);
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
    "three players in admin roster",
  );
  await waitFor(
    players[0],
    `document.querySelectorAll("#lobby-players .player-row").length === 3`,
    "three players in player lobby",
  );

  const lobbyNames = await players[0].executeScript(
    `return [...document.querySelectorAll("#lobby-players .player-name")].map((node) => node.textContent);`,
  );
  assert(
    names.every((name) => lobbyNames.includes(name)),
    `Player list mismatch: ${lobbyNames.join(", ")}`,
  );
  assert(
    (await text(players[0], "#lobby-status")) ===
      "Everyone is here. Waiting for the host.",
    "Lobby status is wrong with three connected players",
  );

  const adminCount = await text(admin, "#hero-player-count");
  assert(adminCount === "3 / 10", `Unexpected admin count: ${adminCount}`);

  const youBadge = await players[0].executeScript(
    `return document.querySelector("#lobby-players .player-row.is-you .you-badge")?.textContent ?? "";`,
  );
  assert(youBadge === "You", "Current player was not marked in the lobby");
  await assertNoOverflow(players[0], "player lobby 390");

  await players[1].navigate().refresh();
  await waitFor(
    players[1],
    'window.__FG_READY__ === "player"',
    "player refresh ready",
  );
  await waitFor(
    players[1],
    `document.querySelectorAll("#lobby-players .player-row").length === 3`,
    "resumed lobby after refresh",
  );
  await waitFor(
    admin,
    `document.getElementById("hero-player-count").textContent.trim() === "3 / 10"`,
    "admin still sees three seats after refresh",
  );

  await admin.executeScript(`window.confirm = () => true; return true;`);
  const clickedRemove = await admin.executeScript(
    `const row = [...document.querySelectorAll("#admin-players .player-row")]
       .find((candidate) => candidate.querySelector(".player-name")?.textContent === "Chhaya");
     if (!row) return false;
     row.querySelector(".remove-player")?.click();
     return true;`,
  );
  assert(clickedRemove, "Could not find Chhaya's remove button");

  await waitFor(
    admin,
    `document.getElementById("hero-player-count").textContent.trim() === "2 / 10"`,
    "player removed in admin",
  );
  await waitFor(
    players[2],
    '!document.getElementById("code-form").hidden',
    "removed player returned to join screen",
  );
  assert(
    /removed/i.test(await text(players[2], "#code-error")),
    "Removed player did not get a clear message",
  );

  await admin.executeScript(`window.confirm = () => true; return true;`);
  await admin.executeScript(
    `document.getElementById("reset-room").click(); return true;`,
  );
  await waitFor(
    admin,
    `(() => {
       const next = document.getElementById("admin-code").textContent.trim();
       return /^[A-Z2-9]{5}$/.test(next) && next !== ${JSON.stringify(code)};
     })()`,
    "new room code",
  );
  await waitFor(
    players[0],
    '!document.getElementById("code-form").hidden',
    "player returned to join screen after reset",
  );
  assert(
    /closed/i.test(await text(players[0], "#code-error")),
    "Closed room did not show a clear message",
  );
  const newCode = await text(admin, "#admin-code");

  await admin.executeScript(
    `document.getElementById("logout").click(); return true;`,
  );
  await waitFor(
    admin,
    '!document.getElementById("admin-login").hidden',
    "admin login after logout",
  );
  const token = await admin.executeScript(
    `return sessionStorage.getItem("fg:adminToken");`,
  );
  assert(token === null, "Admin token survived logout");

  const missing = await makeDriver(900, 800);
  drivers.push(missing);
  await missing.get(`${WEB}/missing-page`);
  await waitFor(
    missing,
    'document.title.includes("Page not found")',
    "custom 404 page",
  );
  await missing.get(`${WEB}/admin/not-a-real-tab`);
  await waitFor(
    missing,
    'document.title.includes("Page not found")',
    "unknown admin route 404",
  );
  await missing.get(`${WEB}/g/${newCode}`);
  await waitFor(
    missing,
    '!document.getElementById("name-form").hidden',
    "short invite link after reset",
  );

  for (const driver of drivers.slice(0, 4)) {
    await assertNoBrowserErrors([driver]);
  }

  await sleep(100);
  console.log("ui smoke ok (chrome)");
  console.log(`screenshots: ${SHOTS}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const driver of drivers) {
    try {
      await driver.quit();
    } catch {
      // The browser may already have closed.
    }
  }
}
