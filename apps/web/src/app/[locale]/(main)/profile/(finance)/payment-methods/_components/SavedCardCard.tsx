/** @format */

"use client";

import { CreditCardIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Badge, IconButton } from "@tarodan/ui";
import type { SavedCard } from "@/lib/api";
import type { Translate } from "@/types/i18n";
import { useTranslations } from "next-intl";

const CARD_TYPE_LABELS = (t: Translate): Record<string, string> => ({
  credit: t("profile.savedCard.krediKarti"),
  debit: t("profile.savedCard.bankaKarti"),
});

export default function SavedCardCard({
  card,
  onDelete,
}: {
  card: SavedCard;
  onDelete: (card: SavedCard) => void;
}) {
  const t = useTranslations();
  const cardTypeLabel = card.cardType
    ? (CARD_TYPE_LABELS(t)[card.cardType] ?? null)
    : null;
  const meta = [card.bank, cardTypeLabel].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface-elevated p-4">
      <CreditCardIcon className="h-8 w-8 flex-shrink-0 text-primary-500" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-heading">
            {card.brand || "Kart"} •••• {card.last4}
          </span>
          {card.cardScheme && (
            <Badge variant="secondary" size="sm">
              {card.cardScheme.toUpperCase()}
            </Badge>
          )}
          {card.isDefault && (
            <Badge variant="primary" size="sm">
              {t("profile.savedCard.varsayilan")}
            </Badge>
          )}
          {card.autoRenewEligible ? (
            <Badge variant="success" size="sm">
              {t("profile.savedCard.otoYenilemeyeUygun")}
            </Badge>
          ) : (
            <Badge variant="warning" size="sm">
              {t("profile.savedCard.cvvGerektirir")}
            </Badge>
          )}
          {card.businessCard && (
            <Badge variant="outline" size="sm">
              Kurumsal
            </Badge>
          )}
        </div>
        {meta && <p className="mt-0.5 text-sm text-muted">{meta}</p>}
        {card.expMonth && card.expYear && (
          <p className="mt-0.5 text-sm text-muted">
            Son kullanma: {card.expMonth}/{card.expYear}
          </p>
        )}
      </div>
      <IconButton
        variant="danger"
        aria-label={t("profile.savedCard.kartiSil")}
        onClick={() => onDelete(card)}
        className="flex-shrink-0"
      >
        <TrashIcon className="h-5 w-5" />
      </IconButton>
    </div>
  );
}
