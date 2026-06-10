import { PrismaService } from '../../../prisma';

const FTS_CONFIG = 'simple';

/**
 * Sanitize user input for use in tsquery.
 * Strips special tsquery operators and joins words with '&' (AND).
 */
function toTsQuery(input: string): string {
  const sanitized = input
    .replace(/[&|!():*<>'"\\]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (sanitized.length === 0) return '';

  // prefix match on the last word (autocomplete behavior), AND for the rest
  const terms = sanitized.map((word, i) =>
    i === sanitized.length - 1 ? `${word}:*` : word,
  );
  return terms.join(' & ');
}

/**
 * Runs a Postgres full-text search on the products table.
 * Returns matching product IDs ranked by relevance (ts_rank) + trigram similarity.
 *
 * Queries the denormalized `search_text` column which is maintained by Postgres
 * triggers and contains: title + description + attribute display values. This
 * means searches for manufacturer-scoped attribute labels (e.g. "treasure hunt",
 * "mainline", "Real Riders") find products that have those attributes attached,
 * not only those that happen to mention the term in their title.
 *
 * Uses the GIN index `products_search_text_fts_idx`.
 * Falls back to trigram similarity on title when tsquery yields no results.
 */
export async function fulltextProductSearch(
  prisma: PrismaService,
  query: string,
  limit = 1000,
): Promise<string[]> {
  const tsq = toTsQuery(query);
  if (!tsq) return [];

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `
    SELECT id FROM products
    WHERE
      to_tsvector('${FTS_CONFIG}', coalesce(search_text, ''))
      @@ to_tsquery('${FTS_CONFIG}', $1)
    ORDER BY
      ts_rank(
        to_tsvector('${FTS_CONFIG}', coalesce(search_text, '')),
        to_tsquery('${FTS_CONFIG}', $1)
      ) DESC
    LIMIT $2
    `,
    tsq,
    limit,
  );

  if (rows.length > 0) return rows.map((r) => r.id);

  // Fallback: trigram similarity for partial / fuzzy matches. Stays on title because
  // search_text can grow long (multiple attribute labels) and trigram similarity on
  // long text is noisier than on the human-curated title.
  const trigramRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `
    SELECT id FROM products
    WHERE similarity(title, $1) > 0.15
       OR title ILIKE '%' || $1 || '%'
    ORDER BY similarity(title, $1) DESC
    LIMIT $2
    `,
    query,
    limit,
  );

  return trigramRows.map((r) => r.id);
}
