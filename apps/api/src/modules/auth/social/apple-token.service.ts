import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OutboxStatus, type Prisma } from "@prisma/client";
import appleSignin from "apple-signin-auth";
import { PrismaService } from "../../../prisma";
import { OutboxService } from "../../outbox/outbox.service";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import {
  OUTBOX_APPLE_TOKEN_REVOKE,
  type AppleTokenRevokePayload,
} from "../../outbox/outbox.types";
import { errorMessage } from "../../../common/helpers/error-message";
import { PermanentOutboxError } from "../../outbox/outbox-errors";
import { ACCOUNT_DELETION_TX_TIMEOUT_MS } from "../../user/helpers/account-deletion.constants";
import { AppleTokenCipher } from "./apple-token-cipher";
import {
  appleErrorCode,
  idTokenClaims,
  postAppleEndpoint,
} from "./apple-id-endpoint";

/** Apple client secret'ını imzalayan anahtar (Apple Developer → Keys, .p8). */
interface AppleSigningKey {
  teamId: string;
  keyId: string;
  privateKey: string;
}

/** Teşhis kolonu sınırı — Apple/ağ hata metni token içermez, yine de kısa. */
const MAX_ERROR_LENGTH = 500;

/**
 * İptal işinin deneme sayısı. Varsayılan 8 (10 sn → 1 sa geri çekilme) ~20
 * dakikada DLQ'ya düşer; Apple kesintisi ya da eksik env'in düzeltilmesi
 * için ~1 günlük pencere bırakılır (9. denemeden sonra saatte bir).
 */
export const APPLE_TOKEN_REVOKE_MAX_ATTEMPTS = 30;

/**
 * `persistToken` işlemi hesap silme işleminin tuttuğu kullanıcı kilidini
 * bekleyebilir (en çok `ACCOUNT_DELETION_TX_TIMEOUT_MS`). Prisma varsayılanları
 * (timeout 5 sn, maxWait 2 sn) bu beklemede işlemi düşürür: token ne saklanır
 * ne iptale alınırdı. İkisi de silme süresinden büyük tutulur.
 */
export const PERSIST_TOKEN_TX_OPTIONS = {
  timeout: ACCOUNT_DELETION_TX_TIMEOUT_MS + 15_000,
  maxWait: ACCOUNT_DELETION_TX_TIMEOUT_MS + 5_000,
} as const;

const NOT_CONFIGURED_MESSAGE =
  "Apple token revocation is not configured (APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY / APPLE_TOKEN_ENCRYPTION_KEY) — the job retries and dead-letters until it is";

/**
 * `invalid_client` için deneme üst sınırı. Yeni oluşturulan/bağlanan Apple
 * anahtarı ya da client id eşlemesi yayılırken Apple kısa süre bunu döndürebilir;
 * birkaç deneme (10 sn, 20 sn geri çekilme) bu penceresini karşılar, sonra
 * gerçekten yanlış yapılandırma sayılıp DLQ'ya düşer.
 */
export const APPLE_INVALID_CLIENT_MAX_ATTEMPTS = 3;

/**
 * Apple revoke hatasının sınıfı (OAuth hata kodu, RFC 6749 §5.2 / 7009):
 * - `permanent`: istek/kimlik reddedildi (`invalid_grant`, `unauthorized_client`,
 *   `unsupported_client`, `invalid_request`, `unsupported_grant_type`,
 *   `unsupported_token_type`; `invalid_client` ise ilk
 *   `APPLE_INVALID_CLIENT_MAX_ATTEMPTS` denemeden sonra) → DLQ. Şifreli token
 *   SİLİNMEZ: Apple `invalid_grant`ı geçersiz token kadar yanlış/uyuşmayan
 *   client id için de döndürür; "zaten iptal" varsayıp token'ı silmek, düzeltme
 *   sonrası yeniden denemeyi imkânsız kılar. Zaten iptal edilmiş token'ın
 *   revoke'u normalde 200 döner.
 * - `transient`: kod yok (5xx, boş gövde) ya da başka bir kod — yeniden dene.
 */
