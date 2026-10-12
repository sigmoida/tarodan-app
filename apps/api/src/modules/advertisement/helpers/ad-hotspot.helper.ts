import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { isUUID } from "class-validator";
import {
  AD_HOTSPOT_LABEL_MAX,
  AD_HOTSPOT_MAX,
  AD_HOTSPOT_MIN_SIZE,
  validateAdHotspots,
  type AdHotspotInput,
} from "@tarodan/types";
import { i18nMessage } from "../../i18n";

/**
 * Reklamın tıklama hedefleri — görselli reklamda tıklanabilir alanlar
 * (hotspot), görselsiz reklamda tek `linkUrl`. Alan geometrisinin kuralları
 * `@tarodan/types`'taki `validateAdHotspots`'tadır (admin formu da onu
 * çalıştırır); burada yalnız görsel/bağlantı ilişkisi ve kayıt planı var.
 */

/** Yanıttaki alan alanları — vitrin (`GET /ads/active`) ve mobil bunu okur. */
export const AD_HOTSPOT_PUBLIC_SELECT = {
  id: true,
  x: true,
  y: true,
  width: true,
  height: true,
  label: true,
  linkUrl: true,
  sortOrder: true,
} as const satisfies Prisma.AdHotspotSelect;

/** Admin ayrıca alan başına tık sayısını görür (istatistik). */
export const AD_HOTSPOT_ADMIN_SELECT = {
  ...AD_HOTSPOT_PUBLIC_SELECT,
  clickCount: true,
} as const satisfies Prisma.AdHotspotSelect;

/** Alanlar daima admin'in çizim sırasıyla döner. */
export const AD_HOTSPOT_ORDER_BY = {
  sortOrder: "asc",
} as const satisfies Prisma.AdHotspotOrderByWithRelationInput;

/** İstemcinin gönderdiği alan; `id` kayıtlı bir alanı korur (tık sayacıyla). */
export interface AdHotspotPayload extends AdHotspotInput {
  id?: string;
}

/** Görselli reklam mı? Boş dize "görsel yok" sayılır (eski kayıtlar). */
export function adHasImage(imageUrl: string | null | undefined): boolean {
  return Boolean(imageUrl?.trim());
}

/**
 * Alan listesi geçerli değilse ilk hatayla 400. Parametreler kullanıcıya
 * 1 tabanlı sırayla gösterilir; `code`/`index` istemcinin yeniden işlemesi
 * için ham olarak da taşınır.
 */
export function assertAdHotspotsValid(
  hotspots: readonly AdHotspotInput[],
): void {
  const [first] = validateAdHotspots(hotspots);
  if (!first) return;
  throw new BadRequestException(
    i18nMessage("server.advertisement.hotspotInvalid", {
      code: first.code,
      index: first.index ?? null,
      position: first.index === undefined ? null : first.index + 1,
      other: first.otherIndex === undefined ? null : first.otherIndex + 1,
      max: AD_HOTSPOT_MAX,
      labelMax: AD_HOTSPOT_LABEL_MAX,
      minPercent: Math.round(AD_HOTSPOT_MIN_SIZE * 100),
    }),
  );
}

/** Alanlar için yapılacak iş: dokunma / hepsini sil / listeyi bununla değiştir. */
export type AdHotspotChange =
  | { kind: "keep" }
  | { kind: "clear" }
  | { kind: "replace"; hotspots: readonly AdHotspotPayload[] };

export interface AdClickTargets {
  /** Yazılacak `linkUrl`: `undefined` = dokunma, `null` = temizle. */
  linkUrl: string | null | undefined;
  hotspots: AdHotspotChange;
}

/**
 * Görsel/bağlantı/alan kurallarının TEK yeri; kayıtlı değerler ile gelen
 * yamanın birleşimi (SONUÇ reklam) üzerinde karar verir. Oluşturma, kayıtlı
 * reklamı `{ imageUrl: null }` sayarak aynı fonksiyonu kullanır.
 *
 *  - Görsel var → `linkUrl` daima null (gönderilse de yok sayılır): tıklama
 *    yalnız alanlarda olur.
 *  - Görsel yok → alan gönderilemez (400); görsel bu yamayla kalktıysa
 *    alanları silinir.
 *  - Görsel DEĞİŞTİ ve alan listesi gönderilmedi → eski alanlar silinir:
 *    yeni görselin oranı farklı olabilir, eski dikdörtgenler yanlış yere düşer.
 *  - Alan listesi gönderildi → doğrulanır ve kümenin TAMAMINI değiştirir.
 */
