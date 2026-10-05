import { BusinessStatus, Prisma } from "@prisma/client";
import { dateRangeWhere, buildSearchWhere } from "../../../../common/list";
import { LIVE_USER } from "../../../account-lane/live-lane.where";
import type { GibReportQueryDto } from "../../dto/gib-report.dto";

/**
 * GİB raporunun filtreleri — liste ve Excel dökümü AYNI `where`i kullanır.
 *
 * Satıcı kimliği iki yerde yaşar: canlı `users` satırı ve (silinmiş hesapta)
 * `DeletedUserIdentity` arşivi. `users` ile arşivin ortak alanları
 * (`businessStatus`, `companyName`, `taxId`) aynı adı taşıdığı için "kurumsal"
 * ve "bireysel" yüklemleri bir kez yazılır, iki tarafa da uygulanır.
 *
 * Yüklemler bilinçli olarak `NOT` KULLANMAZ: SQL'de `NOT (kolon = x)` kolon
 * NULL iken NULL döner ve satırı sessizce eler; "bireysel"i "kurumsalın
 * tersi" diye yazmak `businessStatus`u boş her bireysel satıcıyı düşürürdü.
 * Çözümleyici (`gib-seller-identity.ts`) ile AYNI kural: kurumsal =
 * `hasApprovedCorporateIdentity` (onaylı + firma adı + vergi no).
 */

type SharedIdentityWhere = Prisma.UserWhereInput &
  Prisma.DeletedUserIdentityWhereInput;

/** Dolu (null ve boş değil) metin kolonu. */
const present = (field: string): Record<string, unknown> => ({
  AND: [{ [field]: { not: null } }, { [field]: { not: "" } }],
});

/** Boş (null ya da boş metin) kolon. */
const absent = (field: string): Record<string, unknown> => ({
  OR: [{ [field]: null }, { [field]: "" }],
});

const CORPORATE: SharedIdentityWhere = {
  businessStatus: BusinessStatus.approved,
  AND: [present("companyName"), present("taxId")],
} as SharedIdentityWhere;

const INDIVIDUAL: SharedIdentityWhere = {
  OR: [
    { businessStatus: null },
    { businessStatus: { not: BusinessStatus.approved } },
    absent("companyName"),
    absent("taxId"),
  ],
} as SharedIdentityWhere;

/**
 * Satıcı yüklemi: canlı hesapta `users` alanlarına, silinmiş hesapta arşive
 * uygulanır. Arşivi olmayan silinmiş satıcı bireysel sayılır (kurumsal kimlik
 * kanıtlanamaz).
 */
function sellerWhere(
  shared: SharedIdentityWhere,
  { archiveMissingMatches }: { archiveMissingMatches: boolean },
): Prisma.UserWhereInput {
  const archive: Prisma.UserWhereInput[] = [
    { deletedIdentity: { is: shared } },
  ];
  if (archiveMissingMatches) archive.push({ deletedIdentity: { is: null } });
  return {
    OR: [
      { deletedAt: null, ...shared },
      { deletedAt: { not: null }, OR: archive },
    ],
  };
}

/** Kimlik numarası YOK: vergi no ve TCKN'nin hiçbiri hiçbir kaynakta dolu değil. */
const IDENTITY_INCOMPLETE: Prisma.UserWhereInput = {
  OR: [
    {
      deletedAt: null,
      AND: [
        absent("taxId"),
        {
          OR: [
            { bankAccount: { is: null } },
            {
              bankAccount: {
                is: { AND: [absent("taxId"), absent("tcKimlikNo")] },
              },
            },
          ],
        },
      ],
    } as Prisma.UserWhereInput,
    {
      deletedAt: { not: null },
      OR: [
        { deletedIdentity: { is: null } },
        {
          deletedIdentity: {
            is: {
              AND: [absent("taxId"), absent("nationalId")],
            } as Prisma.DeletedUserIdentityWhereInput,
          },
        },
      ],
    },
  ],
};

/** Aranan alanlar: ilan başlığı/kodu ve satıcının görünen kimlikleri. */
const SEARCH_FIELDS = [
  "title",
  "productCode",
  "seller.displayName",
  "seller.username",
  "seller.companyName",
  "seller.taxId",
  "seller.adminCode",
  "seller.bankAccount.accountHolder",
  "seller.deletedIdentity.displayName",
  "seller.deletedIdentity.companyName",
] as const;

export function buildGibReportWhere(
  query: GibReportQueryDto,
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  const search = buildSearchWhere(query.search, SEARCH_FIELDS);
  if (search) and.push(search as Prisma.ProductWhereInput);

  if (query.sellerKind === "corporate") {
    and.push({
      seller: sellerWhere(CORPORATE, { archiveMissingMatches: false }),
    });
  } else if (query.sellerKind === "individual") {
    and.push({
      seller: sellerWhere(INDIVIDUAL, { archiveMissingMatches: true }),
    });
  }
  if (query.identityIncomplete) and.push({ seller: IDENTITY_INCOMPLETE });

  return {
    // Yalnız GERÇEK ilanlar: üyelik / öne çıkarma sanal ürünleri rapora girmez.
    kind: "listing",
    // Test hesapları (Apple review vb.) devlete raporlanacak veri değildir.
    seller: LIVE_USER,
    ...(query.status ? { status: query.status } : {}),
    // Yayın tarihi aralığı `publishedAt` üzerindendir (createdAt değil).
    ...dateRangeWhere(query, "publishedAt"),
    ...(and.length ? { AND: and } : {}),
  };
}
