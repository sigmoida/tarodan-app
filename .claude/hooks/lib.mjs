// Shared helpers for the Claude Code hooks in this folder (see .claude/settings.json).
// Hooks read one JSON object on stdin; file tools carry tool_input.file_path.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return undefined;
  }
}

/** Absolute path of the file the tool call writes, or undefined. */
export function targetPath(input) {
  const raw = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  if (typeof raw !== "string" || raw === "") {
    return undefined;
  }
  return resolve(input.cwd ?? process.cwd(), raw);
}

export function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/**
 * The checkout that contains `file` (main repo or a worktree) and the file's
 * path relative to it, with forward slashes. The file may not exist yet.
 */
export function repoRelative(file) {
  let dir = dirname(file);
  while (!existsSync(dir) && dirname(dir) !== dir) {
    dir = dirname(dir);
  }
  try {
    // git prints the real path (macOS: /var -> /private/var), so resolve
    // symlinks in the existing part of the path before comparing.
    const real = join(realpathSync(dir), relative(dir, file));
    const root = git(dir, "rev-parse", "--show-toplevel");
    return { root, rel: relative(root, real).split("\\").join("/") };
  } catch {
    return undefined;
  }
}
