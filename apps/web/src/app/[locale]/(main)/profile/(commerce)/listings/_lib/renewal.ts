/** @format */

import type { MessageKey } from "@tarodan/i18n";
import type { Translate } from "@/types/i18n";

/** `POST /products/:id/renew` yanıtı: yayına döndü ya da onaya düştü. */
export interface RenewResult {
  id: string;
  status: "active" | "pending";
}

/** `POST /products/my/renew` yanıtında ilan başına sonuç. */
export type RenewItem =
  | { id: string; ok: true; status: "active" | "pending" }
  | {
      id: string;
      ok: false;
      errorKey: string;
      errorParams?: Record<string, unknown>;
    };

export interface RenewBatch {
  results: RenewItem[];
  renewed: number;
  submitted: number;
  failed: number;
}

/** Yanıt zarflı (`{ data }`) ya da düz gelebilir. */
export function readRenewBatch(raw: unknown): RenewBatch {
  const body = raw as { data?: RenewBatch } & Partial<RenewBatch>;
  const batch = body?.data?.results ? body.data : body;
  return {
    results: batch?.results ?? [],
    renewed: batch?.renewed ?? 0,
    submitted: batch?.submitted ?? 0,
    failed: batch?.failed ?? 0,
  };
}

/** Bildirimde en çok kaç başarısız ilan tek tek yazılır (kalanı toplam sayıda). */
const MAX_FAILURE_LINES = 3;

/**
 * Başarısız ilanların satırları ("başlık: neden"). Neden, API'nin döndüğü
 * katalog anahtarından kullanıcının dilinde çizilir.
 */
export function renewalFailureLines(
  batch: RenewBatch,
  titleOf: (id: string) => string,
  t: Translate,
): string[] {
  return batch.results
    .filter(
      (item): item is Extract<RenewItem, { ok: false }> => item.ok === false,
    )
    .slice(0, MAX_FAILURE_LINES)
    .map((item) =>
      t("profile.expiredListings.failedItem", {
        title: titleOf(item.id),
        reason: t(
          item.errorKey as MessageKey,
          (item.errorParams ?? {}) as Record<string, string | number>,
        ),
      }),
    );
}
