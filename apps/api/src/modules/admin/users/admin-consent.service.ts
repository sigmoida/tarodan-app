import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Locale } from "@tarodan/i18n";
import {
  CONSENT_ACTION_I18N_KEYS,
  CONSENT_DOCUMENTS,
  CONSENT_DOCUMENT_I18N_KEYS,
  CONSENT_SOURCE_I18N_KEYS,
  CONSENT_SUBJECT_TYPE_I18N_KEYS,
  EXPORT_CATALOGS,
  consentSubjectType,
  isConsentDocumentKey,
  type AdminConsentRecordRow,
  type ConsentDocumentStatus,
  type ConsentSubjectType,
  type ExportCatalogKey,
} from "@tarodan/types";

import { PrismaService } from "../../../prisma";
import {
  buildSearchWhere,
  dateRangeWhere,
  paginate,
  resolveOrderBy,
} from "../../../common/list";
import {
  ExportListService,
  type ExportFile,
  type ExportRecord,
  type Translate,
} from "../../../common/export";
import { ConsentService } from "../../consent/consent.service";
import { tradeOfConsentDetails } from "../../consent/helpers/distance-sales-trade";
import type { ConsentRecordQueryDto } from "../dto/consent-record.dto";

/** Aramanın yayıldığı kolonlar — listede görünen her kimlik alanı. */
const SEARCH_FIELDS = [
  "guestEmail",
  "visitorId",
  "ipAddress",
  "user.email",
  "user.displayName",
  "user.username",
  "user.adminCode",
  "checkoutGroup.groupNumber",
  "order.orderNumber",
] as const;

const ROW_SELECT = {
  id: true,
  document: true,
  version: true,
  action: true,
  source: true,
  userId: true,
  guestEmail: true,
  visitorId: true,
  details: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  user: {
    select: { id: true, displayName: true, email: true, adminCode: true },
  },
  checkoutGroup: { select: { id: true, groupNumber: true } },
  order: { select: { id: true, orderNumber: true } },
} satisfies Prisma.ConsentRecordSelect;

type ConsentRecordWithRelations = Prisma.ConsentRecordGetPayload<{
  select: typeof ROW_SELECT;
}>;

const SUBJECT_WHERE: Record<
  ConsentSubjectType,
  Prisma.ConsentRecordWhereInput
> = {
  user: { userId: { not: null } },
  guest: { userId: null, guestEmail: { not: null } },
  visitor: { userId: null, guestEmail: null },
};

/**
 * Onay Kayıtları — admin okuma modeli (liste, döküm, üye durumu).
 *
 * Yazım YOKTUR: kayıtlar yalnız ConsentService'ten (kayıt, checkout, ödeme,
 * çerez bandı, pazarlama izni) yazılır ve DB tetikleyicisiyle değişmez.
 */
@Injectable()
export class AdminConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentService,
    private readonly exports: ExportListService,
  ) {}

  async list(query: ConsentRecordQueryDto) {
    const result = await paginate(
      this.prisma.consentRecord,
      {
        where: buildConsentWhere(query),
        orderBy: this.orderBy(query),
        select: ROW_SELECT,
      },
      query,
    );
    return { ...result, data: result.data.map(toAdminRow) };
  }

  /**
   * Geçerli filtrenin Excel dökümü — listeyle AYNI filtre ve sıra (`id` yalnız
   * sayfa sınırında eşit anları sabitler). Tavan, kırpılma, Özet ve zorunlu
   * denetim ortak hatta (`ExportListService`); arama terimi denetime yazılmaz.
   */
  async export(
    query: ConsentRecordQueryDto,
    actorId: string,
    locale: Locale,
  ): Promise<ExportFile> {
    const where = buildConsentWhere(query);
    const orderBy: Prisma.ConsentRecordOrderByWithRelationInput[] = [
      this.orderBy(query),
      { id: "asc" },
    ];
    return this.exports.exportList({
      catalog: EXPORT_CATALOGS.consents,
      locale,
      slug: "onay-kayitlari",
      titleKey: "admin.consents.title",
      sheetNameKey: "admin.consents.export.sheetName",
      filters: [
        {
          labelKey: "admin.consents.filters.document",
          value: query.document,
          valueKey:
            query.document && isConsentDocumentKey(query.document)
              ? CONSENT_DOCUMENT_I18N_KEYS[query.document]
              : undefined,
        },
        {
          labelKey: "admin.consents.filters.action",
          value: query.action,
          valueKey: query.action && CONSENT_ACTION_I18N_KEYS[query.action],
        },
        {
          labelKey: "admin.consents.filters.source",
          value: query.source,
          valueKey: query.source && CONSENT_SOURCE_I18N_KEYS[query.source],
        },
        {
          labelKey: "admin.consents.filters.subjectType",
          value: query.subjectType,
          valueKey:
            query.subjectType &&
            CONSENT_SUBJECT_TYPE_I18N_KEYS[query.subjectType],
        },
        { labelKey: "common.user", value: query.userId },
        { labelKey: "admin.finance.common.startDate", value: query.startDate },
        { labelKey: "admin.finance.common.endDate", value: query.endDate },
      ],
      sort: query,
      fetchPage: async ({ skip, take }) =>
        (
          await this.prisma.consentRecord.findMany({
            where,
            orderBy,
            select: ROW_SELECT,
            skip,
            take,
          })
        ).map(toAdminRow),
      map: consentExportRecord,
      audit: {
        actorId,
        action: "consent_records_export",
        entityType: "ConsentRecord",
        query,
      },
    });
  }

  /** Kullanıcı detayı: belge başına en son kayıt + yeniden-onay bekliyor mu. */
  async status(
    userId: string,
  ): Promise<{ documents: ConsentDocumentStatus[] }> {
    return { documents: await this.consents.getStatus(userId) };
  }

  private orderBy(query: ConsentRecordQueryDto) {
    return resolveOrderBy<Prisma.ConsentRecordOrderByWithRelationInput>(
      "ConsentRecord",
      query,
      { defaultSort: { createdAt: "desc" } },
    );
  }
}

