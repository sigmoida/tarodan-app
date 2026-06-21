"use client";

/**
 * Kayıtlı Kartlarım — kullanıcının PayTR'da saklı kartlarını listeler ve siler.
 * Kart EKLEME ödeme sırasında olur (checkout'ta "kartımı kaydet"); burada yalnız
 * listeleme + silme + oto-yenileme bilgisi. PAN/CVV asla gösterilmez/saklanmaz.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CreditCardIcon, TrashIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { useAuthStore } from "@/stores/authStore";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { membershipApi, type SavedCard } from "@/lib/api";
import { Button, Spinner, ConfirmDialog } from "@tarodan/ui";

export default function PaymentMethodsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<SavedCard | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: cards, isLoading } = useQuery({
    queryKey: ["saved-cards"],
    queryFn: async () => (await membershipApi.listCards()).data,
    enabled: isAuthenticated,
  });

  if (authLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) {
    if (typeof window !== "undefined") router.push("/login?redirect=/profile/payment-methods");
    return null;
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await membershipApi.deleteCard(toDelete.id);
      toast.success("Kart silindi");
      queryClient.invalidateQueries({ queryKey: ["saved-cards"] });
      setToDelete(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Kart silinemedi");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-heading mb-1">Kayıtlı Kartlarım</h1>
          <p className="text-muted text-sm">
            Otomatik yenileme ve hızlı ödeme için kayıtlı kartların. Yeni kart, ödeme sırasında
            "kartımı kaydet" ile eklenir.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !cards || cards.length === 0 ? (
          <div className="bg-surface-elevated rounded-xl shadow-sm p-8 text-center">
            <CreditCardIcon className="w-12 h-12 text-muted mx-auto mb-3" />
            <p className="text-muted">Kayıtlı kartın yok.</p>
            <p className="text-sm text-muted mt-1">
              Bir ödeme yaparken "kartımı kaydet" seçeneğini işaretleyerek kart ekleyebilirsin.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((c) => (
              <div
                key={c.id}
                className="bg-surface-elevated rounded-xl shadow-sm p-4 flex items-center gap-4"
              >
                <CreditCardIcon className="w-8 h-8 text-primary-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-heading">
                      {c.brand || "Kart"} •••• {c.last4}
                    </span>
                    {c.isDefault && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700">
                        Varsayılan
                      </span>
                    )}
                    {c.autoRenewEligible ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-success-100 text-success-800">
                        Oto-yenilemeye uygun
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-warning-100 text-warning-800">
                        CVV gerektirir
                      </span>
                    )}
                  </div>
                  {c.expMonth && c.expYear && (
                    <p className="text-sm text-muted mt-0.5">
                      Son kullanma: {c.expMonth}/{c.expYear}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setToDelete(c)}
                  className="p-2 rounded-lg text-danger-500 hover:bg-danger-50 transition shrink-0"
                  aria-label="Kartı sil"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted mt-5 justify-center">
          <ShieldCheckIcon className="w-4 h-4 text-success-500" />
          <span>Kartların PayTR güvenli kasasında saklanır; numara/CVV bizde tutulmaz.</span>
        </div>
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
        isLoading={deleting}
        destructive
      />
    </div>
  );
}
