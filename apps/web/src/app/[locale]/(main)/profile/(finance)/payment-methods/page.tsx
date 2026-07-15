"use client";

import { useState } from "react";
import { CreditCardIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Spinner, ConfirmDialog } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import type { SavedCard } from "@/lib/api";
import { useSavedCards, useDeleteCard } from "./_hooks/useSavedCards";
import SavedCardCard from "./_components/SavedCardCard";

export default function PaymentMethodsPage() {
  const { ready } = useRequireAuth();
  const [toDelete, setToDelete] = useState<SavedCard | null>(null);

  const { cards, isLoading } = useSavedCards(ready);
  const deleteCard = useDeleteCard();

  if (!ready) return <AuthLoadingScreen />;

  const confirmDelete = () => {
    if (!toDelete) return;
    deleteCard.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
  };

  return (
    <PageShell className="pb-16">
      <PageHeader
        title="Kayıtlı Kartlarım"
        description='Otomatik yenileme ve hızlı ödeme için kayıtlı kartların. Yeni kart, ödeme sırasında "kartımı kaydet" ile eklenir.'
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-elevated p-8 text-center">
          <CreditCardIcon className="mx-auto mb-3 h-12 w-12 text-muted" />
          <p className="text-muted">Kayıtlı kartın yok.</p>
          <p className="mt-1 text-sm text-muted">
            Bir ödeme yaparken "kartımı kaydet" seçeneğini işaretleyerek kart
            ekleyebilirsin.
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
          Kartların PayTR güvenli kasasında saklanır; numara/CVV bizde tutulmaz.
        </span>
      </div>

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Kartı sil"
        description={
          toDelete
            ? `${toDelete.brand || "Kart"} •••• ${toDelete.last4} kartını silmek istediğine emin misin? Bu kartla otomatik yenileme yapılamaz hale gelir.`
            : ""
        }
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        isLoading={deleteCard.isPending}
        destructive
      />
    </PageShell>
  );
}
