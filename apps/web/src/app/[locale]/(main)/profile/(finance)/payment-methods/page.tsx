"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CreditCardIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Spinner, ConfirmDialog } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui";
import ErrorState from "@/components/feedback/ErrorState";
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
        <ErrorState
          title={t("payment.savedCardsLoadFailed")}
          description={t("payment.savedCardsLoadFailedDesc")}
          reset={() => void refetch()}
          retrying={isFetching}
          inline
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<CreditCardIcon className="h-7 w-7" />}
          title={t("profile.paymentMethods.kayitliKartinYok")}
          description={t(
            "profile.paymentMethods.birOdemeYaparkenKartimiKaydetSecenegini",
          )}
        />
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