export function resolveAdClickTargets(
  stored: { imageUrl: string | null },
  patch: {
    imageUrl?: string | null;
    linkUrl?: string | null;
    hotspots?: readonly AdHotspotPayload[];
  },
): AdClickTargets {
  const nextImageUrl =
    patch.imageUrl === undefined ? stored.imageUrl : patch.imageUrl;

  if (!adHasImage(nextImageUrl)) {
    if (patch.hotspots?.length) {
      throw new BadRequestException(
        i18nMessage("server.advertisement.hotspotsNeedImage"),
      );
    }
    return {
      linkUrl: patch.linkUrl,
      hotspots: adHasImage(stored.imageUrl)
        ? { kind: "clear" }
        : { kind: "keep" },
    };
  }

  if (patch.hotspots !== undefined) {
    assertAdHotspotsValid(patch.hotspots);
    return {
      linkUrl: null,
      hotspots: { kind: "replace", hotspots: patch.hotspots },
    };
  }

  const imageChanged =
    patch.imageUrl !== undefined && patch.imageUrl !== stored.imageUrl;
  return {
    linkUrl: null,
    hotspots: imageChanged ? { kind: "clear" } : { kind: "keep" },
  };
}

/** Alan satırının yazılabilir alanları; `sortOrder` = listedeki sıra. */
export function adHotspotRowData(hotspot: AdHotspotPayload, sortOrder: number) {
  return {
    x: hotspot.x,
    y: hotspot.y,
    width: hotspot.width,
    height: hotspot.height,
    label: hotspot.label.trim(),
    linkUrl: hotspot.linkUrl,
    sortOrder,
  };
}

export type AdHotspotRowData = ReturnType<typeof adHotspotRowData>;

export interface AdHotspotReplacePlan {
  /** Kalan (güncellenen) kayıtlı alanlar — tık sayaçları korunur. */
  update: { id: string; data: AdHotspotRowData }[];
  /** Yeni alanlar. */
  create: AdHotspotRowData[];
  /** Silinmeyecek kimlikler: bunların dışındaki kayıtlı alanlar silinir. */
  keepIds: string[];
}

/**
 * Küme değişiminin planı. Yalnız BU reklamın kayıtlı alanlarındaki `id`
 * korunur; bilinmeyen ya da başka reklama ait `id` yeni alan sayılır (başka
 * reklamın satırı asla güncellenmez). Aynı `id` iki kez gelirse ikincisi yeni
 * alandır — tek satır iki alana bölünemez.
 */
export function planAdHotspotReplace(
  persistedIds: readonly string[],
  hotspots: readonly AdHotspotPayload[],
): AdHotspotReplacePlan {
  const persisted = new Set(persistedIds);
  const plan: AdHotspotReplacePlan = { update: [], create: [], keepIds: [] };

  hotspots.forEach((hotspot, index) => {
    const data = adHotspotRowData(hotspot, index);
    const id = hotspot.id;
    if (id && persisted.has(id) && !plan.keepIds.includes(id)) {
      plan.keepIds.push(id);
      plan.update.push({ id, data });
    } else {
      plan.create.push(data);
    }
  });

  return plan;
}

/**
 * `POST /ads/:id/click?hotspot=` değeri: `undefined` = gönderilmedi (boş dize
 * de), `null` = geçersiz (uuid değil ya da tekrarlanan parametre dizisi) → tık
 * yok sayılır. 400 dönülmez: beacon hatayı okuyamaz.
 */
export function parseAdHotspotParam(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === "") return undefined;
  return typeof raw === "string" && isUUID(raw) ? raw : null;
}

/**
 * Kimliksiz bir tık sayılır mı? Yalnız görselsiz reklamın tek bağlantısı
 * tıklanır; görselli reklamda tıklama ancak bir alana düşer (`?hotspot=`).
 */
export function adCountsPlainClick(ad: {
  imageUrl: string | null;
  linkUrl: string | null;
}): boolean {
  return !adHasImage(ad.imageUrl) && Boolean(ad.linkUrl);
}
