/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* Puts the local copy of the generated backend branch back in step with
 * the server.
 *
 * The `backend` branch is published by a workflow, not by hand. It used to
 * be force pushed, which means a clone that already has the old history
 * cannot be merged with it: git stops with "need to specify how to
 * reconcile divergent branches" or "refusing to merge unrelated
 * histories".
 *
 * There is nothing to merge. The branch is an output, so the right move is
 * to take the server's version and drop the local one. This does that,
 * and it is safe to run at any time.
 *
 *   node scripts/sync-backend.mjs
 */

import { spawnSync } from "node:child_process";

const BRANCH = "backend";

function run(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  if (result.status !== 0 && !allowFailure) {
    console.error(`git ${args.join(" ")} failed:\n${output}`);
    process.exit(1);
  }

  return { ok: result.status === 0, output };
}

const current = run(["rev-parse", "--abbrev-ref", "HEAD"], {
  allowFailure: true,
}).output;

console.log("Updating the generated backend branch…");

const fetched = run(["fetch", "origin", BRANCH], { allowFailure: true });
if (!fetched.ok) {
  console.error(
    `Could not fetch origin/${BRANCH}. Check the remote and your access to it.`,
  );
  process.exit(1);
}

// Take the server's version of the branch, whatever the local history is.
run(["branch", "--force", BRANCH, `origin/${BRANCH}`]);

if (current === BRANCH) {
  // The branch is checked out here, so the working tree has to follow it.
  run(["reset", "--hard", `origin/${BRANCH}`]);
}

const head = run(["rev-parse", "--short", `origin/${BRANCH}`]).output;
const local = run(["rev-parse", "--short", BRANCH]).output;

console.log(`\n${BRANCH} is now at ${local} (the server is at ${head}).`);
console.log(
  current === BRANCH
    ? "Your working copy matches the server. Run the install and start steps again."
    : `Run "git checkout ${BRANCH}" to look at the server copy.`,
);
