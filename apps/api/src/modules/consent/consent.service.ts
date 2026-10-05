import { BadRequestException, Injectable } from "@nestjs/common";
import { ConsentAction, ConsentSource, Prisma } from "@prisma/client";
import {
  ACCOUNT_REQUIRED_CONSENTS,
  CONSENT_DOCUMENT_KEYS,
  CONSENT_DOCUMENTS,
  OPTIONAL_COOKIE_CATEGORIES,
  isConsentDocumentKey,
  type ConsentDocumentKey,
  type ConsentDocumentStatus,
  type OptionalCookieCategory,
  type PendingConsent,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { getRequestClientInfo } from "../../common/context/request-context";
import {
  computePendingConsents,
  latestByDocument,
} from "./helpers/pending-consents";

/** Onayın kime ait olduğu — üç kimlikten en az biri dolu olmalı. */
export interface ConsentSubject {
  userId?: string | null;
  visitorId?: string | null;
  guestEmail?: string | null;
}

export interface ConsentEntry {
  document: ConsentDocumentKey;
  source: ConsentSource;
  subject: ConsentSubject;
  /** Varsayılan `granted`. */
  action?: ConsentAction;
  details?: Prisma.InputJsonValue;
  checkoutGroupId?: string | null;
  orderId?: string | null;
}

/** Yazım için gereken en dar istemci: PrismaService ya da bir transaction. */
export type ConsentWriter = Pick<Prisma.TransactionClient, "consentRecord">;

export type CookiePreferenceInput = Record<OptionalCookieCategory, boolean>;

/**
 * Hukuki onay kayıtlarının TEK yazım ve okuma noktası.
 *
 * Sürüm ve kanıt (IP, kullanıcı ajanı) burada damgalanır: çağıran yalnız
 * "kim, hangi belge, nereden" der. Sürüm `@tarodan/types` CONSENT_DOCUMENTS'ten,
 * kanıt istek bağlamından gelir — istemci ikisini de söyleyemez. Tablo
 * ekleme-yalnızdır; bu serviste güncelleme ya da silme metodu bilinçli olarak
 * YOKTUR (DB tetikleyicisi de zorlar).
 */
@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    entries: readonly ConsentEntry[],
    db: ConsentWriter = this.prisma,
  ): Promise<number> {
    if (entries.length === 0) return 0;
    const { ipAddress, userAgent } = getRequestClientInfo();
    const { count } = await db.consentRecord.createMany({
      data: entries.map((entry) => toRow(entry, ipAddress, userAgent)),
    });
    return count;
  }

  /**
   * Hesap için zorunlu belgelerin onayı (kayıt formu). İstemcinin gönderdiği
   * listeden yalnız zorunlu belgeler alınır; eksik kalan belge kayıt dışı
   * kalır ve yeniden-onay kapısı onu ilk girişte ister — onay göndermeyen eski
   * mobil sürümle açılan hesap da böylece kapsanır.
   */
  async recordAccountConsents(
    userId: string,
    documents: readonly string[] | undefined,
    source: ConsentSource,
    db: ConsentWriter = this.prisma,
  ): Promise<number> {
    const accepted = ACCOUNT_REQUIRED_CONSENTS.filter((doc) =>
      documents?.includes(doc),
    );
    return this.record(
      accepted.map((document) => ({ document, source, subject: { userId } })),
      db,
    );
  }

  /** Yeniden-onay kapısı: üyenin onaylaması gereken belgeler. Boş = kapı açık. */
  async getPending(userId: string): Promise<PendingConsent[]> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { userId, document: { in: [...ACCOUNT_REQUIRED_CONSENTS] } },
      select: { document: true, version: true, action: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return computePendingConsents(rows);
  }

  /**
   * Kapıdan gelen onay. Yalnız BEKLEYEN belgeler yazılır: çift gönderim ya da
   * zaten güncel bir belgenin tekrar onayı ikinci satır üretmez. Kalan
   * bekleyenler döner (istemci boş liste görünce kapıyı kapatır).
   */
  async acceptPending(
    userId: string,
    documents: readonly string[],
  ): Promise<PendingConsent[]> {
    const invalid = documents.find(
      (doc) =>
        !isConsentDocumentKey(doc) || !ACCOUNT_REQUIRED_CONSENTS.includes(doc),
    );
    if (invalid !== undefined) {
      throw new BadRequestException(
        i18nMessage("server.consent.documentNotAcceptable", {
          document: invalid,
        }),
      );
    }

    const pending = await this.getPending(userId);
    const accepted = pending.filter((p) => documents.includes(p.document));
    await this.record(
      accepted.map((p) => ({
        document: p.document,
        source: ConsentSource.consent_prompt,
        subject: { userId },
      })),
    );
    return pending.filter((p) => !documents.includes(p.document));
  }

  /**
   * Çerez bandı / tercih paneli kaydı. İsteğe bağlı kategorilerden biri bile
   * açıksa onay `granted`, hepsi kapalıysa `withdrawn` (yalnız zorunlu
   * çerezler). Kategoriler `details`'e yazılır.
   */
  async recordCookiePreferences(input: {
    visitorId: string;
    userId?: string | null;
    preferences: CookiePreferenceInput;
  }): Promise<void> {
    const details = Object.fromEntries(
      OPTIONAL_COOKIE_CATEGORIES.map((category) => [
        category,
        input.preferences[category] === true,
      ]),
    ) as CookiePreferenceInput;
    const anyOptional = OPTIONAL_COOKIE_CATEGORIES.some((c) => details[c]);
    await this.record([
      {
        document: "cookies",
        source: ConsentSource.cookie_banner,
        action: anyOptional ? ConsentAction.granted : ConsentAction.withdrawn,
        subject: { visitorId: input.visitorId, userId: input.userId ?? null },
        details,
      },
    ]);
  }

  /**
   * Pazarlama izni değişimi. Çağıran, bayrağın GERÇEKTEN değiştiğini bilir
   * (önceki değeri okur); aynı değeri yeniden yazan istek satır üretmemeli.
   */
  async recordMarketingChange(
    input: { userId: string; granted: boolean; source: ConsentSource },
    db: ConsentWriter = this.prisma,
  ): Promise<void> {
    await this.record(
      [
        {
          document: "marketing",
          source: input.source,
          action: input.granted
            ? ConsentAction.granted
            : ConsentAction.withdrawn,
          subject: { userId: input.userId },
        },
      ],
      db,
    );
  }

  /** Admin kullanıcı detayı: belge başına en son kayıt + güncel mi. */
  async getStatus(userId: string): Promise<ConsentDocumentStatus[]> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { userId },
      select: {
        document: true,
        version: true,
        action: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const latest = latestByDocument(rows);
    const pending = new Set(
      computePendingConsents(rows).map((p) => p.document),
    );

    return CONSENT_DOCUMENT_KEYS.map((document) => {
      const definition = CONSENT_DOCUMENTS[document];
      const row = latest.get(document);
      return {
        document,
        currentVersion: definition.version,
        requiredForAccount: definition.requiredForAccount,
        pending: pending.has(document),
        latest: row
          ? {
              version: row.version,
              action: row.action,
              source: row.source,
              createdAt: row.createdAt.toISOString(),
            }
          : null,
      };
    });
  }
}

function toRow(
  entry: ConsentEntry,
  ipAddress: string | null,
  userAgent: string | null,
): Prisma.ConsentRecordCreateManyInput {
  if (!isConsentDocumentKey(entry.document)) {
    throw new Error(`Unknown consent document: ${String(entry.document)}`);
  }
  const { userId, visitorId, guestEmail } = entry.subject;
  if (!userId && !visitorId && !guestEmail) {
    throw new Error(`Consent record without a subject: ${entry.document}`);
  }
  return {
    document: entry.document,
    version: CONSENT_DOCUMENTS[entry.document].version,
    action: entry.action ?? ConsentAction.granted,
    source: entry.source,
    userId: userId ?? null,
    visitorId: visitorId ?? null,
    guestEmail: guestEmail ? guestEmail.trim().toLowerCase() : null,
    details: entry.details ?? undefined,
    checkoutGroupId: entry.checkoutGroupId ?? null,
    orderId: entry.orderId ?? null,
    ipAddress,
    userAgent,
  };
}
