import { BadRequestException, Injectable } from "@nestjs/common";
import { ConsentAction, ConsentSource, Prisma } from "@prisma/client";
import {
  ACCOUNT_REQUIRED_CONSENTS,
  CONSENT_DOCUMENT_KEYS,
  CONSENT_DOCUMENTS,
  OPTIONAL_COOKIE_CATEGORIES,
  isConsentDocumentKey,
  type ConsentDocumentStatus,
  type OptionalCookieCategory,
  type PendingConsent,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { getRequestClientInfo } from "../../common/context/request-context";
import {
  findGrantedAccountConsents,
  findPendingAccountConsents,
} from "./helpers/account-consents";
import { toConsentRow, type ConsentEntry } from "./helpers/consent-row";
import {
  computePendingConsents,
  latestByDocument,
} from "./helpers/pending-consents";

// Tipler helpers/consent-row.ts'te yaşar (seed'ler de aynı satırı üretir);
// buradan yeniden dışa açılır ki mevcut import'lar değişmesin.
export type { ConsentEntry, ConsentSubject } from "./helpers/consent-row";

/** Yazım için gereken en dar istemci: PrismaService ya da bir transaction. */
export type ConsentWriter = Pick<Prisma.TransactionClient, "consentRecord">;

export type CookiePreferenceInput = Record<OptionalCookieCategory, boolean>;

/** The latest row of one document, as `getStatus` reads it. */
interface ConsentStatusRow {
  document: string;
  version: string;
  action: ConsentAction;
  source: ConsentSource;
  createdAt: Date;
}

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
      data: entries.map((entry) => toConsentRow(entry, ipAddress, userAgent)),
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

  /**
   * Withdraws every required account consent that is currently granted, as
   * new `withdrawn` rows (the table is append-only; the earlier grants stay as
   * the record of what was accepted and by whom). The re-consent gate then
   * asks the member again. Used when the person who gave the consents is not
   * the account's owner (social take-over of an unverified registration).
   *
   * @returns the number of rows written.
   */
  async withdrawAccountConsents(
    userId: string,
    source: ConsentSource,
    db: ConsentWriter = this.prisma,
  ): Promise<number> {
    const granted = await findGrantedAccountConsents(db, userId);
    return this.record(
      granted.map((document) => ({
        document,
        source,
        action: ConsentAction.withdrawn,
        subject: { userId },
      })),
      db,
    );
  }

  /** Yeniden-onay kapısı: üyenin onaylaması gereken belgeler. Boş = kapı açık. */
  async getPending(userId: string): Promise<PendingConsent[]> {
    return findPendingAccountConsents(this.prisma, userId);
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

  /**
   * Admin user detail: the latest record per document and whether it is
   * current. One query reads the latest row of each document
   * (`DISTINCT ON`, on the `user_id, document, created_at` index): per-order
   * documents (distance sales, platform services) add rows with every
   * purchase, so a "newest N rows" window could push an older account
   * consent out and show it as missing.
   */
  async getStatus(userId: string): Promise<ConsentDocumentStatus[]> {
    const rows = await this.prisma.$queryRaw<ConsentStatusRow[]>`
      SELECT DISTINCT ON (document)
        document, version, action, source, created_at AS "createdAt"
      FROM consent_records
      WHERE user_id = ${userId}
      ORDER BY document, created_at DESC`;
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
