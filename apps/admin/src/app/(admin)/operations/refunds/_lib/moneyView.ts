import type {
  AdminRefundMoneyStatus,
  AdminRefundRow,
  AdminRefundTab,
} from "@tarodan/types";
import { fmtPercent, fmtTry } from "@/lib/format";

/** Boş değerin yer tutucusu (`fmtTry(null)` de buna düşer). */
export const EMPTY_MONEY = "—";

export const MONEY_LINE_I18N_KEYS = {
  unitPrice: "admin.operations.refunds.money.unitPrice",
  commission: "admin.operations.refunds.money.commission",
  refundableCommission: "admin.operations.refunds.money.refundableCommission",
  deductions: "admin.operations.refunds.money.deductions",
  buyerDeduction: "admin.operations.refunds.money.buyerDeduction",
  sellerDeduction: "admin.operations.refunds.money.sellerDeduction",
  commissionSplit: "admin.operations.refunds.money.commissionSplit",
  listingCommission: "admin.operations.refunds.money.listingCommission",
  offerCommission: "admin.operations.refunds.money.offerCommission",
  priceDifference: "admin.operations.refunds.money.priceDifference",
} as const;

export type MoneyLineKey = keyof typeof MONEY_LINE_I18N_KEYS;

export interface MoneyLine {
  key: MoneyLineKey;
  value: string;
}

type Money = AdminRefundRow["money"];

/** `₺12,00 · %10` — tutar, varsa oranıyla. Tutar yoksa yer tutucu. */
export function fmtAmountWithRate(
  amount: number | null | undefined,
  rate: number | null | undefined,
): string {
  const money = fmtTry(amount);
  if (money == null) return EMPTY_MONEY;
  const percent = fmtPercent(rate, Number.isInteger(rate) ? 0 : 1);
  return percent ? `${money} · ${percent}` : money;
}

const orDash = (value: number | null | undefined): string =>
  fmtTry(value) ?? EMPTY_MONEY;

const pair = (a: number | null | undefined, b: number | null | undefined) =>
  `${orDash(a)} / ${orDash(b)}`;

/**
 * Para hücresinin satırları. `lines` hücrede görünen kompakt özet (4 satır;
 * sekmeye özgü beşinci satır yalnız Teklif / Takas sekmesinde), `detail`
 * `title` ipucundaki tam döküm — alıcı / satıcı kesintisi ve ilan / teklif
 * komisyonu orada ayrı ayrı yazar. Teklif satırları Teklif, fark bedeli Takas
 * sekmesine özgüdür; "Tüm İadeler"de ikisi de gizlenir.
 */
export function refundMoneyView(
  money: Money,
  tab: AdminRefundTab,
): { lines: MoneyLine[]; detail: MoneyLine[] } {
  const base: MoneyLine[] = [
    { key: "unitPrice", value: orDash(money.unitPrice) },
    {
      key: "commission",
      value: fmtAmountWithRate(money.commissionAmount, money.commissionRate),
    },
    {
      key: "refundableCommission",
      value: fmtAmountWithRate(
        money.refundableCommissionAmount,
        money.refundableCommissionRate,
      ),
    },
  ];

  const lines: MoneyLine[] = [
    ...base,
    {
      key: "deductions",
      value: pair(money.buyerDeduction, money.sellerDeduction),
    },
  ];
  const detail: MoneyLine[] = [
    ...base,
    { key: "buyerDeduction", value: orDash(money.buyerDeduction) },
    { key: "sellerDeduction", value: orDash(money.sellerDeduction) },
  ];

  if (tab === "offer") {
    lines.push({
      key: "commissionSplit",
      value: pair(money.listingCommissionAmount, money.offerCommissionAmount),
    });
    detail.push(
      {
        key: "listingCommission",
        value: orDash(money.listingCommissionAmount),
      },
      { key: "offerCommission", value: orDash(money.offerCommissionAmount) },
    );
  } else if (tab === "trade") {
    const difference: MoneyLine = {
      key: "priceDifference",
      value: orDash(money.priceDifference),
    };
    lines.push(difference);
    detail.push(difference);
  }

  return { lines, detail };
}

/** `title` ipucu: her satır "Etiket: değer". */
export function moneyTooltip(
  detail: MoneyLine[],
  label: (key: MoneyLineKey) => string,
): string {
  return detail.map((line) => `${label(line.key)}: ${line.value}`).join("\n");
}

/** Para durumu rozeti: etiket anahtarı ve (yalnız Badge'in bildiği) varyant. */
export const MONEY_STATUS_BADGES = {
  none: {
    variant: "outline",
    labelKey: "admin.operations.refunds.moneyStatus.none",
  },
  pending: {
    variant: "outline",
    labelKey: "admin.operations.refunds.moneyStatus.pending",
  },
  refunding: {
    variant: "warning",
    labelKey: "admin.operations.refunds.moneyStatus.refunding",
  },
  refunded: {
    variant: "success",
    labelKey: "admin.operations.refunds.moneyStatus.refunded",
  },
  failed: {
    variant: "danger",
    labelKey: "admin.operations.refunds.moneyStatus.failed",
  },
} as const satisfies Record<
  AdminRefundMoneyStatus,
  { variant: "outline" | "warning" | "success" | "danger"; labelKey: string }
>;
