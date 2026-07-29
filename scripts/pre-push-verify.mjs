#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
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

export function validateReleaseMarker(marker, expectedTree) {
  if (!marker) {
    return "No local release verification was found.";
  }
  if (marker.status !== "PASS") {
    return `Latest local release verification is ${marker.status ?? "unknown"}.`;
  }
  if (marker.tree !== expectedTree) {
    return "Code changed after the latest local release verification.";
  }
  return undefined;
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function releaseMarkerPath() {
  const gitDirectory = git("rev-parse", "--git-dir");
  const absoluteGitDirectory = isAbsolute(gitDirectory)
    ? gitDirectory
    : resolve(REPO_ROOT, gitDirectory);
  return join(
    absoluteGitDirectory,
    "tarodan-test-results",
    "release-verification.json",
  );
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

function verifyMasterPush(push) {
  const markerPath = releaseMarkerPath();
  const marker = existsSync(markerPath)
    ? JSON.parse(readFileSync(markerPath, "utf8"))
    : undefined;
  const expectedTree = git("rev-parse", `${push.localSha}^{tree}`);
  const error = validateReleaseMarker(marker, expectedTree);

  if (error) {
    console.error(`\nMaster push blocked: ${error}`);
    console.error("Run pnpm verify:release:local and retry the push.\n");
    return 1;
  }

  console.log(
    `Local release verification accepted (${expectedTree.slice(0, 12)}).\n`,
  );
  return 0;
}

function runCli() {
  const pushes = parsePushLines(readFileSync(0, "utf8"));
  const activePushes = pushes.filter((push) => !ZERO_SHA.test(push.localSha));
  const protectedPush = activePushes.some((push) =>
    ["refs/heads/development", "refs/heads/master"].includes(push.remoteRef),
  );

  if (protectedPush && git("status", "--porcelain")) {
    console.error(
      "\nPush blocked: commit or remove local changes so verification matches the pushed tree.\n",
    );
    process.exitCode = 1;
    return;
  }

  for (const push of activePushes) {
    if (push.remoteRef === "refs/heads/development") {
      const status = verifyDevelopmentPush(push);
      if (status !== 0) {
        process.exitCode = status;
        return;
      }
    } else if (push.remoteRef === "refs/heads/master") {
      const status = verifyMasterPush(push);
      if (status !== 0) {
        process.exitCode = status;
        return;
      }
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
