import Link from "next/link";
import { getProductEffectivePrice } from "@/lib/product-price";
import { fmtTry } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
import type { TradeItem } from "../types";
import { useTranslations } from "next-intl";

/** A trade party (initiator/receiver) with their offered items. */
export function TradePartyCard({
  title,
  itemsTitle,
  user,
  items,
}: {
  title: string;
  itemsTitle: string;
  user: { id: string; displayName: string; email: string };
  items: TradeItem[];
}) {
  const t = useTranslations();
  return (
    <SectionCard title={title}>
      <div className="mb-4 space-y-2">
        <Link
          href={`/accounts/users/${user.id}`}
          className="block font-medium text-primary-600 hover:text-primary-700"
        >
          {user.displayName}
        </Link>
        <p className="text-sm text-muted">{user.email}</p>
      </div>
      <div className="space-y-3">
        <h3 className="font-medium text-heading">{itemsTitle}</h3>
        {items.map((item) => (
          <div key={item.id} className="flex gap-3 rounded-lg bg-surface p-3">
            {item.product.images && item.product.images.length > 0 && (
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.product.images[0].url}
                  alt={item.product.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="flex-1">
              <Link
                href={`/catalog/products/${item.product.id}`}
                className="text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                {item.product.title}
              </Link>
              <p className="text-xs text-muted">
                {fmtTry(getProductEffectivePrice(item.product))}
              </p>
              {item.commissionRule && (
                <div className="mt-2 border-t border-border-subtle pt-2 text-xs">
                  <p className="text-muted">
                    {item.commissionRule.source === "snapshot"
                      ? t("admin.operations.trades.appliedCommissionRule")
                      : t("admin.operations.trades.currentCommissionRule")}
                  </p>
                  <Link
                    href={`/finance/commission?ruleId=${item.commissionRule.ruleId}`}
                    className="font-medium text-primary-600 hover:underline"
                  >
                    {item.commissionRule.ruleName}
                  </Link>
                  <p className="mt-0.5 text-muted">
                    {t("admin.operations.trades.commissionRuleMeta", {
                      version: item.commissionRule.ruleSetVersion,
                      sellerType: item.commissionRule.sellerType,
                      amount: fmtTry(item.commissionRule.matchedAmount),
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