export function classifyAppleRevokeFailure(
  code: string | null,
  /** Bu denemenin 1 tabanlı sırası (outbox `attempts + 1`). */
  attempt = 1,
): "permanent" | "transient" {
  if (code === "invalid_client") {
    return attempt >= APPLE_INVALID_CLIENT_MAX_ATTEMPTS
      ? "permanent"
      : "transient";
  }
  return code && PERMANENT_APPLE_ERROR_CODES.has(code)
    ? "permanent"
    : "transient";
}

const PERMANENT_APPLE_ERROR_CODES: ReadonlySet<string> = new Set([
  "invalid_grant",
  "unauthorized_client",
  "unsupported_client",
  "invalid_request",
  "unsupported_grant_type",
  "unsupported_token_type",
]);

/**
 * Sign in with Apple token yaşam döngüsü (App Store 5.1.1(v)): girişte gelen
 * `authorizationCode`u refresh token'a çevirip şifreli saklar, hesap silmede
 * iptali outbox'a yazar ve iptal handler'ını sağlar.
 *
 * Yapılandırma env'den gelir (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY +
 * APPLE_TOKEN_ENCRYPTION_KEY). Eksikse özellik NO-OP'tur ve uyarı loglanır:
 * giriş ve hesap silme hiçbir koşulda bu servis yüzünden düşmez.
 *
 * Client id, girişin yapıldığı uygulamanınkidir (identity token `aud`:
 * com.tarodan.app ya da staging'de com.tarodan.app.staging); kod o client id
 * ile çevrilir, iptal de satırda saklanan AYNI client id ile yapılır.
 */
