"use client";

import { useTranslations } from "next-intl";
import { Badge, offerStatusConfig } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtDateTime, fmtTry } from "@/lib/format";
import { statusConfig } from "@/lib/statusLabels";
import type { OfferChainEntry } from "../_lib/types";

/**
 * Pazarlık geçmişi: karşı teklifler YENİ satır açar, önceki tur `rejected`
 * (supersededBy*) kapanır. Zincir = aynı (ürün, alıcı, satıcı) satırları.
 */
export function OfferChainSection({ chain }: { chain: OfferChainEntry[] }) {
  const t = useTranslations();
  return (
    <SectionCard title={t("admin.operations.offers.chainTitle")}>
      <p className="mb-3 text-xs text-muted">
        {t("admin.operations.offers.chainNote")}
      </p>
      <ol className="divide-y divide-border">
        {chain.map((entry, index) => (
          <li
            key={entry.id}
            className={`flex flex-wrap items-center gap-3 py-2 text-sm ${
              entry.isCurrent ? "font-medium" : ""
            }`}
          >
            <span className="w-6 text-muted">{index + 1}.</span>
            <Badge variant={entry.actor === "seller" ? "info" : "default"}>
              {entry.actor === "seller"
                ? t("admin.operations.offers.chainActor.seller")
                : t("admin.operations.offers.chainActor.buyer")}
            </Badge>
            <span className="tabular-nums">{fmtTry(entry.amount)}</span>
            <span className="text-muted">{fmtDateTime(entry.createdAt)}</span>
            <Badge
              status={entry.status}
              config={statusConfig(offerStatusConfig, t)}
            />
            {entry.isCurrent && (
              <span className="text-xs text-primary-600">
                {t("admin.operations.offers.chainCurrent")}
              </span>
            )}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
