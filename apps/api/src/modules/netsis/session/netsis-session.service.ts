import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { NetsisConfig } from "../../../config/netsis";
import { CacheService } from "../../cache/cache.service";
import { i18nMessage } from "../../i18n/localized-message";
import {
  NETSIS_CONFIG,
  NETSIS_FALLBACK_TOKEN_TTL_SECONDS,
  NETSIS_PATHS,
  NETSIS_TOKEN_CACHE_KEY,
  NETSIS_TOKEN_LOCK_KEY,
} from "../helpers/netsis.constants";
import { isNetsisRecord } from "../helpers/netsis-response.helper";
import { NetsisRequestException } from "../http/netsis-error";
import { NetsisTransport } from "../http/netsis-transport";

/** Redis'te tutulan şekil — yalnız token; kimlik bilgisi asla yazılmaz. */
interface CachedNetsisToken {
  accessToken: string;
}

/** Kilit sahibini beklerken önbelleği yoklama aralığı. */
const LOCK_POLL_MS = 250;

/**
 * Önbellek ömrü: Netsis'in verdiği süreden güvenlik payı düşülür; böylece
 * token, Netsis onu düşürmeden önce bizde düşer. Pay süreyi yiyorsa (çok kısa
 * token) yarı ömür kullanılır — 1 sn'lik önbellek her çağrıda login, yani
 * lisans koltuğu tüketimi demektir.
 */
export function netsisTokenCacheTtlSeconds(
  expiresIn: number | null,
  safetySeconds: number,
): number {
  const lifetime =
    expiresIn !== null && Number.isFinite(expiresIn) && expiresIn > 0
      ? Math.floor(expiresIn)
      : NETSIS_FALLBACK_TOKEN_TTL_SECONDS;
  const ttl = lifetime - safetySeconds;
  return ttl > 0 ? ttl : Math.max(1, Math.floor(lifetime / 2));
}

/**
 * Token yanıtını okur. VERIFY: standart OAuth şekli varsayıldı —
 * `{ access_token, token_type: "bearer", expires_in }`.
 */
export function readNetsisTokenResponse(data: unknown): {
  accessToken: string;
  expiresIn: number | null;
} {
  const accessToken = isNetsisRecord(data) ? data.access_token : undefined;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new NetsisRequestException(
      "auth",
      null,
      "token response carried no access_token",
    );
  }
  const rawExpires = isNetsisRecord(data) ? data.expires_in : undefined;
  const expiresIn =
    typeof rawExpires === "number"
      ? rawExpires
      : typeof rawExpires === "string" && rawExpires.trim()
        ? Number(rawExpires)
        : null;
  return { accessToken, expiresIn };
}

/**
 * Tüm süreçlerin paylaştığı TEK NetOpenX oturumu.
 *
 * NetOpenX lisansı EŞZAMANLI oturum sayar; API aynı build'i birden fazla
 * süreçte koşar (web + worker, §11). Her süreç kendi token'ını alsaydı N
 * koltuk tüketir, lisans dolunca da login'ler reddedilirdi. Bu yüzden:
 *  - token Redis'te `netsis:token` altında, Netsis ömründen güvenlik payı
 *    düşülerek tutulur; her süreç önce oraya bakar,
 *  - token yoksa login'i `setIfAbsent` kilidini alan TEK süreç yapar; diğerleri
 *    kilit ömrü boyunca önbelleği yoklar,
 *  - süreç içinde aynı anda gelen istekler tek bir alma işlemine bağlanır,
 *  - 401'de token (hâlâ aynıysa) silinir, BİR kez yeniden login olunur.
 *
 * Redis yoksa `setIfAbsent` false döner ve kilit hiç alınamaz: bilerek
 * kapalı-başarısız — Redis'siz her süreç ayrı login olur, lisans tükenirdi.
 *
 * Kapanışta `revoke` ÇAĞRILMAZ: token diğer süreçlerle ortak; bir sürecin
 * yeniden başlaması onu öldürseydi her deploy'da tüm süreçler 401 alırdı.
 * Token Redis'te kaldığı için yeniden başlayan süreç yeni koltuk açmaz.
 */
