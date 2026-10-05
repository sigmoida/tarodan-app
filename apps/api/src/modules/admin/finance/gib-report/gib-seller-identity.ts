import { BusinessStatus, Prisma } from "@prisma/client";
import type {
  GibIdentityKind,
  GibNameSource,
  GibSellerKind,
} from "@tarodan/types";

import { ANONYMIZED_DISPLAY_NAME } from "../../../../common/helpers/deleted-user-identity";
import {
  publicName,
  publicUsername,
} from "../../../../common/helpers/public-identity";
import { hasApprovedCorporateIdentity } from "../../../membership/helpers/membership.util";

/**
 * GİB raporunun satıcı kimliği — TEK çözümleyici (liste ve Excel dökümü aynı
 * fonksiyonu kullanır; kural iki yerde yazılmaz).
 *
 * Yasal ad zinciri (her adım için İLK DOLU kaynak kazanır, kaynak satırla
 * birlikte döner ki personel güvenilirliği yargılayabilsin):
 *
 *   1. Onaylı kurumsal satıcı → firma adı                      (company)
 *   2. Banka hesabı sahibi                                      (bank_account_holder)
 *   3. Varsayılan adresin ad-soyadı (başkasının adı olabilir)   (address)
 *   4. Görünen ad (takma ad olabilir — en zayıf kaynak)         (display_name)
 *
 * Silinmiş hesap canlı satırdan DEĞİL kimlik arşivinden çözülür (anonimleştirme
 * adı "Silinmiş Kullanıcı" yapıp VKN'yi siler); arşiv yoksa ad boş kalır —
 * sentinel değer bir devlet dosyasına sızmaz. Tahmin edilmez: bulunamayan alan
 * `null`, kaynak `none`.
 */

/** Canlı `users` satırından okunan alanlar (`GIB_SELLER_SELECT` ile birebir). */
export interface GibSellerSource {
  id: string;
  username: string;
  displayName: string;
  companyName: string | null;
  taxId: string | null;
  businessStatus: BusinessStatus | null;
  createdAt: Date;
  deletedAt: Date | null;
  bankAccount: {
    accountHolder: string | null;
    tcKimlikNo: string | null;
    taxId: string | null;
  } | null;
  /** Varsayılan adres ÖNDE sıralı gelir; yalnız ilki okunur. */
  addresses: { fullName: string | null }[];
  deletedIdentity: {
    displayName: string | null;
    companyName: string | null;
    taxId: string | null;
    nationalId: string | null;
    bankAccountHolder: string | null;
    businessStatus: BusinessStatus | null;
  } | null;
}

/** `GibSellerSource`un tek okuma kaynağı — rapor yalnız bunları çeker. */
export const GIB_SELLER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  companyName: true,
  taxId: true,
  businessStatus: true,
  createdAt: true,
  deletedAt: true,
  bankAccount: {
    select: { accountHolder: true, tcKimlikNo: true, taxId: true },
  },
  addresses: {
    select: { fullName: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    take: 1,
  },
  deletedIdentity: {
    select: {
      displayName: true,
      companyName: true,
      taxId: true,
      nationalId: true,
      bankAccountHolder: true,
      businessStatus: true,
    },
  },
} satisfies Prisma.UserSelect;

export interface GibSellerIdentity {
  sellerKind: GibSellerKind;
  sellerDeleted: boolean;
  membershipDate: Date;
  identityNumber: string | null;
  identityKind: GibIdentityKind | null;
  legalName: string | null;
  legalNameSource: GibNameSource;
  /** Herkese açık mağaza / profil adı; silinmiş hesapta null. */
  storeName: string | null;
  /** Profil yolu için kullanıcı adı ya da id; silinmiş hesapta null. */
  profileHandle: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** İlk dolu aday kazanır; kaynağıyla birlikte. */
function firstFilled(
  candidates: [value: string | null | undefined, source: GibNameSource][],
): { name: string | null; source: GibNameSource } {
  for (const [value, source] of candidates) {
    const name = clean(value);
    if (name) return { name, source };
  }
  return { name: null, source: "none" };
}

/** Vergi no önce (kurumsalda VKN, bireysel esnafta vergi no), yoksa TCKN. */
function pickIdentityNumber(
  taxNumbers: (string | null | undefined)[],
  tckn: string | null | undefined,
): Pick<GibSellerIdentity, "identityNumber" | "identityKind"> {
  for (const taxNumber of taxNumbers) {
    const value = clean(taxNumber);
    if (value) return { identityNumber: value, identityKind: "tax_number" };
  }
  const nationalId = clean(tckn);
  return nationalId
    ? { identityNumber: nationalId, identityKind: "tckn" }
    : { identityNumber: null, identityKind: null };
}

export function resolveGibSellerIdentity(
  seller: GibSellerSource,
): GibSellerIdentity {
  const deleted = seller.deletedAt !== null;

  if (deleted) {
    const archive = seller.deletedIdentity;
    const corporate = hasApprovedCorporateIdentity(archive);
    const { name, source } = archive
      ? firstFilled([
          [corporate ? archive.companyName : null, "archive_company"],
          [archive.bankAccountHolder, "archive_bank_account_holder"],
          [archive.displayName, "archive_display_name"],
        ])
      : { name: null, source: "none" as const };
    return {
      sellerKind: corporate ? "corporate" : "individual",
      sellerDeleted: true,
      membershipDate: seller.createdAt,
      ...pickIdentityNumber([archive?.taxId], archive?.nationalId),
      legalName: name,
      legalNameSource: source,
      storeName: null,
      profileHandle: null,
    };
  }

  const corporate = hasApprovedCorporateIdentity(seller);
  const { name, source } = firstFilled([
    [corporate ? seller.companyName : null, "company"],
    [seller.bankAccount?.accountHolder, "bank_account_holder"],
    [seller.addresses[0]?.fullName, "address"],
    // Anonimleştirilmiş ama `deletedAt`i henüz yazılmamış satır beklenmez; yine
    // de sentinel ad hiçbir koşulda kimlik sayılmaz.
    [
      clean(seller.displayName) === ANONYMIZED_DISPLAY_NAME
        ? null
        : seller.displayName,
      "display_name",
    ],
  ]);
  return {
    sellerKind: corporate ? "corporate" : "individual",
    sellerDeleted: false,
    membershipDate: seller.createdAt,
    ...pickIdentityNumber(
      [seller.taxId, seller.bankAccount?.taxId],
      seller.bankAccount?.tcKimlikNo,
    ),
    legalName: name,
    legalNameSource: source,
    storeName: publicName(seller),
    profileHandle: publicUsername(seller) ?? seller.id,
  };
}
