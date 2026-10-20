/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

export const WEB = process.env.WEB_URL || "http://localhost:5173";
export const API = process.env.API_URL || "http://localhost:3000";
export const SHOTS = process.env.SCREENSHOT_DIR || path.resolve(".shots");
export const PASSCODE = await loadPasscode();

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadPasscode() {
  if (process.env.ADMIN_PASSCODE?.trim()) {
    return process.env.ADMIN_PASSCODE.trim();
  }

  try {
    const envFile = await readFile(path.resolve("server/.env"), "utf8");
    const line = envFile
      .split(/\r?\n/)
      .find((entry) => entry.startsWith("ADMIN_PASSCODE="));
    const value = line?.slice("ADMIN_PASSCODE=".length).trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  } catch {
    // Fall through to the generated passcode.
  }

  // The server makes a passcode when none is configured and keeps it here.
  try {
    const generated = (
      await readFile(path.resolve("server/data/admin-passcode"), "utf8")
    ).trim();
    if (generated) return generated;
  } catch {
    // Fall through to the error below.
  }

  throw new Error(
    "ADMIN_PASSCODE is not set. Add it to the environment, or start the " +
      "server once so it generates one (npm run passcode shows it).",
  );
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function makeDriver(width = 1280, height = 900) {
  const options = new chrome.Options().addArguments(
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--window-size=${width},${height}`,
  );
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  await driver.manage().setTimeouts({
    implicit: 0,
    pageLoad: 25000,
    script: 15000,
  });

  if (width < 700) {
    await setViewport(driver, width, height);
  }

  return driver;
}

export async function setViewport(driver, width, height) {
  if (width < 700) {
    await driver.sendDevToolsCommand("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
  } else {
    await driver.sendDevToolsCommand("Emulation.clearDeviceMetricsOverride");
    await driver.manage().window().setRect({ width, height });
  }
  await sleep(180);
}

export async function waitFor(driver, expression, label, timeout = 15000) {
  try {
    await driver.wait(async () => {
      try {
        return Boolean(
          await driver.executeScript(`return Boolean(${expression});`),
        );
      } catch {
        return false;
      }
    }, timeout, label);
  } catch (error) {
    throw new Error(`Timed out waiting for ${label}: ${error?.message ?? error}`);
  }
}

export async function fillAndSubmit(driver, inputId, value, formId) {
  await driver.executeScript(
    `const input = document.getElementById(arguments[0]);
     input.value = arguments[1];
     input.dispatchEvent(new Event("input", { bubbles: true }));
     document.getElementById(arguments[2]).requestSubmit();
     return true;`,
    inputId,
    value,
    formId,
  );
}

export async function text(driver, selector) {
  return driver.executeScript(
    `return document.querySelector(arguments[0])?.textContent?.trim() ?? "";`,
    selector,
  );
}

export async function clickText(driver, selector, label) {
  return driver.executeScript(
    `const node = [...document.querySelectorAll(arguments[0])]
       .find((candidate) => candidate.textContent.trim() === arguments[1]);
     if (!node) return false;
     node.click();
     return true;`,
    selector,
    label,
  );
}

export async function screenshot(driver, name) {
  try {
    await mkdir(SHOTS, { recursive: true });
    const image = await driver.takeScreenshot();
    await writeFile(path.join(SHOTS, `${name}.png`), image, "base64");
  } catch (error) {
    console.warn(`Could not save screenshot ${name}: ${error.message}`);
  }
}

export async function checkServers() {
  let backend;
  try {
    backend = await fetch(`${API}/healthz`);
  } catch {
    throw new Error(
      `Backend is not reachable at ${API}. Start it with "npm run dev:server" first.`,
    );
  }
  assert(backend.ok, `Backend health check failed (${backend.status}).`);

  let web;
  try {
    web = await fetch(`${WEB}/`);
  } catch {
    throw new Error(
      `Web preview is not reachable at ${WEB}. Start it with "npm run dev:web" first.`,
    );
  }
  assert(web.ok, `Web preview health check failed (${web.status}).`);
}

export async function browserErrors(driver) {
  return driver.executeScript(
    `return Array.isArray(window.__FG_ERRORS) ? window.__FG_ERRORS : [];`,
  );
}

export async function assertNoBrowserErrors(drivers) {
  for (const [index, driver] of drivers.entries()) {
    const errors = await browserErrors(driver);
    assert(
      errors.length === 0,
      `Browser ${index + 1} reported errors: ${errors.join(" | ")}`,
    );
  }
}

export async function assertNoOverflow(driver, label) {
  const metrics = await driver.executeScript(
    `return {
       innerWidth: window.innerWidth,
       scrollWidth: document.documentElement.scrollWidth,
     };`,
  );
  assert(
    metrics.scrollWidth <= metrics.innerWidth + 1,
    `${label}: horizontal overflow ${JSON.stringify(metrics)}`,
  );
}
