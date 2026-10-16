/** @format */

"use client";

import { useTranslations } from "next-intl";
import { Badge, maskIban } from "@tarodan/ui";
import { formatDate } from "@/lib/format";

export interface BankAccountSummaryProps {
  accountHolder: string;
  iban: string;
  updatedAt?: string | null;
}

/**
 * Kayıtlı hesap özeti — maskeli IBAN, hesap sahibi, "Kayıtlı" rozeti ve son
 * güncelleme. Profil ve satıcı belgeleri aynı bileşeni kullanır (tek kaynak).
 */
export function BankAccountSummary({
  accountHolder,
  iban,
  updatedAt,
}: BankAccountSummaryProps) {
  const t = useTranslations();
  const updated = formatDate(updatedAt);

  return (
    <div
      data-testid="bank-account-summary"
      className="mb-4 rounded-lg border border-success-200 bg-success-50 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm text-heading">{maskIban(iban)}</span>
        <Badge variant="success">{t("bankAccount.savedBadge")}</Badge>
      </div>
      <p className="mt-1 text-sm text-body">{accountHolder}</p>
      {updated && (
        <p className="mt-0.5 text-xs text-muted">
          {t("bankAccount.lastUpdated", { date: updated })}
        </p>
      )}
    </div>
  );
}
