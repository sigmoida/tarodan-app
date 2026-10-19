import { ConsentSource, Prisma } from "@prisma/client";
import {
  ACCOUNT_REQUIRED_CONSENTS,
  type ConsentDocumentKey,
  type PendingConsent,
} from "@tarodan/types";
import { toConsentRow } from "./consent-row";
import {
  computePendingConsents,
  latestByDocument,
  type ConsentHistoryRow,
} from "./pending-consents";

/** Okuma/yazma için gereken en dar istemci: PrismaClient, PrismaService ya da bir transaction. */
export type AccountConsentDb = Pick<Prisma.TransactionClient, "consentRecord">;

async function loadHistory(
  db: AccountConsentDb,
  userId: string,
): Promise<ConsentHistoryRow[]> {
  return db.consentRecord.findMany({
    where: { userId, document: { in: [...ACCOUNT_REQUIRED_CONSENTS] } },
    select: { document: true, version: true, action: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/**
 * Üyenin onaylaması gereken zorunlu belgeler — yeniden-onay kapısının sorgusu
 * (`ConsentService.getPending`) ve seed'lerin "zaten güncel mi" kontrolü AYNI
 * yolu kullanır: ikinci bir sürüm karşılaştırması yazılmaz.
 */
export async function findPendingAccountConsents(
  db: AccountConsentDb,
  userId: string,
): Promise<PendingConsent[]> {
  return computePendingConsents(await loadHistory(db, userId));
}

/**
 * Required documents whose latest row is a grant (any version): what a
 * withdrawal has to cover so the re-consent gate asks for every one of them.
 */
export async function findGrantedAccountConsents(
  db: AccountConsentDb,
  userId: string,
): Promise<ConsentDocumentKey[]> {
  const latest = latestByDocument(await loadHistory(db, userId));
  return ACCOUNT_REQUIRED_CONSENTS.filter(
    (document) => latest.get(document)?.action === "granted",
  );
}

export interface AccountConsentGrantOptions {
  /** Verilirse yalnız bu belgeler onaylanır (kalanı bekler kalır). */
  only?: readonly string[];
  /**
   * En son kaydı `withdrawn` olan belge ATLANIR: geri çekme bilinçli bir
   * karardır ve toplu bir düzeltme onu yeniden "granted" yapmamalı.
   */
  skipWithdrawn?: boolean;
}

export interface AccountConsentGrantPlan {
  /** Yazılacak belgeler (yürürlükteki sürümle). */
  grant: PendingConsent[];
  /** Geri çekilmiş olduğu için atlanan belgeler. */
  skippedWithdrawn: string[];
}

/** Yazmadan "ne yazılırdı" — dry-run ve gerçek yazım aynı kararı kullanır. */
export async function planAccountConsentGrant(
  db: AccountConsentDb,
  userId: string,
  options: AccountConsentGrantOptions = {},
): Promise<AccountConsentGrantPlan> {
  const history = await loadHistory(db, userId);
  const latest = latestByDocument(history);
  let grant = computePendingConsents(history);
  if (options.only) {
    const only = options.only;
    grant = grant.filter((p) => only.includes(p.document));
  }
  const skippedWithdrawn: string[] = [];
  if (options.skipWithdrawn) {
    grant = grant.filter((p) => {
      if (latest.get(p.document)?.action !== "withdrawn") return true;
      skippedWithdrawn.push(p.document);
      return false;
    });
  }
  return { grant, skippedWithdrawn };
}

/**
 * Hesabın bekleyen zorunlu belgelerini YÜRÜRLÜKTEKİ sürümle onaylı yazar.
 * Test/seed hesapları içindir (istek bağlamı yok → IP ve ajan HİÇ yazılmaz:
 * tablo ekleme-yalnız olduğundan sonradan düzeltilemez, bu yüzden bir yöneticinin
 * IP'si "kullanıcı kayıtta onayladı" kanıtı olarak kalıcılaşmamalı). Tekrar
 * koşulabilir: güncel olan belge için satır eklenmez; belge sürümü değişince
 * yalnız yeni sürümün kaydı eklenir (sürüm sabit yazılmaz, katalogdan gelir).
 *
 * @returns yazılan satır sayısı.
 */
export async function grantPendingAccountConsents(
  db: AccountConsentDb,
  userId: string,
  source: ConsentSource,
  options: AccountConsentGrantOptions = {},
): Promise<number> {
  const { grant } = await planAccountConsentGrant(db, userId, options);
  if (grant.length === 0) return 0;
  const { count } = await db.consentRecord.createMany({
    data: grant.map((p) =>
      toConsentRow(
        { document: p.document, source, subject: { userId } },
        null,
        null,
      ),
    ),
  });
  return count;
}
