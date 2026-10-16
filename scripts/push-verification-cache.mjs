import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Push verification cache, keyed by git TREE (not commit).
 *
 * The push checks (typecheck, unit tests, build per app) depend only on the
 * file contents, so a tree that already passed them for an app does not need
 * to run them again: a retried push after an interrupted hook, the merge
 * commit of an already verified branch (same tree), or `pnpm verify:push`
 * run ahead of time in a worktree all reuse the earlier result. The cache
 * lives in the COMMON git directory, so every worktree of the clone shares it.
 */

/** Keep the newest N trees; older entries are dropped on write. */
export const MAX_CACHED_TREES = 20;

export function readPushCache(path) {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

/** Apps that already passed every push stage for this tree. */
export function verifiedAppsForTree(cache, tree) {
  const entry = cache[tree];
  return Array.isArray(entry?.apps) ? entry.apps : [];
}

/** Affected apps that still have to run for this tree. */
export function appsToVerify(affectedApps, verifiedApps) {
  return affectedApps.filter((app) => !verifiedApps.includes(app));
}

/**
 * Apps whose stages ALL passed in this run. An app with no stage in the run
 * is not counted; a FAIL or NOT RUN stage disqualifies its app.
 */
export function passedApps(apps, stages) {
  return apps.filter((app) => {
    const appStages = stages.filter((stage) => stage.app === app);
    return (
      appStages.length > 0 &&
      appStages.every((stage) => stage.status === "PASS")
    );
  });
}

/** Returns a new cache with `apps` added to `tree`, trimmed to the newest trees. */
export function recordVerifiedApps(cache, tree, apps, verifiedAt) {
  if (apps.length === 0) {
    return cache;
  }
  const previous = verifiedAppsForTree(cache, tree);
  const next = {
    ...cache,
    [tree]: {
      apps: [...new Set([...previous, ...apps])],
      verifiedAt,
    },
  };
  const newest = Object.entries(next)
    .sort(([, a], [, b]) =>
      String(b?.verifiedAt ?? "").localeCompare(String(a?.verifiedAt ?? "")),
    )
    .slice(0, MAX_CACHED_TREES);
  return Object.fromEntries(newest);
}

export function writePushCache(path, cache) {
  writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`);
}
