/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* Puts a local copy of the repository back in step with the server.
 *
 * Two things go wrong on a machine that has been pulling for a while:
 *
 * 1. The generated `backend` branch used to be force pushed, so a clone
 *    with the old history cannot be merged with it. Git stops with
 *    "need to specify how to reconcile divergent branches" or "refusing
 *    to merge unrelated histories". There is nothing to merge: the branch
 *    is an output, so the fix is to take the server's version.
 *
 * 2. A file that was edited on the machine, such as a settings file the
 *    panel made, stops a pull with "your local changes would be
 *    overwritten". Those edits are set aside rather than thrown away.
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

// If something was edited on this machine, set it aside rather than losing
// it. A pull cannot run with those changes in the way.
let stashed = false;
if (current === BRANCH) {
  const dirty = run(["status", "--porcelain"], { allowFailure: true }).output;
  if (dirty.trim()) {
    run(["stash", "push", "-u", "-m", "sync-backend: local changes"], {
      allowFailure: true,
    });
    stashed = true;
    console.log("Your local changes were set aside (git stash).");
  }
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

if (stashed) {
  console.log("Your edits are still there. Bring them back with: git stash pop");
}

console.log(
  current === BRANCH
    ? "Your working copy matches the server. Run the install and start steps again."
    : `Run "git checkout ${BRANCH}" to look at the server copy.`,
);
