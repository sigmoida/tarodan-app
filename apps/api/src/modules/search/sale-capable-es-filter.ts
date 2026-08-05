/**
 * Elasticsearch cannot join the seller membership table, so sale capability is
 * denormalized into each product document. The entitlement-end range makes an
 * expired BUSINESS seller disappear at the exact boundary, even if the expiry
 * cron/reindex has not run yet.
 */
export function saleCapableEsFilters(now = new Date()) {
  return [
    { term: { sellerCanSell: true } },
    {
      bool: {
        should: [
          {
            bool: {
              must_not: { exists: { field: "sellerSalesEntitledUntil" } },
            },
          },
          {
            range: {
              sellerSalesEntitledUntil: { gt: now.toISOString() },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
  ];
}
