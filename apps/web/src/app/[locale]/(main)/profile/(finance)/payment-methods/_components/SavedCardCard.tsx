/** @format */

"use client";

import { CreditCardIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Badge, IconButton } from "@tarodan/ui";
import type { SavedCard } from "@/lib/api";

const CARD_TYPE_LABELS: Record<string, string> = {
  credit: "Kredi kartı",
  debit: "Banka kartı",
};

export default function SavedCardCard({
  card,
  onDelete,
}: {
  card: SavedCard;
  onDelete: (card: SavedCard) => void;
}) {
  const cardTypeLabel = card.cardType
    ? (CARD_TYPE_LABELS[card.cardType] ?? null)
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
              Varsayılan
            </Badge>
          )}
          {card.autoRenewEligible ? (
            <Badge variant="success" size="sm">
              Oto-yenilemeye uygun
            </Badge>
          ) : (
            <Badge variant="warning" size="sm">
              CVV gerektirir
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
        aria-label="Kartı sil"
        onClick={() => onDelete(card)}
        className="flex-shrink-0"
      >
        <TrashIcon className="h-5 w-5" />
      </IconButton>
    </div>
  );
}
