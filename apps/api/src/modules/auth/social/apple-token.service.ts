import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
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

const NOT_CONFIGURED_MESSAGE =
  "Apple token revocation is not configured (APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY / APPLE_TOKEN_ENCRYPTION_KEY) — the job retries and dead-letters until it is";

/**
 * Apple revoke hatasının sınıfı (OAuth hata kodu, RFC 6749 §5.2 / 7009):
 * - `already_revoked`: `invalid_grant` — token geçersiz/iptal edilmiş, kullanıcı
 *   bağlantıyı Apple'da zaten kaldırmış olabilir. İş tamamdır.
 * - `permanent`: istemci kimliği/isteği reddedildi (`invalid_client`,
 *   `unauthorized_client`, `unsupported_client`, `invalid_request`,
 *   `unsupported_grant_type`, `unsupported_token_type`) — anahtar ya da client
 *   id yapılandırması düzelmeden tekrar denemek boşuna → DLQ.
 * - `transient`: kod yok (5xx, boş gövde) ya da başka bir kod — yeniden dene.
 */
export function classifyAppleRevokeFailure(
  code: string | null,
): "already_revoked" | "permanent" | "transient" {
  if (code === "invalid_grant") return "already_revoked";
  if (
    code &&
    [
      "invalid_client",
      "unauthorized_client",
      "unsupported_client",
      "invalid_request",
      "unsupported_grant_type",
      "unsupported_token_type",
    ].includes(code)
  ) {
    return "permanent";
  }
  return "transient";
}

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
    this.registry.register(OUTBOX_APPLE_TOKEN_REVOKE, (payload) =>
      this.revoke((payload as AppleTokenRevokePayload).appleSignInTokenId),
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
      await this.persistToken(
        input.userId,
        input.clientId,
        this.cipher.encrypt(refreshToken),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Apple refresh token could not be stored (user=${input.userId}, client=${input.clientId}): ${errorMessage(error)}`,
      );
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
   * İptali istenmiş satırın üzerine ASLA yazılmaz: güncelleme yalnız
   * kullanıcının canlı (`revokeRequestedAt` boş) satırına yapılır.
   *
   * İkinci cihaz girişi önceki refresh token'ı İPTAL ETMEDEN ezer (bilinçli):
   * Apple'ın revoke'u yalnız token'ı değil kullanıcının o uygulamaya verdiği
   * yetkiyi de geçersiz kılar — eski token'ı iptal etmek, aynı kullanıcının
   * yeni oturumunun yetkisini de düşürür. Hesap silmede en son token'ın
   * iptali yetkinin tamamını kaldırır; ezilen token o andan sonra kullanılmaz
   * ve saklanmaz.
   */
  private async persistToken(
    userId: string,
    clientId: string,
    refreshTokenEncrypted: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<Array<{ deleted_at: Date | null }>>`
        SELECT "deleted_at" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

      if (!user || user.deleted_at) {
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
        return;
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
    });
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
   */
  async revoke(appleSignInTokenId: string): Promise<void> {
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
      params = {
        client_id: row.clientId,
        client_secret: this.clientSecret(row.clientId),
        token: this.cipher.decrypt(row.refreshTokenEncrypted),
        token_type_hint: "refresh_token",
      };
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
      const outcome = classifyAppleRevokeFailure(code);

      if (outcome === "already_revoked") {
        // Kullanıcı bağlantıyı Apple'da zaten kaldırmış ya da token geçersiz:
        // iptal edilecek bir şey yok — iş tamam, token tutulmaz.
        await this.markRevoked(row.id, failure);
        this.logger.log(
          `Apple token already invalid at Apple, treated as revoked (row=${row.id}, client=${row.clientId})`,
        );
        return;
      }

      await this.recordError(row.id, failure);
      const message = `Apple token revoke failed for ${row.id} (client=${row.clientId}): ${failure}`;
      if (outcome === "permanent") {
        throw new PermanentOutboxError(
          `${message} — Apple rejected our client credentials; check that the Sign in with Apple key is bound to this client id`,
        );
      }
      throw new Error(message);
    }

    await this.markRevoked(row.id, null);
    this.logger.log(
      `Apple token revoked (row=${row.id}, user=${row.userId}, client=${row.clientId})`,
    );
  }

  /** İptal tamam: damga + token NULL (iptal edilmiş token saklanmaz). */
  private async markRevoked(id: string, note: string | null): Promise<void> {
    await this.prisma.appleSignInToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        refreshTokenEncrypted: null,
        lastRevokeError: note,
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
