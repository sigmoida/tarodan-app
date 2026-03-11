import { PrismaService } from '../../prisma';

const FTS_CONFIG = 'simple';

const ALLOWED_TABLES = new Set([
  'products',
  'collections',
  'brands',
  'categories',
  'manufacturers',
  'users',
  'payments',
  'orders',
  'discounts',
  'tags',
  'attribute_groups',
  'attributes',
  'product_ratings',
  'security_logs',
  'email_logs',
  'shipping_methods',
  'shipping_carriers',
  'tax_regions',
  'shipping_zones',
  'error_logs',
  'ticket_messages',
]);

function assertAllowedTable(table: string): void {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`fulltextSearch: table "${table}" is not whitelisted`);
  }
}

/**
 * Sanitize user input for use in tsquery.
 * Strips special tsquery operators and joins words with '&' (AND),
 * with prefix match on the last word for autocomplete behavior.
 */
export function toTsQuery(input: string): string {
  const sanitized = input
    .replace(/[&|!():*<>'"\\]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (sanitized.length === 0) return '';

  const terms = sanitized.map((word, i) =>
    i === sanitized.length - 1 ? `${word}:*` : word,
  );
  return terms.join(' & ');
}

/**
 * Generic full-text search on a single table+column expression.
 *
 * @param prisma    PrismaService instance
 * @param table     DB table name (must be whitelisted)
 * @param tsvExpr   The tsvector expression matching the GIN index, e.g.
 *                  `to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, ''))`
 * @param query     Raw user search text
 * @param limit     Max results
 * @returns         Array of matching row IDs (uuid strings)
 */
export async function fulltextSearch(
  prisma: PrismaService,
  table: string,
  tsvExpr: string,
  query: string,
  limit = 500,
): Promise<string[]> {
  assertAllowedTable(table);
  const tsq = toTsQuery(query);
  if (!tsq) return [];

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "${table}"
     WHERE ${tsvExpr} @@ to_tsquery('${FTS_CONFIG}', $1)
     ORDER BY ts_rank(${tsvExpr}, to_tsquery('${FTS_CONFIG}', $1)) DESC
     LIMIT $2`,
    tsq,
    limit,
  );

  return rows.map((r) => r.id);
}

// ─── Convenience wrappers ────────────────────────────────────────────────────

const tsv = (cols: string[]) =>
  cols
    .map((c) => `coalesce("${c}", '')`)
    .join(" || ' ' || ");

const tsvExpr = (cols: string[]) =>
  `to_tsvector('${FTS_CONFIG}', ${tsv(cols)})`;

export const fulltextCollectionSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'collections', tsvExpr(['name', 'description']), q, limit);

export const fulltextBrandSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'brands', tsvExpr(['name']), q, limit);

export const fulltextCategorySearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'categories', tsvExpr(['name']), q, limit);

export const fulltextManufacturerSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'manufacturers', tsvExpr(['name']), q, limit);

export const fulltextUserDisplayNameSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'users', tsvExpr(['display_name']), q, limit);

export const fulltextUserSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'users', tsvExpr(['email', 'display_name']), q, limit);

export const fulltextDiscountSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'discounts', tsvExpr(['name', 'code']), q, limit);

export const fulltextPaymentSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'payments', tsvExpr(['provider_payment_id', 'provider_conversation_id']), q, limit);

export const fulltextOrderSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'orders', tsvExpr(['order_number']), q, limit);

export const fulltextTagSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'tags', tsvExpr(['name', 'description']), q, limit);

export const fulltextAttributeGroupSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'attribute_groups', tsvExpr(['name', 'description']), q, limit);

export const fulltextAttributeSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'attributes', tsvExpr(['value', 'display_value']), q, limit);

export const fulltextProductRatingSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'product_ratings', tsvExpr(['title', 'review']), q, limit);

export const fulltextSecurityLogSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'security_logs', tsvExpr(['email', 'ip_address']), q, limit);

export const fulltextEmailLogSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'email_logs', tsvExpr(['to', 'subject']), q, limit);

export const fulltextErrorLogSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'error_logs', tsvExpr(['message']), q, limit);

export const fulltextTicketMessageSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'ticket_messages', tsvExpr(['message']), q, limit);

export const fulltextShippingMethodSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'shipping_methods', tsvExpr(['name', 'code']), q, limit);

export const fulltextShippingCarrierSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'shipping_carriers', tsvExpr(['name', 'code']), q, limit);

export const fulltextTaxRegionSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'tax_regions', tsvExpr(['name']), q, limit);

export const fulltextShippingZoneSearch = (p: PrismaService, q: string, limit?: number) =>
  fulltextSearch(p, 'shipping_zones', tsvExpr(['name']), q, limit);