@Injectable()
export class NetsisSessionService {
  private readonly logger = new Logger(NetsisSessionService.name);
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly transport: NetsisTransport,
    private readonly cache: CacheService,
    @Inject(NETSIS_CONFIG) private readonly config: NetsisConfig,
  ) {}

  /**
   * `call`'ı geçerli bir token'la çalıştırır. 401'de token geçersiz sayılır ve
   * çağrı yeni token'la BİR kez tekrarlanır; ikinci hata olduğu gibi yükselir.
   * `retryOnUnauthorized: false` — açık transaction'lı çağrılar için: transaction
   * oturuma bağlıdır, yeni oturumda tekrar etmek yarım işi başka oturumda
   * sürdürmek olurdu.
   */
  async withSession<T>(
    call: (accessToken: string) => Promise<T>,
    options: { retryOnUnauthorized?: boolean } = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    try {
      return await call(token);
    } catch (error: unknown) {
      const retry = options.retryOnUnauthorized ?? true;
      if (!retry || !isUnauthorized(error)) throw error;
      this.logger.warn("Netsis rejected the shared token (401); re-authenticating once");
      await this.invalidate(token);
      return call(await this.getAccessToken());
    }
  }

  async getAccessToken(): Promise<string> {
    const cached = await this.readCachedToken();
    if (cached) return cached;
    if (!this.inflight) {
      this.inflight = this.acquireShared().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  /**
   * Önbellekteki token hâlâ `staleToken` ise siler. Başka bir süreç onu çoktan
   * yenilediyse dokunulmaz — yoksa taze token'ı silip herkese bir login daha
   * yaptırırdık. (get + del atomik değil; en kötü sonuç fazladan bir login.)
   */
  async invalidate(staleToken: string): Promise<void> {
    if ((await this.readCachedToken()) === staleToken) {
      await this.cache.del(NETSIS_TOKEN_CACHE_KEY);
    }
  }

  /**
   * Ortak oturumu kapatır (lisans koltuğunu bırakır): önce önbellekten silinir
   * ki kimse iptal edilmiş token'ı almasın, sonra `GET revoke`. Testler, bakım
   * script'leri ve kontrollü kapatma için — süreç kapanışına bağlanmaz.
   */
  async revoke(): Promise<void> {
    const token = await this.readCachedToken();
    if (!token) return;
    await this.cache.del(NETSIS_TOKEN_CACHE_KEY);
    try {
      await this.transport.send({
        method: "GET",
        path: NETSIS_PATHS.revoke,
        bearerToken: token,
      });
    } catch (error: unknown) {
      const kind =
        error instanceof NetsisRequestException ? error.kind : "unknown";
      this.logger.warn(`Netsis revoke failed (${kind}); token dropped locally`);
    }
  }

  /** Testlerde anında çözülecek şekilde ezilir. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async acquireShared(): Promise<string> {
    const lockTtlSeconds = Math.ceil(this.config.timeoutMs / 1000) + 5;
    // Kilit sahibi çökerse kilit kendiliğinden düşer; bekleyen onu alabilsin.
    const deadline = Date.now() + (lockTtlSeconds + 2) * 1000;

    for (;;) {
      if (await this.cache.setIfAbsent(NETSIS_TOKEN_LOCK_KEY, lockTtlSeconds)) {
        try {
          // Kilidi beklerken başka bir süreç token yazmış olabilir.
          return (await this.readCachedToken()) ?? (await this.login());
        } finally {
          await this.cache.del(NETSIS_TOKEN_LOCK_KEY);
        }
      }
      await this.sleep(LOCK_POLL_MS);
      const cached = await this.readCachedToken();
      if (cached) return cached;
      if (Date.now() >= deadline) {
        throw new ServiceUnavailableException(
          i18nMessage("server.netsis.sessionBusy"),
        );
      }
    }
  }

  private async login(): Promise<string> {
    const { baseUrl, username, password, dbName } = this.config;
    if (!baseUrl || !username || !password || !dbName) {
      throw new NetsisRequestException(
        "configuration",
        null,
        "NETSIS_BASE_URL / NETSIS_USERNAME / NETSIS_PASSWORD / NETSIS_DB_NAME missing",
        "server.netsis.notConfigured",
      );
    }
    const response = await this.transport.send({
      method: "POST",
      path: NETSIS_PATHS.token,
      form: this.tokenForm(),
    });
    const token = readNetsisTokenResponse(response);
    const ttl = netsisTokenCacheTtlSeconds(
      token.expiresIn,
      this.config.tokenSafetySeconds,
    );
    await this.cache.set(
      NETSIS_TOKEN_CACHE_KEY,
      { accessToken: token.accessToken } satisfies CachedNetsisToken,
      { ttl },
    );
    this.logger.log(`Netsis session opened; shared for ${ttl}s`);
    return token.accessToken;
  }

  /** VERIFY: standart NetOpenX REST token gövdesi. */
  private tokenForm(): Record<string, string> {
    return {
      grant_type: "password",
      username: this.config.username,
      password: this.config.password,
      dbname: this.config.dbName,
      dbuser: this.config.dbUser,
      dbpassword: this.config.dbPassword,
      dbtype: this.config.dbType,
      branchcode: this.config.branchCode,
    };
  }

  private async readCachedToken(): Promise<string | null> {
    const cached = await this.cache.get<CachedNetsisToken>(
      NETSIS_TOKEN_CACHE_KEY,
    );
    return typeof cached?.accessToken === "string" && cached.accessToken
      ? cached.accessToken
      : null;
  }
}

function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof NetsisRequestException && error.upstreamStatus === 401
  );
}
