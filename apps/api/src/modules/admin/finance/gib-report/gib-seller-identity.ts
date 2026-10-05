import { BusinessStatus, Prisma } from "@prisma/client";
import {
  legalFullName,
  type GibIdentityKind,
  type GibNameSource,
  type GibSellerKind,
} from "@tarodan/types";

import {
  ANONYMIZED_DISPLAY_NAME,
  archivedNationalIdIsDeclared,
} from "../../../../common/helpers/deleted-user-identity";
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
 *   2. Üyenin beyan ettiği yasal ad-soyad (kimlik kapısı)       (legal_name)
 *   3. Banka hesabı sahibi                                      (bank_account_holder)
 *   4. Varsayılan adresin ad-soyadı (başkasının adı olabilir)   (address)
 *   5. Görünen ad (takma ad olabilir — en zayıf kaynak)         (display_name)
 *
 * Kimlik numarası: kurumsalda firmanın vergi no'su (yasal satıcı firmadır);
 * bireyselde üyenin beyan ettiği TCKN (`User.nationalId`) önce, boşsa eski
 * zincir (vergi no → banka vergi no → banka TCKN). 2–5 ve bireysel TCKN eski
 * kaynaklara YALNIZ yeni alan boşken düşer. Yasal ad yalnız ad VE soyad
 * birlikte doluysa kullanılır (yarım ad tam bir banka sahibi adını ezmez).
 * Arşivde TCKN yalnız `sourceDetail` onu üyenin beyanı olarak işaretlediyse
 * öne geçer; eski arşiv satırlarında sıra değişmez (vergi no → TCKN).
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
  legalFirstName: string | null;
  legalLastName: string | null;
  nationalId: string | null;
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
    legalFirstName: string | null;
    legalLastName: string | null;
    companyName: string | null;
    taxId: string | null;
    nationalId: string | null;
    bankAccountHolder: string | null;
    businessStatus: BusinessStatus | null;
    /** Alan → kaynak; `nationalId: "user"` = numara üyenin beyanı. */
    sourceDetail: Prisma.JsonValue | null;
  } | null;
}

/** `GibSellerSource`un tek okuma kaynağı — rapor yalnız bunları çeker. */
export const GIB_SELLER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  legalFirstName: true,
  legalLastName: true,
  nationalId: true,
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
      legalFirstName: true,
      legalLastName: true,
      companyName: true,
      taxId: true,
      nationalId: true,
      bankAccountHolder: true,
      businessStatus: true,
      sourceDetail: true,
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

type IdentityCandidate = [
  value: string | null | undefined,
  kind: GibIdentityKind,
];

/** İlk dolu numara kazanır; türüyle birlikte. */
function pickIdentityNumber(
  candidates: IdentityCandidate[],
): Pick<GibSellerIdentity, "identityNumber" | "identityKind"> {
  for (const [candidate, kind] of candidates) {
    const value = clean(candidate);
    if (value) return { identityNumber: value, identityKind: kind };
  }
  return { identityNumber: null, identityKind: null };
}

/**
 * Kurumsalda firma vergi no'su önce (yasal satıcı firmadır); bireyselde
 * üyenin beyan ettiği TCKN önce, ardından eski sıra (vergi no → TCKN).
 */
function identityCandidates(
  corporate: boolean,
  declaredTckn: string | null | undefined,
  taxNumbers: (string | null | undefined)[],
  legacyTckn: string | null | undefined,
): IdentityCandidate[] {
  const taxes = taxNumbers.map((value): IdentityCandidate => [
    value,
    "tax_number",
  ]);
  return corporate
    ? [...taxes, [declaredTckn, "tckn"], [legacyTckn, "tckn"]]
    : [[declaredTckn, "tckn"], ...taxes, [legacyTckn, "tckn"]];
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
          [
            legalFullName(archive.legalFirstName, archive.legalLastName),
            "archive_legal_name",
          ],
          [archive.bankAccountHolder, "archive_bank_account_holder"],
          [archive.displayName, "archive_display_name"],
        ])
      : { name: null, source: "none" as const };
    return {
      sellerKind: corporate ? "corporate" : "individual",
      sellerDeleted: true,
      membershipDate: seller.createdAt,
      // Arşivin TCKN'si yalnız üyenin beyanıysa (`sourceDetail`) vergi
      // no'nun önüne geçer; eski kaynaktan gelen numara eski sırada kalır.
      ...pickIdentityNumber(
        archivedNationalIdIsDeclared(archive?.sourceDetail)
          ? identityCandidates(
              corporate,
              archive?.nationalId,
              [archive?.taxId],
              null,
            )
          : identityCandidates(
              corporate,
              null,
              [archive?.taxId],
              archive?.nationalId,
            ),
      ),
      legalName: name,
      legalNameSource: source,
      storeName: null,
      profileHandle: null,
    };
  }

  const corporate = hasApprovedCorporateIdentity(seller);
  const { name, source } = firstFilled([
    [corporate ? seller.companyName : null, "company"],
    [legalFullName(seller.legalFirstName, seller.legalLastName), "legal_name"],
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
      identityCandidates(
        corporate,
        seller.nationalId,
        [seller.taxId, seller.bankAccount?.taxId],
        seller.bankAccount?.tcKimlikNo,
      ),
    ),
    legalName: name,
    legalNameSource: source,
    storeName: publicName(seller),
    profileHandle: publicUsername(seller) ?? seller.id,
  };
}
