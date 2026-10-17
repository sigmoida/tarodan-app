import { getProductEffectivePrice } from "@/lib/product-price";
import { fmtTry } from "@/lib/format";
import { Panel } from "@/components/detail/Panel";
import { SectionCard } from "@/components/detail/SectionCard";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { TextLink } from "@/components/TextLink";
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
        <TextLink
          href={`/accounts/users/${user.id}`}
          className="block font-medium"
        >
          {user.displayName}
        </TextLink>
        <p className="text-sm text-muted">{user.email}</p>
      </div>
      <div className="space-y-3">
        <SectionTitle size="sm">{itemsTitle}</SectionTitle>
        {items.map((item) => (
          <Panel key={item.id} padding="sm" className="flex gap-3">
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
              <TextLink
                href={`/catalog/products/${item.product.id}`}
                className="text-sm font-medium"
              >
                {item.product.title}
              </TextLink>
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
                  <TextLink
                    href={`/finance/commission?ruleId=${item.commissionRule.ruleId}`}
                    className="font-medium"
                  >
                    {item.commissionRule.ruleName}
                  </TextLink>
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
          </Panel>
        ))}
      </div>
    </SectionCard>
  );
}
