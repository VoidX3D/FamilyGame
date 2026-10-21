/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* Sets the topics and the description of the GitHub repository.
 *
 * The GitHub API needs a token for this, so it is not part of the normal
 * test suite. Make a token with the `repo` scope at
 * https://github.com/settings/tokens and run it once:
 *
 *   GITHUB_TOKEN=ghp_yourtoken node scripts/github-topics.mjs
 *
 * On Windows PowerShell:
 *
 *   $env:GITHUB_TOKEN="ghp_yourtoken"; node scripts/github-topics.mjs
 */

import { DEPLOYED_WEB } from "../web/endpoints.js";

const REPO = process.env.GITHUB_REPO ?? "VoidX3D/FamilyGame";
const TOKEN = process.env.GITHUB_TOKEN ?? "";

const TOPICS = [
  "party-game",
  "multiplayer",
  "socket-io",
  "family-game",
  "game-night",
  "pictionary",
  "drawing-game",
  "vanilla-js",
  "express",
  "websocket",
  "no-build-step",
  "self-hosted",
  "private-games",
];

const DESCRIPTION =
  "A private, browser-based party game hub for the family. Eight games, " +
  "one room engine, a host console and a content editor. No accounts, " +
  "no tracking, no database.";

if (!TOKEN) {
  console.error(
    "No GITHUB_TOKEN. Make one at https://github.com/settings/tokens with " +
      "the repo scope, then run this again.",
  );
  process.exit(1);
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "family-game-hub",
  "Content-Type": "application/json",
};

async function send(url, method, body) {
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

const topics = await send(
  `https://api.github.com/repos/${REPO}/topics`,
  "PUT",
  { names: TOPICS },
);
console.log(
  topics.ok
    ? `Topics set: ${TOPICS.join(", ")}`
    : `Could not set the topics (${topics.status}): ${topics.text}`,
);

const description = await send(`https://api.github.com/repos/${REPO}`, "PATCH", {
  description: DESCRIPTION,
  homepage: DEPLOYED_WEB,
  topics: TOPICS,
});
console.log(
  description.ok
    ? "Description and homepage set."
    : `Could not set the description (${description.status}): ${description.text}`,
);
