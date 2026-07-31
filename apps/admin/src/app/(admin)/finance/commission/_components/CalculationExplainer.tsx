"use client";

import { useTranslations } from "next-intl";

/**
 * Bir siparişin parasının nasıl bölündüğünü anlatan bilgilendirme paneli.
 *
 * Buradaki formüller kodun TEK kaynağıyla aynı olmak zorunda:
 *   alıcı toplamı  → order-checkout-common.service.ts (resolveOrderTaxes + total)
 *   satıcı neti    → order-net.helper.ts (sellerNetAmountOf)
 *   hizmet KDV'si  → order-service-tax.helper.ts (calculateServiceTax)
 * Formül değişirse burası da değişmeli.
 */

/** Örnek tablo satırları — anahtarlar literal kalsın diye `as const`. */
const EXAMPLE_ROWS = [
  { key: "exampleBuyerCommission", base: "20,00", vat: "4,00" },
  { key: "exampleBuyerServiceFee", base: "25,00", vat: "5,00" },
  { key: "exampleBuyerShipping", base: "50,00", vat: "10,00" },
  { key: "exampleSellerCommission", base: "30,00", vat: "6,00" },
  { key: "exampleSellerPlatformFee", base: "25,00", vat: "5,00" },
  { key: "exampleSellerShipping", base: "50,00", vat: "10,00" },
] as const;

/** Formüldeki bir terim: ürün bedeli, ücret ya da vergi. */
function Term({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "add" | "subtract";
}) {
  const toneClass =
    tone === "add"
      ? "bg-success-50 text-success-700 border-success-200"
      : tone === "subtract"
        ? "bg-danger-50 text-danger-700 border-danger-200"
        : "bg-surface-alt text-body border-border";
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-1 text-xs ${toneClass}`}
    >
      {label}
    </span>
  );
}

function Operator({ symbol }: { symbol: string }) {
  return (
    <span className="px-0.5 text-sm font-semibold text-muted">{symbol}</span>
  );
}

/** Bir tarafın formülü: sonuç = terim ± terim ± … */
function Formula({
  result,
  terms,
}: {
  result: string;
  terms: Array<{ label: string; op: "+" | "−" | "=" }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-y-2">
      <span className="mr-2 text-sm font-semibold text-heading">{result}</span>
      <Operator symbol="=" />
      {terms.map((term, index) => (
        <span key={term.label} className="flex items-center">
          {index > 0 && <Operator symbol={term.op} />}
          <Term
            label={term.label}
            tone={
              index === 0 ? "neutral" : term.op === "+" ? "add" : "subtract"
            }
          />
        </span>
      ))}
    </div>
  );
}

export function CalculationExplainer() {
  // Namespace'li translator: anahtarlar tip güvenli kalır (şablon literali değil).
  const k = useTranslations("admin.finance.commission.formula");

  return (
    <section className="rounded-lg border border-border bg-surface-elevated p-5">
      <h2 className="text-base font-semibold text-heading">{k("title")}</h2>
      <p className="mt-1 text-sm text-muted">{k("subtitle")}</p>

      {/* KDV kuralı — modelin tamamı bu tek cümlede */}
      <div className="mt-4 rounded-md border border-info-200 bg-info-50 px-4 py-3">
        <p className="text-sm font-medium text-info-800">{k("vatRuleTitle")}</p>
        <p className="mt-1 text-sm text-info-700">{k("vatRule")}</p>
      </div>

      {/* İki taraf, iki formül */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-border-subtle p-4">
          <h3 className="mb-3 text-sm font-semibold text-heading">
            {k("buyerTitle")}
          </h3>
          <Formula
            result={k("buyerResult")}
            terms={[
              { label: k("productPrice"), op: "=" },
              { label: k("buyerShipping"), op: "+" },
              { label: k("buyerCommission"), op: "+" },
              { label: k("buyerServiceFee"), op: "+" },
              { label: k("buyerVat"), op: "+" },
            ]}
          />
          <p className="mt-3 text-xs text-muted">{k("buyerNote")}</p>
        </div>

        <div className="rounded-md border border-border-subtle p-4">
          <h3 className="mb-3 text-sm font-semibold text-heading">
            {k("sellerTitle")}
          </h3>
          <Formula
            result={k("sellerResult")}
            terms={[
              { label: k("productPrice"), op: "=" },
              { label: k("sellerCommission"), op: "−" },
              { label: k("sellerPlatformFee"), op: "−" },
              { label: k("sellerShipping"), op: "−" },
              { label: k("sellerVat"), op: "−" },
              { label: k("withholding"), op: "−" },
            ]}
          />
          <p className="mt-3 text-xs text-muted">{k("sellerNote")}</p>
        </div>
      </div>

      {/* Sayısal örnek — soyut formülü somutlaştırır */}
      <div className="mt-5 overflow-x-auto">
        <h3 className="mb-2 text-sm font-semibold text-heading">
          {k("exampleTitle")}
        </h3>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="py-2 pr-4 font-medium">{k("exampleItem")}</th>
              <th className="py-2 pr-4 text-right font-medium">
                {k("exampleBase")}
              </th>
              <th className="py-2 text-right font-medium">{k("exampleVat")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {EXAMPLE_ROWS.map(({ key, base, vat }) => (
              <tr key={key}>
                <td className="py-2 pr-4 text-body">{k(key)}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-body">
                  {base}
                </td>
                <td className="py-2 text-right tabular-nums text-muted">
                  {vat}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border">
            <tr>
              <td className="py-2 pr-4 font-medium text-heading" colSpan={3}>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span>
                    {k("exampleBuyerPays")}:{" "}
                    <strong className="tabular-nums">614,00 ₺</strong>
                  </span>
                  <span>
                    {k("exampleSellerGets")}:{" "}
                    <strong className="tabular-nums">369,00 ₺</strong>
                  </span>
                  <span>
                    {k("examplePlatform")}:{" "}
                    <strong className="tabular-nums">245,00 ₺</strong>
                  </span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-xs text-muted">{k("exampleNote")}</p>
      </div>
    </section>
  );
}
