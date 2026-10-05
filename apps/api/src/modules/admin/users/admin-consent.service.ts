import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Locale } from "@tarodan/i18n";
import {
  CONSENT_ACTION_I18N_KEYS,
  CONSENT_DOCUMENTS,
  CONSENT_DOCUMENT_I18N_KEYS,
  CONSENT_SOURCE_I18N_KEYS,
  CONSENT_SUBJECT_TYPE_I18N_KEYS,
  consentSubjectType,
  isConsentDocumentKey,
  type AdminConsentRecordRow,
  type ConsentDocumentStatus,
  type ConsentSubjectType,
} from "@tarodan/types";

import { PrismaService } from "../../../prisma";
import {
  buildSearchWhere,
  dateRangeWhere,
  paginate,
  resolveOrderBy,
} from "../../../common/list";
import {
  renderSheet,
  toXlsx,
  type ExportColumn,
} from "../../../common/helpers/tabular-export";
import { translateMessage } from "../../i18n/translate";
import { ConsentService } from "../../consent/consent.service";
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

/** Tek istekte üretilecek döküm tavanı; aşılırsa başlıkla bildirilir. */
export const CONSENT_EXPORT_ROW_CAP = 5000;

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
   * Geçerli filtrenin Excel dökümü — listeyle AYNI filtre ve sıra. Tavan + 1
   * okunur: dosyanın sessizce kırpılması, ispat dökümünde fark edilmeden
   * eksik kayıt demektir; aşım `truncated` ile bildirilir.
   */
  async exportXlsx(
    query: ConsentRecordQueryDto,
    locale: Locale,
  ): Promise<{
    filename: string;
    body: Buffer;
    rowCount: number;
    truncated: boolean;
  }> {
    const found = await this.prisma.consentRecord.findMany({
      where: buildConsentWhere(query),
      orderBy: this.orderBy(query),
      select: ROW_SELECT,
      take: CONSENT_EXPORT_ROW_CAP + 1,
    });
    const truncated = found.length > CONSENT_EXPORT_ROW_CAP;
    const rows = (
      truncated ? found.slice(0, CONSENT_EXPORT_ROW_CAP) : found
    ).map(toAdminRow);
    const t = (key: string) => translateMessage(key, locale);
    const day = new Date().toISOString().slice(0, 10);
    return {
      filename: `onay-kayitlari-${day}.xlsx`,
      body: await toXlsx([
        renderSheet(
          t("admin.consents.export.sheetName"),
          exportColumns(t),
          rows,
        ),
      ]),
      rowCount: rows.length,
      truncated,
    };
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

const HEADER = "admin.consents.export";

/** Döküm kolonları — başlık ve etiketler panelin katalog anahtarlarından. */
export function exportColumns(
  t: (key: string) => string,
): ExportColumn<AdminConsentRecordRow>[] {
  return [
    { header: t(`${HEADER}.createdAt`), value: (r) => r.createdAt },
    {
      header: t(`${HEADER}.document`),
      value: (r) =>
        isConsentDocumentKey(r.document)
          ? t(CONSENT_DOCUMENT_I18N_KEYS[r.document])
          : r.document,
    },
    { header: t(`${HEADER}.version`), value: (r) => r.version },
    {
      header: t(`${HEADER}.currentVersion`),
      value: (r) => t(r.isCurrentVersion ? "common.yes" : "common.no"),
    },
    {
      header: t(`${HEADER}.action`),
      value: (r) => t(CONSENT_ACTION_I18N_KEYS[r.action]),
    },
    {
      header: t(`${HEADER}.source`),
      value: (r) => t(CONSENT_SOURCE_I18N_KEYS[r.source]),
    },
    {
      header: t(`${HEADER}.subjectType`),
      value: (r) => t(CONSENT_SUBJECT_TYPE_I18N_KEYS[r.subjectType]),
    },
    { header: t(`${HEADER}.userCode`), value: (r) => r.user?.adminCode },
    { header: t(`${HEADER}.userName`), value: (r) => r.user?.displayName },
    { header: t(`${HEADER}.userEmail`), value: (r) => r.user?.email },
    { header: t(`${HEADER}.guestEmail`), value: (r) => r.guestEmail },
    { header: t(`${HEADER}.visitorId`), value: (r) => r.visitorId },
    { header: t(`${HEADER}.ipAddress`), value: (r) => r.ipAddress },
    { header: t(`${HEADER}.userAgent`), value: (r) => r.userAgent },
    {
      header: t(`${HEADER}.cookieCategories`),
      value: (r) => cookieCategoriesText(r.details),
    },
    {
      header: t(`${HEADER}.checkoutGroup`),
      value: (r) => r.checkoutGroup?.groupNumber,
    },
    { header: t(`${HEADER}.order`), value: (r) => r.order?.orderNumber },
  ];
}
