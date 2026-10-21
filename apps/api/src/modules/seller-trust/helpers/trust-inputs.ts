import type {
  CounterpartyCountRow,
  SellerFulfilmentRow,
} from "../../order/stats/order-seller-trust-stats.service";
import type { SellerRatingRow } from "../../rating/stats/rating-seller-trust-stats.service";
import type { TradeCounterpartyRow } from "../../trade/stats/trade-seller-trust-stats.service";
import type { TrustEligibleUser } from "../../user/stats/user-seller-trust-stats.service";
import type { SellerTrustInputs } from "./trust-formula";
import { TRUST_FORMULA_V1 as F } from "./trust-formula.constants";

const DAY_MS = 86_400_000;

export interface TrustBatchAggregates {
  eligible: TrustEligibleUser[];
  fulfilment: SellerFulfilmentRow[];
  sales: CounterpartyCountRow[];
  trades: TradeCounterpartyRow[];
  ratings: SellerRatingRow[];
}

export interface AssembledTrustInputs {
  userId: string;
  inputs: SellerTrustInputs;
}

/**
 * Joins one batch's per-domain aggregates into formula inputs, one entry per
 * eligible user, in the eligible order. Rows for users outside `eligible` are
 * ignored.
 *
 * Volume caps each counterparty at `perCounterpartyCap` across sales AND
 * trades together: a buyer who also traded with the seller is one person.
 */
export function assembleTrustInputs(
  aggregates: TrustBatchAggregates,
  asOf: Date,
): AssembledTrustInputs[] {
  const fulfilment = new Map(aggregates.fulfilment.map((r) => [r.userId, r]));
  const ratings = new Map(aggregates.ratings.map((r) => [r.userId, r]));

  const counterparties = new Map<string, Map<string, number>>();
  for (const row of [...aggregates.sales, ...aggregates.trades]) {
    let perUser = counterparties.get(row.userId);
    if (!perUser) {
      perUser = new Map();
      counterparties.set(row.userId, perUser);
    }
    perUser.set(
      row.counterpartyKey,
      (perUser.get(row.counterpartyKey) ?? 0) + Number(row.count),
    );
  }

  return aggregates.eligible.map((user) => {
    const f = fulfilment.get(user.id);
    const r = ratings.get(user.id);
    const perCounterparty = counterparties.get(user.id) ?? new Map();
    let transactions = 0;
    for (const count of perCounterparty.values()) {
      transactions += Math.min(F.volume.perCounterpartyCap, count);
    }
    return {
      userId: user.id,
      inputs: {
        raters: Number(r?.raters ?? 0),
        sumOfGiverMeans: Number(r?.sumOfGiverMeans ?? 0),
        eligibleOrders: Number(f?.eligible ?? 0),
        failures: Number(f?.failures ?? 0),
        shipped: Number(f?.shipped ?? 0),
        late: Number(f?.late ?? 0),
        transactions,
        counterparties: perCounterparty.size,
        tenureDays: Math.max(
          0,
          Math.floor((asOf.getTime() - user.createdAt.getTime()) / DAY_MS),
        ),
      },
    };
  });
}

/**
 * A user with no counted rating, order or transaction gets no row (the
 * cleanup then removes an old one): tenure alone is not a seller signal.
 */
export function hasTrustActivity(inputs: SellerTrustInputs): boolean {
  return (
    inputs.raters > 0 || inputs.eligibleOrders > 0 || inputs.transactions > 0
  );
}
