#!/usr/bin/env node

/**
 * Git pre-push hook (.husky/pre-push).
 *
 *   development  quick local gate: typecheck (+ API contract) of the affected
 *                apps, ~1 min, no jest. CI gates the staging deploy on
 *                typecheck + lint only; the unit suites run there as an
 *                advisory workflow (Development Tests).
 *   master       nothing heavy runs locally. master moves through a PR
 *                development -> master whose "Verify / *" checks are the full
 *                gate, and Release Production re-runs it before deploying.
 *                A direct push only prints a reminder.
 *
 * Every push (except deletions) also checks branch names against
 * tarodan-ops docs/commit-and-branch-rules.md: the remote branch it creates or
 * updates, and the local branch it comes from (`git push origin fix/x:development`
 * checks `fix/x`). `development`, `master`, the tool's temporary `worktree-*`
 * names and local `integration/<wave>` branches are allowed as well.
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

export const BRANCH_NAME_PATTERN =
  /^(feat|fix|refactor|perf|chore|ci|docs|test|hotfix)\/[a-z0-9-]+$/;
const ALLOWED_BRANCH_NAMES = [
  /^(development|master)$/,
  /^worktree-[A-Za-z0-9._-]+$/,
  /^integration\/[a-z0-9-]+$/,
];

export function isValidBranchName(name) {
  return (
    BRANCH_NAME_PATTERN.test(name) ||
    ALLOWED_BRANCH_NAMES.some((pattern) => pattern.test(name))
  );
}

function branchOf(ref) {
  return ref?.startsWith("refs/heads/")
    ? ref.slice("refs/heads/".length)
    : undefined;
}

/**
 * Branch names a push introduces that break the naming rule. Deletions are
 * skipped (removing a badly named branch must stay possible), and so are local
 * refs that are not branches (`HEAD`, a sha, a tag).
 */
export function invalidBranchNames(pushes) {
  const names = new Set();
  for (const push of pushes) {
    if (ZERO_SHA.test(push.localSha)) {
      continue;
    }
    for (const name of [branchOf(push.remoteRef), branchOf(push.localRef)]) {
      if (name && !isValidBranchName(name)) {
        names.add(name);
      }
    }
  }
  return [...names];
}

export function branchNameError(names) {
  if (names.length === 0) {
    return undefined;
  }
  return (
    `Push blocked: branch name${names.length > 1 ? "s" : ""} ${names.map((name) => `"${name}"`).join(", ")} ` +
    "must match <type>/<kebab-description> with type one of feat, fix, refactor, perf, chore, ci, docs, test, hotfix " +
    "(lower-case letters, digits and dashes), e.g. fix/offer-counter-lock. " +
    "Rename it with `git branch -m <new-name>` and push again. " +
    "Rules: tarodan-ops docs/commit-and-branch-rules.md."
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

  const nameError = branchNameError(invalidBranchNames(pushes));
  if (nameError) {
    console.error(`\n${nameError}\n`);
    process.exitCode = 1;
    return;
  }

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
