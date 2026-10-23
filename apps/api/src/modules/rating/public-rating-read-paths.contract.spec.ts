import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { apiAppRoot } from "../../common/helpers/app-root";

/**
 * Every read of a product review (`ProductRating`) or a user rating
 * (`Rating`) outside the admin and dev surfaces goes through the one public
 * filter (`common/helpers/public-rating.ts`), so a review an admin hid (or a
 * legacy unpublished row) never reaches a public list, count, average,
 * product card, seller block, profile or discovery aggregate.
 *
 * The behaviour specs pin the main readers one by one
 * (`public-rating-visibility.spec.ts`); this contract finds the readers
 * nobody wrote a spec for, and every new one. A read that is non-public on
 * purpose (the author's own view, a duplicate check, the moderation itself)
 * is listed below with its reason and exact count, so adding another one is
 * a decision, not an accident.
 */

const SRC = join(apiAppRoot(), "src");

/** Admin-only and dev-only code: it shows every status on purpose. */
const NON_PUBLIC_TREES = [
  "modules/admin/",
  "modules/admin-test-tools/",
  "modules/dev/",
];

/**
 * Reads that skip the public filter on purpose, per file, with the exact
 * number of such calls.
 */
const NON_PUBLIC_READS: Record<string, { count: number; why: string }> = {
  "modules/order/order-query.service.ts": {
    count: 2,
    why: "the author's own review (GET /orders/:id/my-review), flagged `hidden`",
  },
  "modules/order/order-common.service.ts": {
    count: 2,
    why: "the buyer's hasProductRating / hasSellerRating flags on their own order",
  },
  "modules/rating/rating.service.ts": {
    count: 4,
    why: "three duplicate checks before a create, and the helpful vote's existence check, which answers 404 for a non-public review",
  },
  "modules/rating/moderation/rating-moderation.service.ts": {
    count: 2,
    why: "the admin moderation reads the row it changes",
  },
  "modules/user-report/user-report.service.ts": {
    count: 2,
    why: "the reported review shown to admins on the report detail",
  },
};

const READ_CALL =
  /\b(?:rating|productRating)\.(?:findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|aggregate|groupBy)\(/g;
const PUBLIC_HELPER = /\bpublic(?:User|Product)RatingWhere\(/;
const RAW_RATING_TABLE = /\b(?:FROM|JOIN)\s+"(?:product_)?ratings"/i;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts"))
      out.push(full);
  }
  return out;
}

/** The text between the call's parentheses (balanced). */
function callArgument(text: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0)
      return text.slice(openParen + 1, i);
  }
  return text.slice(openParen + 1);
}

/**
 * A call passes when its argument uses the helper, or when it passes a
 * `where` variable whose nearest declaration above is built by the helper.
 */
function usesPublicFilter(text: string, callIndex: number, arg: string) {
  if (PUBLIC_HELPER.test(arg)) return true;
  if (!/\bwhere\b(?!\s*:)/.test(arg)) return false;
  const declarations = [
    ...text.slice(0, callIndex).matchAll(/const where\b[^=]*=\s*/g),
  ];
  const last = declarations.at(-1);
  if (!last || last.index === undefined) return false;
  const start = last.index + last[0].length;
  return /^public(?:User|Product)RatingWhere\(/.test(text.slice(start));
}

const files = sourceFiles(SRC)
  .map((full) => ({
    rel: relative(SRC, full).split(sep).join("/"),
    text: readFileSync(full, "utf8"),
  }))
  .filter(({ rel }) => !NON_PUBLIC_TREES.some((tree) => rel.startsWith(tree)));

function unfilteredReads(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(READ_CALL)) {
    const index = match.index ?? 0;
    const open = index + match[0].length - 1;
    const arg = callArgument(text, open);
    if (!usesPublicFilter(text, index, arg)) {
      const line = text.slice(0, index).split("\n").length;
      found.push(`${match[0]} line ${line}`);
    }
  }
  return found;
}

describe("public rating read paths (hidden reviews never public)", () => {
  it("finds the review readers it guards (the scan itself works)", () => {
    const readers = files.filter(
      ({ text }) => [...text.matchAll(READ_CALL)].length > 0,
    );
    const names = readers.map(({ rel }) => rel);
    // the public readers that must stay on the helper
    expect(names).toEqual(
      expect.arrayContaining([
        "modules/rating/rating.service.ts",
        "modules/product/product-common.service.ts",
        "modules/user/profile/user-profile.service.ts",
        "modules/user/stats/user-stats.service.ts",
        "modules/user/social/user-discovery.service.ts",
      ]),
    );
  });

  it("every other review read uses publicProductRatingWhere / publicUserRatingWhere", () => {
    const offenders = files
      .filter(({ rel }) => !(rel in NON_PUBLIC_READS))
      .map(({ rel, text }) => ({ rel, reads: unfilteredReads(text) }))
      .filter(({ reads }) => reads.length > 0);

    expect(offenders).toEqual([]);
  });

  it.each(Object.entries(NON_PUBLIC_READS))(
    "%s skips the filter only where listed",
    (rel, { count }) => {
      const file = files.find((f) => f.rel === rel);
      expect(file).toBeDefined();
      expect(unfilteredReads(file?.text ?? "")).toHaveLength(count);
    },
  );

  it("raw SQL on the review tables filters on the public status", () => {
    const offenders = files
      .filter(({ text }) => RAW_RATING_TABLE.test(text))
      .filter(({ text }) => !text.includes("PUBLIC_RATING_STATUS"))
      .map(({ rel }) => rel);

    expect(offenders).toEqual([]);
  });
});