@Injectable()
export class AppleTokenService implements OnModuleInit {
  private readonly logger = new Logger(AppleTokenService.name);
  private warnedNotConfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cipher: AppleTokenCipher,
    private readonly outbox: OutboxService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(OUTBOX_APPLE_TOKEN_REVOKE, (payload, event) =>
      this.revoke(
        (payload as AppleTokenRevokePayload).appleSignInTokenId,
        event.attempts + 1,
      ),
    );
  }

  /** İmza anahtarı + şifreleme anahtarı hazır mı? */
  isEnabled(): boolean {
    return this.signingKey() !== null && this.cipher.isAvailable();
  }

  /**
   * Girişte gelen `authorizationCode`u Apple'ın token ucunda refresh token'a
   * çevirir ve şifreli saklar (kullanıcı × client id başına tek CANLI satır;
   * yeni giriş onun yerine geçer — bkz. `persistToken`). ASLA fırlatmaz: kod tek kullanımlık ve
   * 5 dakikalık; çevrilemezse giriş yine başarılıdır, bir sonraki giriş yeni
   * bir kodla yeniden dener. Giriş bunu BEKLEMEZ (arka planda çalışır) ve
   * Apple çağrısı `APPLE_REQUEST_TIMEOUT_MS` ile sınırlıdır.
   */
  async storeFromAuthorizationCode(input: {
    userId: string;
    /** Doğrulanmış identity token'ın `sub`'ı — kod bu kimliğe ait olmalı. */
    appleUserId: string;
    clientId: string;
    authorizationCode: string;
  }): Promise<void> {
    if (!this.isEnabled()) {
      this.warnNotConfigured();
      return;
    }
    // Kimliği doğrulanmış (kod bu kullanıcıya ait) düz refresh token; yalnız
    // saklama başarısız olursa doğrudan iptal için tutulur, loglanmaz.
    let verifiedRefreshToken: string | null = null;
    try {
      // Native akışta redirect_uri yoktur.
      const response = await postAppleEndpoint("/auth/token", {
        client_id: input.clientId,
        client_secret: this.clientSecret(input.clientId),
        code: input.authorizationCode,
        grant_type: "authorization_code",
      });
      const refreshToken = response.body?.refresh_token;
      if (!response.ok || typeof refreshToken !== "string" || !refreshToken) {
        this.logger.warn(
          `Apple authorization code could not be exchanged (user=${input.userId}, client=${input.clientId}): ${response.status} ${appleErrorCode(response) ?? "no refresh_token"}`,
        );
        return;
      }
      // Kod kimliğe bağlı olmalı: istemci başka bir Apple hesabının (ya da
      // başka bir uygulamanın) kodunu göndermişse token bu kullanıcıya yazılmaz.
      const claims = idTokenClaims(response.body?.id_token);
      if (claims?.sub !== input.appleUserId || claims?.aud !== input.clientId) {
        this.logger.warn(
          `Apple authorization code does not belong to the signed-in identity (user=${input.userId}, client=${input.clientId}) — not stored`,
        );
        return;
      }
      verifiedRefreshToken = refreshToken;
      const stored = await this.persistToken(
        input.userId,
        input.clientId,
        this.cipher.encrypt(refreshToken),
      );
      if (!stored) {
        // Kullanıcı satırı hiç yok: token satırı açılamaz (FK) ve iptali
        // sürdürecek bir iş de yoktur → Apple'a doğrudan iptal.
        this.logger.warn(
          `Apple token arrived for a user that no longer exists (user=${input.userId}, client=${input.clientId}) — revoking directly`,
        );
        await this.revokeDirectly(input.userId, input.clientId, refreshToken);
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Apple refresh token could not be stored (user=${input.userId}, client=${input.clientId}): ${errorMessage(error)}`,
      );
      if (verifiedRefreshToken) {
        await this.revokeIfAccountDeleted(
          input.userId,
          input.clientId,
          verifiedRefreshToken,
        );
      }
    }
  }

  /**
   * Token'ı hesap silmeyle YARIŞMADAN yazar. Kullanıcı satırı `FOR UPDATE` ile
   * kilitlenir; `requestRevocation` da aynı satırı kilitlediği için ikisi
   * sıralanır:
   * - giriş önce kilitlerse token yazılır, silme ardından onu da iptale alır;
   * - silme önce kilitlerse (ya da kullanıcı zaten silinmişse) token
   *   iptal-istenmiş YENİ bir satır olarak yazılır ve iptal işi hemen
   *   kuyruğa girer — silinmiş kullanıcıda iptal edilmeyecek token kalmaz.
   * - kullanıcı satırı hiç yoksa (hesaplar anonimleştirilir, normalde
   *   silinmez) satır yazılamaz — FK ihlali olurdu; `false` döner ve çağıran
   *   token'ı Apple'a doğrudan iptal eder.
   * İptali istenmiş satırın üzerine ASLA yazılmaz: güncelleme yalnız
   * kullanıcının canlı (`revokeRequestedAt` boş) satırına yapılır.
   *
   * İkinci cihaz girişi önceki refresh token'ı İPTAL ETMEDEN ezer (bilinçli):
   * Apple'ın revoke'u yalnız token'ı değil kullanıcının o uygulamaya verdiği
   * yetkiyi de geçersiz kılar — eski token'ı iptal etmek, aynı kullanıcının
   * yeni oturumunun yetkisini de düşürür. Hesap silmede en son token'ın
   * iptali yetkinin tamamını kaldırır; ezilen token o andan sonra kullanılmaz
   * ve saklanmaz.
   *
   * @returns false: kullanıcı satırı yok, hiçbir şey yazılmadı
   */
  private async persistToken(
    userId: string,
    clientId: string,
    refreshTokenEncrypted: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<Array<{ deleted_at: Date | null }>>`
        SELECT "deleted_at" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

      if (!user) return false;

      if (user.deleted_at) {
        const row = await tx.appleSignInToken.create({
          data: {
            userId,
            clientId,
            refreshTokenEncrypted,
            revokeRequestedAt: new Date(),
          },
          select: { id: true },
        });
        await this.enqueueRevoke(tx, row.id);
        this.logger.warn(
          `Apple token arrived after account deletion (user=${userId}, client=${clientId}) — queued for revocation`,
        );
        return true;
      }

      const live = await tx.appleSignInToken.findFirst({
        where: { userId, clientId, revokeRequestedAt: null },
        select: { id: true },
      });
      if (live) {
        await tx.appleSignInToken.update({
          where: { id: live.id },
          data: {
            refreshTokenEncrypted,
            revokedAt: null,
            lastRevokeError: null,
          },
        });
      } else {
        await tx.appleSignInToken.create({
          data: { userId, clientId, refreshTokenEncrypted },
        });
      }
      return true;
    }, PERSIST_TOKEN_TX_OPTIONS);
  }

  /**
   * Token saklanamadı (işlem zaman aşımı, DB hatası…) ve hesap bu arada
   * silinmiş olabilir: silinmiş kullanıcıda iptal edilmemiş yetki kalmasın
   * diye token'ı Apple'a DOĞRUDAN, en iyi çabayla iptal eder. Canlı hesapta
   * bir şey yapılmaz (iptal, yetkiyi kullanıcının canlı oturumundan da
   * kaldırırdı; sonraki giriş yeni bir kodla yeniden saklar). Hesabın durumu
   * okunamazsa da iptal edilmez. ASLA fırlatmaz.
   */
  private async revokeIfAccountDeleted(
    userId: string,
    clientId: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { deletedAt: true },
      });
      if (user && !user.deletedAt) return;
    } catch (error: unknown) {
      this.logger.error(
        `Apple token not stored and account state unknown — not revoked (user=${userId}, client=${clientId}): ${errorMessage(error)}`,
      );
      return;
    }
    await this.revokeDirectly(userId, clientId, refreshToken);
  }

  /** Apple'a doğrudan (outbox'sız, satırsız) iptal; en iyi çaba, asla fırlatmaz. */
  private async revokeDirectly(
    userId: string,
    clientId: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      const response = await postAppleEndpoint(
        "/auth/revoke",
        this.revokeParams(clientId, refreshToken),
      );
      if (response.ok) {
        this.logger.warn(
          `Apple token of a deleted account revoked directly (user=${userId}, client=${clientId})`,
        );
        return;
      }
      this.logger.error(
        `Apple token of a deleted account could NOT be revoked directly (user=${userId}, client=${clientId}): apple:${response.status}:${appleErrorCode(response) ?? "no_error_code"}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Apple token of a deleted account could NOT be revoked directly (user=${userId}, client=${clientId}): ${errorMessage(error)}`,
      );
    }
  }

  /** `/auth/revoke` form parametreleri (client secret imzası kurulamazsa fırlatır). */
  private revokeParams(
    clientId: string,
    refreshToken: string,
  ): Record<string, string> {
    return {
      client_id: clientId,
      client_secret: this.clientSecret(clientId),
      token: refreshToken,
      token_type_hint: "refresh_token",
    };
  }

  private async enqueueRevoke(
    tx: Prisma.TransactionClient,
    appleSignInTokenId: string,
  ): Promise<void> {
    await this.outbox.enqueue(tx, {
      type: OUTBOX_APPLE_TOKEN_REVOKE,
      payload: { appleSignInTokenId } satisfies AppleTokenRevokePayload,
      dedupeKey: `apple-token-revoke:${appleSignInTokenId}`,
      maxAttempts: APPLE_TOKEN_REVOKE_MAX_ATTEMPTS,
    });
  }

  /**
   * Hesap silme transaction'ı İÇİNDE çağrılır: kullanıcının iptal edilmemiş
   * token satırlarını damgalar ve her biri için iptal işini outbox'a yazar.
   * Önce kullanıcı satırını kilitler (`persistToken` ile sıralanır: eşzamanlı
   * bir girişin token'ı ya burada görülür ya da iptal-istenmiş yazılır).
   * Apple çağrısı commit sonrası drainer'dadır; başarısızlık silmeyi
   * engellemez, outbox geri çekilerek yeniden dener (kalıcı hatada DLQ).
   *
   * @returns kuyruğa alınan iptal sayısı
   */
  async requestRevocation(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const tokens = await tx.appleSignInToken.findMany({
      where: {
        userId,
        refreshTokenEncrypted: { not: null },
        revokedAt: null,
        revokeRequestedAt: null,
      },
      select: { id: true },
    });
    if (tokens.length === 0) return 0;

    await tx.appleSignInToken.updateMany({
      where: { id: { in: tokens.map((token) => token.id) } },
      data: { revokeRequestedAt: new Date() },
    });
    for (const token of tokens) {
      await this.enqueueRevoke(tx, token.id);
    }
    return tokens.length;
  }

  /**
   * Outbox handler'ı — at-least-once çalışır, idempotent: iptal edilmiş ya da
   * token'ı kalmamış satır no-op'tur. Apple hatası fırlatılır (outbox yeniden
   * dener). Yapılandırma yoksa da FIRLATIR: işi "tamamlandı" saymak, env
   * düzeltilse bile iptali hiç denemez ve şifreli token'ı silinmiş kullanıcıda
   * bırakırdı. Denemeler biterse iş DLQ'ya düşer (dashboard alarmı).
   *
   * @param attempt bu denemenin 1 tabanlı sırası (outbox `attempts + 1`);
   *   `invalid_client` sınırı için.
   */
  async revoke(appleSignInTokenId: string, attempt = 1): Promise<void> {
    const row = await this.prisma.appleSignInToken.findUnique({
      where: { id: appleSignInTokenId },
    });
    if (!row) {
      this.logger.warn(
        `Apple token revoke: row ${appleSignInTokenId} not found — no-op`,
      );
      return;
    }
    if (row.revokedAt || !row.refreshTokenEncrypted) return;

    if (!this.isEnabled()) {
      this.warnNotConfigured();
      await this.recordError(row.id, "not_configured");
      throw new Error(NOT_CONFIGURED_MESSAGE);
    }

    // Yapılandırma/anahtar hataları kalıcıdır: imza kurulamıyor ya da şifreli
    // token bu anahtarla açılmıyorsa (anahtar döndürülmüş) tekrar denemek
    // sonucu değiştirmez → doğrudan DLQ.
    let params: Record<string, string>;
    try {
      params = this.revokeParams(
        row.clientId,
        this.cipher.decrypt(row.refreshTokenEncrypted),
      );
    } catch (error: unknown) {
      await this.recordError(row.id, `config:${errorMessage(error)}`);
      throw new PermanentOutboxError(
        `Apple token revoke for ${row.id} cannot be prepared (check APPLE_PRIVATE_KEY / APPLE_KEY_ID / APPLE_TOKEN_ENCRYPTION_KEY): ${errorMessage(error)}`,
      );
    }

    let response: Awaited<ReturnType<typeof postAppleEndpoint>>;
    try {
      response = await postAppleEndpoint("/auth/revoke", params);
    } catch (error: unknown) {
      // Ağ hatası / zaman aşımı: geçici, yeniden denenir.
      await this.recordError(row.id, errorMessage(error));
      throw error;
    }

    // Yalnız 2xx başarıdır: boş gövdeli 5xx iptal edilmemiş token'ı
    // "iptal edildi" sayıp silerdi (yeniden denenemezdi).
    if (!response.ok) {
      const code = appleErrorCode(response);
      const failure = `apple:${response.status}:${code ?? "no_error_code"}`;
      const outcome = classifyAppleRevokeFailure(code, attempt);

      await this.recordError(row.id, failure);
      const message = `Apple token revoke failed for ${row.id} (client=${row.clientId}): ${failure}`;
      if (outcome === "permanent") {
        throw new PermanentOutboxError(
          `${message} — Apple rejected the request (invalid token or client credentials); the encrypted token is kept: check that the Sign in with Apple key is bound to client id ${row.clientId}, then redrive the dead job (docs/OPERATIONS.md)`,
        );
      }
      throw new Error(message);
    }

    await this.markRevoked(row.id);
    this.logger.log(
      `Apple token revoked (row=${row.id}, user=${row.userId}, client=${row.clientId})`,
    );
  }

  /**
   * DLQ'ya düşmüş (`dead`) `apple.token_revoke` işlerini yeniden kuyruğa alır
   * (bakım script'i: `maintenance/redrive-apple-token-revocations.ts`). Dedupe
   * upsert'i ölü işe dokunmaz ve `requestRevocation` iptali istenmiş satırı
   * atlar; bu yüzden yanlış yapılandırma (client id / anahtar bağı) ya da
   * eksik env düzeltildikten sonra işi geri getirmenin tek yolu budur.
   *
   * Yalnız hâlâ iptal edilebilir olanlar alınır: satırın şifreli token'ı
   * duruyor ve `revokedAt` boş. Yapılandırma hâlâ eksikse uygulama reddedilir
   * (iş yine ölürdü). Kuru koşu sayar, yazmaz. İdempotent: yeniden kuyruğa
   * alınan iş artık `dead` değildir.
   */
  async redriveDeadRevocations(opts: { dryRun: boolean }): Promise<{
    dead: number;
    redrivable: number;
    requeued: number;
  }> {
    const deadEvents = await this.prisma.outboxEvent.findMany({
      where: { type: OUTBOX_APPLE_TOKEN_REVOKE, status: OutboxStatus.dead },
      select: { id: true, payload: true },
    });
    const tokenIdOf = (payload: unknown): string | undefined => {
      const id = (payload as Partial<AppleTokenRevokePayload> | null)
        ?.appleSignInTokenId;
      return typeof id === "string" ? id : undefined;
    };
    const tokenIds = deadEvents
      .map((event) => tokenIdOf(event.payload))
      .filter((id): id is string => id !== undefined);
    const revocable = new Set(
      (
        await this.prisma.appleSignInToken.findMany({
          where: {
            id: { in: tokenIds },
            refreshTokenEncrypted: { not: null },
            revokedAt: null,
          },
          select: { id: true },
        })
      ).map((token) => token.id),
    );
    const eventIds = deadEvents
      .filter((event) => revocable.has(tokenIdOf(event.payload) ?? ""))
      .map((event) => event.id);
    const counts = { dead: deadEvents.length, redrivable: eventIds.length };

    if (opts.dryRun || eventIds.length === 0) return { ...counts, requeued: 0 };
    if (!this.isEnabled()) {
      this.warnNotConfigured();
      throw new Error(
        "Apple token revocation is not configured — set APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY / APPLE_TOKEN_ENCRYPTION_KEY first, otherwise the redriven jobs would fail again",
      );
    }
    // CAS: yalnız hâlâ `dead` olanlar (eşzamanlı ikinci koşu çift saymaz).
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id: { in: eventIds }, status: OutboxStatus.dead },
      data: {
        status: OutboxStatus.pending,
        attempts: 0,
        nextAttemptAt: new Date(),
      },
    });
    this.logger.warn(
      `Apple token revoke: ${result.count} dead job(s) requeued for redrive`,
    );
    return { ...counts, requeued: result.count };
  }

  /** İptal tamam: damga + token NULL (iptal edilmiş token saklanmaz). */
  private async markRevoked(id: string): Promise<void> {
    await this.prisma.appleSignInToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        refreshTokenEncrypted: null,
        lastRevokeError: null,
      },
    });
  }

  private async recordError(id: string, message: string): Promise<void> {
    await this.prisma.appleSignInToken
      .update({
        where: { id },
        data: { lastRevokeError: message.slice(0, MAX_ERROR_LENGTH) },
      })
      .catch(() => undefined);
  }

  /** Apple'ın istediği ES256 client secret (5 dk geçerli JWT). */
  private clientSecret(clientId: string): string {
    const key = this.signingKey();
    if (!key) throw new Error("Apple signing key is not configured");
    return appleSignin.getClientSecret({
      clientID: clientId,
      teamID: key.teamId,
      keyIdentifier: key.keyId,
      privateKey: key.privateKey,
      expAfter: 300,
    });
  }

  private signingKey(): AppleSigningKey | null {
    const teamId = this.config.get<string>("APPLE_TEAM_ID")?.trim();
    const keyId = this.config.get<string>("APPLE_KEY_ID")?.trim();
    // Tek satırlık env değerinde PEM satır sonları `\n` olarak yazılabilir.
    const privateKey = this.config
      .get<string>("APPLE_PRIVATE_KEY")
      ?.replace(/\\n/g, "\n")
      .trim();
    if (!teamId || !keyId || !privateKey) return null;
    return { teamId, keyId, privateKey };
  }

  private warnNotConfigured(): void {
    if (this.warnedNotConfigured) return;
    this.warnedNotConfigured = true;
    this.logger.warn(
      "Sign in with Apple token revocation is disabled: APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY / APPLE_TOKEN_ENCRYPTION_KEY missing (App Store 5.1.1(v))",
    );
  }
}
