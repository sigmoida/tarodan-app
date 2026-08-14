import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Anchors for the few specs that assert on files OUTSIDE the TypeScript module
 * graph — a migration's SQL, an admin component's source. Those cannot be
 * imported, so they are read from disk, and counting `../` hops from
 * `__dirname` silently breaks the moment the spec moves to another folder
 * (§1 folder layout). Walking up to a known marker instead makes the path
 * independent of where the spec happens to live.
 */
function ascendTo(marker: string, from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, marker))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`${marker} not found above ${from}`);
    dir = parent;
  }
}

/** `apps/api` — the directory holding this package's nest-cli.json. */
export function apiAppRoot(): string {
  return ascendTo("nest-cli.json", __dirname);
}

/** The monorepo root — the directory holding pnpm-workspace.yaml. */
export function repoRoot(): string {
  return ascendTo("pnpm-workspace.yaml", __dirname);
}
