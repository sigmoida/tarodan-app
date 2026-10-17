import {
  LISTING_REMOVAL_ACTORS,
  LISTING_REMOVAL_DETAIL_MAX_LENGTH,
  LISTING_REMOVAL_REASONS,
  LISTING_REMOVAL_REASON_FILTER_UNKNOWN,
  LISTING_REMOVAL_UNKNOWN_I18N_KEY,
  LISTING_VIOLATION_CODES,
  listingRemovalActorI18nKey,
  listingRemovalIssueI18nKey,
  listingRemovalPlatformI18nKey,
  listingRemovalReasonI18nKey,
  listingViolationI18nKey,
  type AdminListingRemovalSummary,
  type ListingRemovalActor,
  type ListingRemovalIssue,
  type ListingRemovalReason,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import type { SelectOption } from "@tarodan/ui";
import type { Translate } from "@/lib/statusLabels";

/**
 * Kaldırma nedeninin admin görünümü — liste kolonu, filtreler, detay geçmişi
 * ve red/kaldırma formları bu saf türetmeleri okur. Katalog ve etiket
 * anahtarları `@tarodan/types`te (API ve dashboard aynı kaynağı kullanır).
 */

/** Nedenin etiketi; `null` = bu özellikten önce düşmüş ilan → "Bilinmiyor". */
export function removalReasonLabel(
  reason: ListingRemovalReason | null | undefined,
  t: Translate,
): string {
  return t(listingRemovalReasonI18nKey(reason) as MessageKey);
}

/** Kaldıranın etiketi (satıcı / sistem / Tarodan); bilinmiyorsa "Bilinmiyor". */
export function removalActorLabel(
  actor: ListingRemovalActor | null | undefined,
  t: Translate,
): string {
  return t(listingRemovalActorI18nKey(actor) as MessageKey);
}

/** Platform etiketi; katalog dışı değer ham gösterilir, boş → `null`. */
export function removalPlatformLabel(
  platform: string | null | undefined,
  t: Translate,
): string | null {
  if (!platform) return null;
  const key = listingRemovalPlatformI18nKey(platform);
  return key ? t(key as MessageKey) : platform;
}

/**
 * İhlal kodu etiketi; kodsuz (eski istemciden) red → "Belirtilmedi",
 * katalogdan çıkarılmış kod → ham kod.
 */
export function violationLabel(
  code: string | null | undefined,
  t: Translate,
): string {
  if (!code) return t("admin.catalog.products.removal.noViolationCode");
  const key = listingViolationI18nKey(code);
  return key ? t(key as MessageKey) : code;
}

/** Kaydın ayrıntı etiketi: platform (başka yerde satış) ya da ihlal kodu. */
export function removalDetailLabel(
  entry: {
    reason: ListingRemovalReason | null;
    platform: string | null;
    violationCode: string | null;
  },
  t: Translate,
): string | null {
  if (entry.reason === "sold_elsewhere") {
    return removalPlatformLabel(entry.platform, t);
  }
  if (entry.reason === "policy_violation") {
    return violationLabel(entry.violationCode, t);
  }
  return null;
}

/**
 * Liste kolonu: vitrindeki ilan için `null` (boş hücre); düşmüş ilan için
 * neden + ikincil satır (kaldıran · platform/ihlal).
 */
export function removalCell(
  removal: AdminListingRemovalSummary | null | undefined,
  t: Translate,
): { label: string; secondary: string | null } | null {
  if (!removal) return null;
  const parts = [
    removal.actor ? removalActorLabel(removal.actor, t) : null,
    removalDetailLabel(removal, t),
  ].filter((part): part is string => !!part);
  return {
    label: removalReasonLabel(removal.reason, t),
    secondary: parts.length > 0 ? parts.join(" · ") : null,
  };
}

/**
 * "Kaldırma nedeni" filtresi. İlk seçenek NÖTR ("Tüm nedenler", boş değer):
 * aksi hâlde liste ilk açılışta süzülmüş gelirdi. Sonda "Bilinmiyor" — nedeni
 * kaydedilmemiş (eski) kaldırmalar.
 */
export function removalReasonFilterOptions(t: Translate): SelectOption[] {
  return [
    { value: "", label: t("admin.catalog.products.removal.allReasons") },
    ...LISTING_REMOVAL_REASONS.map((reason) => ({
      value: reason,
      label: removalReasonLabel(reason, t),
    })),
    {
      value: LISTING_REMOVAL_REASON_FILTER_UNKNOWN,
      label: t(LISTING_REMOVAL_UNKNOWN_I18N_KEY as MessageKey),
    },
  ];
}

/** "Kaldıran" filtresi — nötr ilk seçenekle. */
export function removalActorFilterOptions(t: Translate): SelectOption[] {
  return [
    { value: "", label: t("admin.catalog.products.removal.allActors") },
    ...LISTING_REMOVAL_ACTORS.map((actor) => ({
      value: actor,
      label: removalActorLabel(actor, t),
    })),
  ];
}

/** Red/kaldırma formlarının ihlal kodu seçenekleri (yer tutucu katalog). */
export function violationCodeOptions(t: Translate): SelectOption[] {
  return LISTING_VIOLATION_CODES.map((code) => ({
    value: code,
    label: violationLabel(code, t),
  }));
}

/** Paylaşılan kuralın sorunu → form hata metni. */
export function removalIssueMessage(
  issue: ListingRemovalIssue,
  t: Translate,
): string {
  return t(listingRemovalIssueI18nKey(issue) as MessageKey, {
    max: LISTING_REMOVAL_DETAIL_MAX_LENGTH,
  });
}
