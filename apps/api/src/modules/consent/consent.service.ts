import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConsentAction, ConsentSource, Prisma } from "@prisma/client";
import {
  ACCOUNT_REQUIRED_CONSENTS,
  BASE_CONSENT_VERSION_CONTEXT,
  CONSENT_DOCUMENT_KEYS,
  CONSENT_DOCUMENTS,
  OPTIONAL_COOKIE_CATEGORIES,
  consentVersionFollowsInstallments,
  currentConsentVersion,
  isConsentDocumentKey,
  type ConsentDocumentStatus,
  type ConsentVersionContext,
  type OptionalCookieCategory,
  type PendingConsent,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { InstallmentSettingsService } from "../payment/installments/installment-settings.service";
import { SentryService } from "../sentry/sentry.service";
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

/**
 * The narrowest client a write needs: PrismaService or a transaction. It also
 * reads `platformSetting`: the version of some documents follows the
 * installment switch, read in the same transaction as the write.
 */
export type ConsentWriter = Pick<
  Prisma.TransactionClient,
  "consentRecord" | "platformSetting"
>;

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
 * The ONE place that writes and reads legal consent records.
 *
 * The version and the evidence (IP, user agent) are stamped here: the caller
 * only says who, which document and from where. The version is the one in
 * force (`currentConsentVersion` of `@tarodan/types`: the distance sales text
 * carries its installment clause only while installments are on), the
 * evidence comes from the request context; the client can say neither. The
 * table is append-only; this service deliberately has NO update or delete
 * method (a DB trigger enforces it too).
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly installmentSettings: InstallmentSettingsService,
    @Optional() private readonly sentry?: SentryService,
  ) {}

  async record(
    entries: readonly ConsentEntry[],
    db: ConsentWriter = this.prisma,
  ): Promise<number> {
    if (entries.length === 0) return 0;
    // An unknown key is refused by `toConsentRow` with its own message.
    const versionContext = entries.some(
      (entry) =>
        isConsentDocumentKey(entry.document) &&
        consentVersionFollowsInstallments(entry.document),
    )
      ? await this.versionContext(db)
      : BASE_CONSENT_VERSION_CONTEXT;
    const { ipAddress, userAgent } = getRequestClientInfo();
    const { count } = await db.consentRecord.createMany({
      data: entries.map((entry) =>
        toConsentRow(entry, ipAddress, userAgent, versionContext),
      ),
    });
    return count;
  }

  /**
   * What the versions in force depend on: the installment switch, read at
   * once (no cache, like the options and signing calls), so a record follows
   * the switch the moment the admin flips it. A write reads it through its
   * own client: in the checkout transaction no second connection is taken
   * (and a failed read there fails the checkout instead of recording a
   * version). A failed read outside a transaction is the base text
   * (installments off), the fail-closed reading of the payment side, and is
   * reported to Sentry: the recorded version may then not be the text shown.
   */
  async versionContext(
    db: Pick<ConsentWriter, "platformSetting"> = this.prisma,
  ): Promise<ConsentVersionContext> {
    try {
      const { enabled } = await this.installmentSettings.read(db);
      return { installmentsEnabled: enabled };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        `Installment switch unreadable, consent versions read as installments off: ${failure.message}`,
      );
      this.sentry?.captureException(failure, {
        flow: "consent.version_context",
        fallback: "installments_off",
      });
      return BASE_CONSENT_VERSION_CONTEXT;
    }
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
    const [rows, versionContext] = await Promise.all([
      this.prisma.$queryRaw<ConsentStatusRow[]>`
        SELECT DISTINCT ON (document)
          document, version, action, source, created_at AS "createdAt"
        FROM consent_records
        WHERE user_id = ${userId}
        ORDER BY document, created_at DESC`,
      this.versionContext(),
    ]);
    const latest = latestByDocument(rows);
    const pending = new Set(
      computePendingConsents(rows).map((p) => p.document),
    );

    return CONSENT_DOCUMENT_KEYS.map((document) => {
      const definition = CONSENT_DOCUMENTS[document];
      const row = latest.get(document);
      return {
        document,
        currentVersion: currentConsentVersion(document, versionContext),
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
