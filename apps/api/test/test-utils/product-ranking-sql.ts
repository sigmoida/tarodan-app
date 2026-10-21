import { Prisma } from "@prisma/client";

/** The columns `writeProductRanking` writes, plus the one it reads. */
export interface RankingRow {
  boostedUntil: Date | null;
  qualityScore?: number;
  rankTier?: number;
  relevanceScore?: number | null;
  popularityScore?: number | null;
  popularityUpdatedAt?: Date | null;
}

const assignment = (column: string) => new RegExp(`"${column}" = \\$(\\d+)`);
const caseOn = (column: string) =>
  new RegExp(
    `"${column}" = CASE WHEN "boosted_until" > \\$(\\d+)\\s+THEN \\$(\\d+)::int ELSE \\$(\\d+)::int END`,
  );

/**
 * A `$executeRaw` stand-in that runs the ranking UPDATE of
 * `writeProductRanking` against in-memory rows, the way Postgres would: each
 * CASE reads the row's `boosted_until` at write time. It only understands that
 * statement and throws on anything else, so a changed statement fails loudly.
 */
export function rankingExecuteRaw(rows: Map<string, RankingRow>) {
  return jest.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const { text, values: params } = Prisma.sql(strings, ...values);
      if (!/^\s*UPDATE "products" SET/.test(text)) {
        throw new Error(`unexpected SQL: ${text}`);
      }
      const param = (n: string) => params[Number(n) - 1];
      const id = param(/WHERE "id" = \$(\d+)/.exec(text)![1]) as string;
      const row = rows.get(id);
      if (!row) return 0;

      const pick = (column: string) => {
        const m = caseOn(column).exec(text);
        if (!m) throw new Error(`no CASE on ${column} in: ${text}`);
        const boosted =
          row.boostedUntil != null && row.boostedUntil > (param(m[1]) as Date);
        return param(boosted ? m[2] : m[3]) as number;
      };
      const plain = (column: string) => {
        const m = assignment(column).exec(text);
        return m ? param(m[1]) : undefined;
      };

      const rankTier = pick("rank_tier");
      const relevanceScore = pick("relevance_score");
      row.qualityScore = plain("quality_score") as number;
      row.rankTier = rankTier;
      row.relevanceScore = relevanceScore;
      if (/"popularity_score" = /.test(text)) {
        row.popularityScore = plain("popularity_score") as number | null;
        row.popularityUpdatedAt = plain("popularity_updated_at") as Date;
      }
      return 1;
    },
  );
}
