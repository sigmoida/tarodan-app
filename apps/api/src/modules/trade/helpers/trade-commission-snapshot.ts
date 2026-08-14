import type { Prisma } from "@prisma/client";
import type { TradeQuote } from "../trade-quote.service";
import type { TradeRuleMatch } from "./trade-pricing.helper";

export interface TradeCommissionRuleSnapshot {
  ruleSetId: string;
  ruleSetVersion: number;
  items: TradeRuleMatch[];
}

export function buildTradeCommissionRuleSnapshot(
  quote: TradeQuote,
): Prisma.InputJsonObject {
  return {
    ruleSetId: quote.commissionRuleSet.id,
    ruleSetVersion: quote.commissionRuleSet.version,
    items: quote.ruleMatches as unknown as Prisma.InputJsonArray,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Nullable/legacy JSON is intentionally tolerated; it means no audit snapshot. */
export function readTradeCommissionRuleSnapshot(
  value: unknown,
): TradeCommissionRuleSnapshot | null {
  if (!isRecord(value)) return null;
  const ruleSetId =
    typeof value.ruleSetId === "string" ? value.ruleSetId : null;
  const ruleSetVersion = finiteNumber(value.ruleSetVersion);
  if (!ruleSetId || ruleSetVersion == null || !Array.isArray(value.items)) {
    return null;
  }

  const items = value.items.flatMap((raw): TradeRuleMatch[] => {
    if (!isRecord(raw)) return [];
    const productId = typeof raw.productId === "string" ? raw.productId : null;
    const ruleId = typeof raw.ruleId === "string" ? raw.ruleId : null;
    const ruleName = typeof raw.ruleName === "string" ? raw.ruleName : null;
    const side = raw.side === "receiver" ? "receiver" : "initiator";
    const categoryId =
      typeof raw.categoryId === "string" ? raw.categoryId : null;
    const sellerType =
      typeof raw.sellerType === "string" ? raw.sellerType : null;
    const matchedAmount = finiteNumber(raw.matchedAmount);
    const minAmount = finiteNumber(raw.minAmount);
    const maxAmount =
      raw.maxAmount == null ? null : finiteNumber(raw.maxAmount);
    const tradeFeeSellerAmount = finiteNumber(raw.tradeFeeSellerAmount);
    const tradeFeeBuyerAmount = finiteNumber(raw.tradeFeeBuyerAmount);
    if (
      !productId ||
      !ruleId ||
      !ruleName ||
      !categoryId ||
      !sellerType ||
      matchedAmount == null ||
      minAmount == null ||
      tradeFeeSellerAmount == null ||
      tradeFeeBuyerAmount == null
    ) {
      return [];
    }
    return [
      {
        productId,
        side,
        ruleId,
        ruleSetId:
          typeof raw.ruleSetId === "string" ? raw.ruleSetId : ruleSetId,
        ruleName,
        categoryId,
        sellerType: sellerType as TradeRuleMatch["sellerType"],
        matchedAmount,
        minAmount,
        maxAmount,
        tradeFeeSellerAmount,
        tradeFeeBuyerAmount,
      },
    ];
  });

  return { ruleSetId, ruleSetVersion, items };
}
