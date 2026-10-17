/** @format */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Modal } from "@tarodan/ui";
import {
  CONSENT_DOCUMENT_I18N_KEYS,
  type ConsentDocumentKey,
} from "@tarodan/types";
import type { usePendingConsents } from "@/hooks/usePendingConsents";
import { useAuthStore } from "@/stores/authStore";
import { canSubmitConsents } from "@/lib/consentGate";

type PendingConsents = ReturnType<typeof usePendingConsents>;

/**
 * Yeniden-onay penceresi — onayı olmayan ya da onayladığı belgenin sürümü
 * değişen üye, siteyi kullanmaya devam etmeden önce zorunlu belgeleri
 * (kullanım şartları, gizlilik, KVKK) onaylar.
 *
 * Kimin bekletileceğine sunucu karar verir (`GET /consents/me/pending`); ne
 * zaman gösterileceğine `RequiredStepsGate` (zorunlu adımların sırası, yasal
 * metin sayfası muafiyeti). Burada yalnız liste çizilir. Kapatılamaz: tek çıkış
 * onaylamak ya da oturumu kapatmaktır.
 */
export default function ConsentGate({
  pending,
  accept,
}: Pick<PendingConsents, "pending" | "accept">) {
  const t = useTranslations();
  const logout = useAuthStore((state) => state.logout);
  const [checked, setChecked] = useState<Set<ConsentDocumentKey>>(new Set());

  const toggle = (document: ConsentDocumentKey, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(document);
      else next.delete(document);
      return next;
    });

  const updated = pending.some((p) => p.reason === "outdated");

  return (
    <Modal
      isOpen
      onClose={() => undefined}
      title={t("legal.consentGate.title")}
      size="lg"
      showCloseButton={false}
      closeOnBackdrop={false}
      closeOnEscape={false}
      dismissDisabled
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => void logout()}
            disabled={accept.isPending}
          >
            {t("common.logout")}
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={!canSubmitConsents(pending, checked)}
            isLoading={accept.isPending}
            onClick={() =>
              accept.mutate(
                pending.map((p) => p.document),
                // Kapı yeniden açılırsa (yeni sürüm) kutular boş başlasın.
                { onSuccess: () => setChecked(new Set()) },
              )
            }
          >
            {t("legal.consentGate.submit")}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">
        {updated
          ? t("legal.consentGate.updatedIntro")
          : t("legal.consentGate.intro")}
      </p>
      <div className="space-y-3">
        {pending.map((p) => (
          <Checkbox
            key={p.document}
            checked={checked.has(p.document)}
            onChange={(e) => toggle(p.document, e.target.checked)}
            label={t.rich("legal.consentGate.acceptRich", {
              document: t(CONSENT_DOCUMENT_I18N_KEYS[p.document]),
              link: (chunks) =>
                p.path ? (
                  <a
                    href={p.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary-600 underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {chunks}
                  </a>
                ) : (
                  <span className="font-medium">{chunks}</span>
                ),
            })}
          />
        ))}
      </div>
    </Modal>
  );
}
