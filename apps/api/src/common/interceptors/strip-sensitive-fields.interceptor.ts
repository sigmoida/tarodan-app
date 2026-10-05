import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { LEGAL_IDENTITY_FIELDS } from "@tarodan/types";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { IS_ADMIN_ROUTE_KEY } from "../../modules/auth/decorators/admin-route.decorator";

/**
 * Defense-in-depth (#71): strip sensitive fields from every HTTP response body.
 *
 * Response safety otherwise relies on every endpoint manually whitelisting
 * fields; a future endpoint that returns a raw Prisma `user` would leak
 * `passwordHash`. This interceptor removes such keys from the outgoing payload
 * as a last line of defense — it does NOT replace per-endpoint field selection.
 *
 * It only recurses into PLAIN objects and arrays. Class instances (e.g. Prisma
 * `Decimal`, `Date`, `Buffer`, `StreamableFile`) are returned untouched, so this
 * is safe for money fields and binary responses — unlike a global
 * `ClassSerializerInterceptor`, which would run `instanceToPlain` and corrupt
 * `Decimal` values.
 */
export const SENSITIVE_RESPONSE_KEYS: ReadonlySet<string> = new Set([
  "passwordHash",
  "tokenHash",
  "codeHash",
  "sessionToken",
  "unsubscribeToken",
  "utoken",
  "ctoken",
  "twoFactorSecret",
  "refreshTokens",
  "passwordResetTokens",
  "emailVerificationTokens",
  "phoneVerificationTokens",
  "emailChangeTokens",
  "adminSessions",
]);

/**
 * Yasal kimlik (ad, soyad, TCKN) — devlet bildirimi için tutulur, başka hiçbir
 * üyeye gitmez. Ham bir `user` satırı yanlışlıkla herkese açık bir yüke (profil,
 * satıcı kartı, sipariş karşı tarafı) karışsa bile bu anahtarlar düşer.
 *
 * İki istisna, ikisi de açıkça işaretli: admin rotaları (`@AdminRoute`, kimliği
 * yönetici panelinde görmek işin kendisi) ve üyenin KENDİ kimlik ucu
 * (`@ExposesLegalIdentity`). Başka bir uç bu alanları döndürmek isterse bilinçli
 * olarak işaretlenmelidir — sessizce sızamaz.
 */
export const LEGAL_IDENTITY_RESPONSE_KEYS: ReadonlySet<string> = new Set(
  LEGAL_IDENTITY_FIELDS,
);

export const EXPOSES_LEGAL_IDENTITY_KEY = "exposesLegalIdentity";

/** Yalnız sahibine kendi yasal kimliğini döndüren uç için. */
export const ExposesLegalIdentity = () =>
  SetMetadata(EXPOSES_LEGAL_IDENTITY_KEY, true);

const STRICT_KEYS: ReadonlySet<string> = new Set([
  ...SENSITIVE_RESPONSE_KEYS,
  ...LEGAL_IDENTITY_RESPONSE_KEYS,
]);

@Injectable()
export class StripSensitiveFieldsInterceptor implements NestInterceptor {
  constructor(@Optional() private readonly reflector?: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const keys = this.mayExposeLegalIdentity(context)
      ? SENSITIVE_RESPONSE_KEYS
      : STRICT_KEYS;
    return next
      .handle()
      .pipe(map((data) => this.strip(data, keys, new WeakSet<object>())));
  }

  /**
   * Varsayılan KAPALI: reflector ya da handler bilgisi yoksa (test, websocket
   * olmayan özel bağlam) yasal kimlik de düşürülür.
   */
  private mayExposeLegalIdentity(context: ExecutionContext): boolean {
    if (
      !this.reflector ||
      typeof context.getHandler !== "function" ||
      typeof context.getClass !== "function"
    ) {
      return false;
    }
    const targets = [context.getHandler(), context.getClass()];
    return (
      this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ROUTE_KEY, targets) ===
        true ||
      this.reflector.getAllAndOverride<boolean>(
        EXPOSES_LEGAL_IDENTITY_KEY,
        targets,
      ) === true
    );
  }

  private strip(
    value: unknown,
    keys: ReadonlySet<string>,
    seen: WeakSet<object>,
  ): unknown {
    if (value === null || typeof value !== "object") return value;

    // Dates, Buffers and any other class instances are left as-is; only plain
    // objects and arrays (what Prisma / plain JSON responses are made of) are
    // walked. This keeps Decimal money values and binary payloads intact.
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    if (seen.has(value)) return value;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) this.strip(item, keys, seen);
      return value;
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;

    for (const key of Object.keys(value)) {
      if (keys.has(key)) {
        delete (value as Record<string, unknown>)[key];
      } else {
        this.strip((value as Record<string, unknown>)[key], keys, seen);
      }
    }
    return value;
  }
}
