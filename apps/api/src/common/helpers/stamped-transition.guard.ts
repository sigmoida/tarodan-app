import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { apiAppRoot } from "./app-root";

/**
 * A period metric is only as honest as the least careful write path.
 *
 * `orderCancelledData()` proved the rule: once a transition carries its own
 * stamp, a NEW code path that writes the bare status straight into an
 * `update()` silently drops out of every period — and review will not catch
 * it. So the rule is enforced over the SOURCE.
 *
 * This is the one implementation of that scan; each stamped transition
 * (`Order.cancelledAt`/`cancelledBy`, `Trade.cancelledAt`/`cancelledBy`,
 * `Trade.rejectedAt`, `Product.soldAt`, `Offer.respondedAt`) passes its own
 * delegate and status instead of copying
 * a directory walker into its spec.
 */

// Anchored, not counted in `../` hops: this reads SOURCE files, so the path
// must survive the caller moving folders (apps/api/CLAUDE.md §1).
const API_SRC = join(apiAppRoot(), "src");

/** Every non-spec `.ts` file under `apps/api/src`. */
export function apiSourceFiles(dir: string = API_SRC, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      apiSourceFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

export interface StampedTransitionRule {
  /** Prisma delegate the rule is scoped to, e.g. `trade`, `product`. */
  delegate: string;
  /** Status literals that MUST travel with the stamp, e.g. `["rejected"]`. */
  statuses: string[];
  /** Prisma enum the literals belong to, e.g. `TradeStatus`. */
  enumName: string;
  /**
   * Helper names allowed to produce the data block. More than one when a
   * transition has a legitimate non-stamping sibling (re-accepting an offer
   * whose payment window lapsed is not a second answer).
   */
  helpers: string[];
}

/**
 * `file:line` of every write that sets one of `statuses` on `delegate` without
 * going through one of `helpers`. An empty array means the stamp cannot be
 * forgotten.
 */
export function unstampedTransitions(rule: StampedTransitionRule): string[] {
  const statusPattern = rule.statuses
    .map((status) => `${rule.enumName}\\.${status}|"${status}"`)
    .join("|");
  const status = new RegExp(`status:\\s*(${statusPattern})`);
  const write = new RegExp(
    `\\b${rule.delegate}\\.(update|updateMany|upsert|create)\\(`,
  );
  const helper = new RegExp(`\\b(${rule.helpers.join("|")})\\(`);

  const offenders: string[] = [];

  for (const file of apiSourceFiles()) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!status.test(line)) return;
      // Look back for the delegate this data block belongs to; sibling models
      // have their own `rejected` / `sold` / `accepted` states and are not in
      // scope. Look forward far enough to see the rest of the same block.
      const before = lines.slice(Math.max(0, index - 20), index).join("\n");
      if (!write.test(before)) return;
      // A status inside `where:` SELECTS rows, it does not write one — the
      // refund path narrows `offer.updateMany` to still-accepted offers and
      // must not be mistaken for a transition.
      if (before.lastIndexOf("where:") > before.lastIndexOf("data:")) return;
      const block = lines
        .slice(Math.max(0, index - 20), Math.min(lines.length, index + 10))
        .join("\n");
      if (helper.test(block)) return;
      offenders.push(`${relative(API_SRC, file)}:${index + 1}`);
    });
  }

  return offenders;
}
