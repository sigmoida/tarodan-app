#!/usr/bin/env node
// PostToolUse (Edit|Write|MultiEdit): after an edit to
// packages/i18n/src/catalog/{tr,en}.json, regenerate
// packages/i18n/src/generated/keys.ts and report tr/en key parity.
//
// A broken catalog or a failing generator exits 2 so Claude sees the error.
// A parity gap is reported as context only: adding a key to tr.json before
// en.json is a normal intermediate state.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readHookInput, repoRelative, targetPath } from "./lib.mjs";

const CATALOG = /^packages\/i18n\/src\/catalog\/(tr|en)\.json$/;

function flatten(obj, prefix = "", out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out.add(path);
    }
  }
  return out;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function main() {
  const input = readHookInput();
  const file = input && targetPath(input);
  const location = file && repoRelative(file);
  if (!location || !CATALOG.test(location.rel)) {
    return;
  }

  const catalogDir = join(location.root, "packages/i18n/src/catalog");
  const keys = {};
  for (const locale of ["tr", "en"]) {
    try {
      keys[locale] = flatten(
        JSON.parse(readFileSync(join(catalogDir, `${locale}.json`), "utf8")),
      );
    } catch (error) {
      fail(
        `packages/i18n/src/catalog/${locale}.json is not valid JSON: ${error.message}`,
      );
    }
  }

  try {
    execFileSync(process.execPath, ["scripts/gen-keys.mjs"], {
      cwd: join(location.root, "packages/i18n"),
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (error) {
    fail(`i18n codegen failed: ${error.stderr?.toString() || error.message}`);
  }

  const onlyTr = [...keys.tr].filter((key) => !keys.en.has(key));
  const onlyEn = [...keys.en].filter((key) => !keys.tr.has(key));
  const sample = (list) =>
    list.slice(0, 5).join(", ") + (list.length > 5 ? ", ..." : "");
  const parity =
    onlyTr.length === 0 && onlyEn.length === 0
      ? "tr and en are in key parity."
      : `Key parity gap: ${onlyTr.length} only in tr.json (${sample(onlyTr)}), ${onlyEn.length} only in en.json (${sample(onlyEn)}). Add the missing values before committing.`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Regenerated packages/i18n/src/generated/keys.ts (${keys.tr.size} keys). ${parity} Run \`pnpm --filter @tarodan/i18n build\` before typechecking web or admin.`,
      },
    }),
  );
}

main();
