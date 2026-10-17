#!/usr/bin/env node

/**
 * Git pre-push hook (.husky/pre-push).
 *
 *   development  quick local gate: typecheck (+ API contract) of the affected
 *                apps, ~1 min, no jest. The full unit suites run in CI and
 *                gate the staging deploy (.github/workflows/deploy-staging.yml).
 *   master       nothing heavy runs locally. master moves through a PR
 *                development -> master whose "Verify / *" checks are the full
 *                gate, and Release Production re-runs it before deploying.
 *                A direct push only prints a reminder.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const ZERO_SHA = /^0+$/;

export function parsePushLines(input) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    })
    .filter(
      (push) =>
        push.localRef && push.localSha && push.remoteRef && push.remoteSha,
    );
}

/**
 * Pushes that run the local gate. Deletions (all-zero local sha) and pushes to
 * any other branch run nothing.
 */
export function developmentPushes(pushes) {
  return pushes.filter(
    (push) =>
      !ZERO_SHA.test(push.localSha) &&
      push.remoteRef === "refs/heads/development",
  );
}

export function masterPushes(pushes) {
  return pushes.filter(
    (push) =>
      !ZERO_SHA.test(push.localSha) && push.remoteRef === "refs/heads/master",
  );
}

/**
 * The local gate verifies the working tree, so the pushed commit must have the
 * checked-out tree. Returns the block message, or undefined when they match.
 */
export function treeMismatchError(push, headTree, treeOf) {
  if (treeOf(push.localSha) === headTree) {
    return undefined;
  }
  return `Push blocked: ${push.remoteRef} would receive ${push.localSha.slice(0, 12)}, but the checked-out tree differs, so the local checks would verify the wrong code. Check out the commit you push (or push HEAD) and retry.`;
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function verifyDevelopmentPush(push) {
  console.log("\nRunning local development push verification.\n");
  return run(process.execPath, [
    join(SCRIPT_DIR, "verify-local.mjs"),
    "push",
    "--base",
    push.remoteSha,
    "--head",
    push.localSha,
  ]);
}

function runCli() {
  const pushes = parsePushLines(readFileSync(0, "utf8"));
  const development = developmentPushes(pushes);

  if (masterPushes(pushes).length > 0) {
    console.log(
      "\nPushing to master directly. The intended path is a PR development -> master: " +
        'its "Verify / *" checks are the full gate (all unit tests, typecheck, lint, ' +
        "production build, dependency audit). Release Production re-runs that gate " +
        "before it deploys, so nothing heavy runs here.\n",
    );
  }

  // The local gate runs on the working tree, so it must BE the pushed tree.
  if (development.length > 0 && git("status", "--porcelain")) {
    console.error(
      "\nPush blocked: commit or remove local changes so verification matches the pushed tree.\n",
    );
    process.exitCode = 1;
    return;
  }

  // Same reason: the checks read the checked-out files, so pushing another
  // commit (`git push origin other:development`) would verify the wrong tree.
  const headTree =
    development.length > 0 ? git("rev-parse", "HEAD^{tree}") : "";
  for (const push of development) {
    const error = treeMismatchError(push, headTree, (sha) =>
      git("rev-parse", `${sha}^{tree}`),
    );
    if (error) {
      console.error(`\n${error}\n`);
      process.exitCode = 1;
      return;
    }
  }

  for (const push of development) {
    const status = verifyDevelopmentPush(push);
    if (status !== 0) {
      process.exitCode = status;
      return;
    }
  }
}

const isDirectExecution =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