export function buildConsentWhere(
  query: ConsentRecordQueryDto,
): Prisma.ConsentRecordWhereInput {
  const and: Prisma.ConsentRecordWhereInput[] = [];
  const search = buildSearchWhere(query.search, SEARCH_FIELDS);
  if (search) and.push(search as Prisma.ConsentRecordWhereInput);
  if (query.subjectType) and.push(SUBJECT_WHERE[query.subjectType]);

  return {
    ...dateRangeWhere(query),
    ...(query.document ? { document: query.document } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

function toAdminRow(row: ConsentRecordWithRelations): AdminConsentRecordRow {
  // Belge anahtarı yazımda doğrulanır; okunan değer katalog dışıysa (elle
  // SQL) yine gösterilir ama "güncel sürüm" sayılmaz.
  const currentVersion = isConsentDocumentKey(row.document)
    ? CONSENT_DOCUMENTS[row.document].version
    : null;
  return {
    id: row.id,
    document: row.document as AdminConsentRecordRow["document"],
    version: row.version,
    isCurrentVersion: currentVersion === row.version,
    action: row.action,
    source: row.source,
    subjectType: consentSubjectType(row),
    user: row.user,
    guestEmail: row.guestEmail,
    visitorId: row.visitorId,
    details:
      row.details &&
      typeof row.details === "object" &&
      !Array.isArray(row.details)
        ? (row.details as Record<string, unknown>)
        : null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    checkoutGroup: row.checkoutGroup,
    order: row.order,
    trade:
      row.document === "distance_sales"
        ? tradeOfConsentDetails(row.details)
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Çerez kategorileri hücresi: açık olanların adları, virgülle. */
function cookieCategoriesText(details: Record<string, unknown> | null): string {
  if (!details) return "";
  return Object.entries(details)
    .filter(([, on]) => on === true)
    .map(([category]) => category)
    .join(", ");
}

/** Döküm satırı — kolonlar `EXPORT_CATALOGS.consents`, etiketler katalogdan. */
export function consentExportRecord(
  r: AdminConsentRecordRow,
  t: Translate,
): ExportRecord<ExportCatalogKey<typeof EXPORT_CATALOGS.consents>> {
  return {
    createdAt: r.createdAt,
    document: isConsentDocumentKey(r.document)
      ? t(CONSENT_DOCUMENT_I18N_KEYS[r.document])
      : r.document,
    version: r.version,
    isCurrentVersion: r.isCurrentVersion,
    action: t(CONSENT_ACTION_I18N_KEYS[r.action]),
    source: t(CONSENT_SOURCE_I18N_KEYS[r.source]),
    subjectType: t(CONSENT_SUBJECT_TYPE_I18N_KEYS[r.subjectType]),
    userCode: r.user?.adminCode,
    userName: r.user?.displayName,
    userEmail: r.user?.email,
    guestEmail: r.guestEmail,
    visitorId: r.visitorId,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    cookieCategories: cookieCategoriesText(r.details),
    checkoutGroup: r.checkoutGroup?.groupNumber,
    order: r.order?.orderNumber,
  };
}
