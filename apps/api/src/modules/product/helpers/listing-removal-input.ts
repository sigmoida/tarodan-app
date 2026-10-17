import { BadRequestException } from "@nestjs/common";
import { ListingRemovalReason } from "@prisma/client";
import type { MessageKey } from "@tarodan/i18n";
import {
  LISTING_REMOVAL_DETAIL_MAX_LENGTH,
  listingRemovalIssue,
  normalizeListingRemovalInput,
  type ListingRemovalInput,
  type ListingRemovalIssue,
} from "@tarodan/types";
import { i18nMessage } from "../../i18n";
import type { ListingRemovalEntry } from "./listing-removal";

/**
 * Paylaşılan kuralın sorunu → API'nin yanıt anahtarı. Formların gösterdiği
 * metinle AYNI anahtar (`validation.listingRemoval.*`): bir mesaj iki adla
 * iki kez yazılmaz.
 */
const ISSUE_KEY: Record<ListingRemovalIssue, MessageKey> = {
  reason_required: "validation.listingRemoval.reason_required",
  reason_not_allowed: "validation.listingRemoval.reason_not_allowed",
  platform_required: "validation.listingRemoval.platform_required",
  platform_invalid: "validation.listingRemoval.platform_invalid",
  platform_not_allowed: "validation.listingRemoval.platform_not_allowed",
  violation_required: "validation.listingRemoval.violation_required",
  violation_invalid: "validation.listingRemoval.violation_invalid",
  violation_not_allowed: "validation.listingRemoval.violation_not_allowed",
  detail_required: "validation.listingRemoval.detail_required",
  detail_too_long: "validation.listingRemoval.detail_too_long",
};

function throwIssue(issue: ListingRemovalIssue): never {
  throw new BadRequestException(
    i18nMessage(ISSUE_KEY[issue], { max: LISTING_REMOVAL_DETAIL_MAX_LENGTH }),
  );
}

/** Kayda giden neden alanları (ürün kimliği/statüleri çağırandadır). */
export type ListingRemovalReasonFields = Pick<
  ListingRemovalEntry,
  "reason" | "platform" | "violationCode" | "detail"
>;

/**
 * Satıcının silme/pasife alma isteğindeki nedeni doğrular ve kayda çevirir.
 *
 * Geriye uyum: yayındaki mobil sürümler neden göndermez. Hiçbir neden alanı
 * gelmediyse istek KABUL edilir ve kaldırma `not_given` olarak kaydedilir.
 * Herhangi bir alan geldiyse paylaşılan kuralın tamamı uygulanır (web/mobil
 * formuyla aynı kural) — ör. nedensiz açıklama 400 döner, sessizce düşmez.
 */
export function sellerRemovalFields(
  action: "delete" | "deactivate",
  input: ListingRemovalInput | null | undefined,
): ListingRemovalReasonFields {
  const normalized = normalizeListingRemovalInput(input);
  const sentAnything =
    normalized.reason !== null ||
    normalized.platform !== null ||
    normalized.violationCode !== null ||
    normalized.detail !== null;
  if (!sentAnything) {
    return {
      reason: ListingRemovalReason.not_given,
      platform: null,
      violationCode: null,
      detail: null,
    };
  }

  const issue = listingRemovalIssue({ actor: "seller", action }, normalized);
  if (issue) throwIssue(issue);

  return {
    // Kural nedeni seçenekler içinde doğruladı; Prisma enum'u aynı değerleri
    // taşır (kontrat spec'i).
    reason: normalized.reason as ListingRemovalReason,
    platform: normalized.platform,
    violationCode: null,
    detail: normalized.detail,
  };
}

/**
 * Yöneticinin reddi/kaldırması: neden her zaman `policy_violation`.
 *
 * Geriye uyum: ihlal kodu eklenmeden önce yazılmış istemciler (moderasyon
 * kuyruğu, toplu red, e2e akışları) yalnız açıklama gönderir — kodsuz istek
 * KABUL edilir ve `violationCode = null` ("belirtilmedi") kaydedilir. Kod
 * gönderildiyse paylaşılan kuralın tamamı uygulanır. Admin paneli kodu her
 * zaman zorunlu tutar.
 */
export function adminRemovalFields(
  action: "delete" | "reject",
  input: { violationCode?: string | null; detail?: string | null },
): ListingRemovalReasonFields {
  const normalized = normalizeListingRemovalInput(input);
  if (normalized.violationCode !== null) {
    const issue = listingRemovalIssue(
      { actor: "admin", action },
      { ...normalized, reason: ListingRemovalReason.policy_violation },
    );
    if (issue) throwIssue(issue);
  } else if (
    normalized.detail !== null &&
    normalized.detail.length > LISTING_REMOVAL_DETAIL_MAX_LENGTH
  ) {
    throwIssue("detail_too_long");
  }

  return {
    reason: ListingRemovalReason.policy_violation,
    platform: null,
    violationCode: normalized.violationCode,
    detail: normalized.detail,
  };
}
