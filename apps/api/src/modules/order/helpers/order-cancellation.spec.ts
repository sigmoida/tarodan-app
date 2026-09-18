import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { OrderStatus } from "@prisma/client";
import { apiAppRoot } from "../../../common/helpers/app-root";
import { orderCancelledData } from "./order-cancellation";

// Anchored, not counted in `../` hops: this spec reads SOURCE files, so the
// path must survive the file moving folders (apps/api/CLAUDE.md §1).
const API_SRC = join(apiAppRoot(), "src");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("orderCancelledData", () => {
  it("stamps the cancellation moment alongside the status", () => {
    const at = new Date("2026-04-01T10:00:00.000Z");
    expect(orderCancelledData(at)).toEqual({
      status: OrderStatus.cancelled,
      cancelledAt: at,
    });
  });

  it("defaults to now so callers cannot forget the stamp", () => {
    const before = Date.now();
    const { cancelledAt } = orderCancelledData();
    expect(cancelledAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  /**
   * The metric "iptal edilen sipariş" is only as honest as the least careful
   * cancel path. A new path that writes `status: cancelled` straight into an
   * `order.update` would silently drop out of every period — so the rule is
   * enforced over the source, not trusted to review.
   */
  it("is the ONLY way an order is written to cancelled", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(API_SRC)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (!/status:\s*(OrderStatus\.cancelled|"cancelled")/.test(line)) return;
        // Look back for the delegate this data block belongs to; only the
        // `order` delegate is in scope (shipments, offers, trades, boosts and
        // e-invoices have their own `cancelled` state).
        const context = lines.slice(Math.max(0, index - 20), index).join("\n");
        if (!/\border\.(update|updateMany|upsert|create)\(/.test(context)) return;
        offenders.push(`${relative(API_SRC, file)}:${index + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
