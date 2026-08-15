"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CreditCardIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Button, Spinner, ConfirmDialog } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyStateCard } from "@/components/ui";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import type { SavedCard } from "@/lib/api";
import { useSavedCards, useDeleteCard } from "./_hooks/useSavedCards";
import SavedCardCard from "./_components/SavedCardCard";

export default function PaymentMethodsPage() {
  const t = useTranslations();
  const { ready } = useRequireAuth();
  const [toDelete, setToDelete] = useState<SavedCard | null>(null);

  const { cards, isLoading, isError, isFetching, refetch } =
    useSavedCards(ready);
  const deleteCard = useDeleteCard();

  if (!ready) return <AuthLoadingScreen />;

  const confirmDelete = () => {
    if (!toDelete) return;
    deleteCard.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
  };

  return (
    <PageShell className="pb-16">
      <PageHeader
        title={t("profile.paymentMethods.kayitliKartlarim")}
        description={t(
          "profile.paymentMethods.otomatikYenilemeVeHizliOdemeIcin",
        )}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : isError ? (
        <EmptyStateCard
          title={t("payment.savedCardsLoadFailed")}
          description={t("payment.savedCardsLoadFailedDesc")}
          action={
            <Button
              onClick={() => void refetch()}
              isLoading={isFetching}
              disabled={isFetching}
            >
              {t("common.tryAgain")}
            </Button>
          }
        />
      ) : cards.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-elevated p-8 text-center">
          <CreditCardIcon className="mx-auto mb-3 h-12 w-12 text-muted" />
          <p className="text-muted">
            {t("profile.paymentMethods.kayitliKartinYok")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t(
              "profile.paymentMethods.birOdemeYaparkenKartimiKaydetSecenegini",
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <SavedCardCard key={c.id} card={c} onDelete={setToDelete} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-xs text-muted">
        <ShieldCheckIcon className="h-4 w-4 text-success-500" />
        <span>
          {t(
            "profile.paymentMethods.kartlarinPayTRGuvenliKasasindaSaklanirNumara",
          )}
        </span>
      </div>

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title={t("profile.paymentMethods.kartiSil")}
        description={
          toDelete
            ? t("profile.paymentMethods.kartLast4KartiniSilmekIstedigineEmin", {
                Kart: toDelete.brand || "Kart",
                last4: toDelete.last4,
              })
            : ""
        }
        confirmLabel="Sil"
        cancelLabel={t("profile.paymentMethods.vazgec")}
        closeLabel={t("common.close")}
        isLoading={deleteCard.isPending}
        destructive
      />
    </PageShell>
  );
}
