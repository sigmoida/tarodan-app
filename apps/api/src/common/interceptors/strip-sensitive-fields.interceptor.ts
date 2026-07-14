import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

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
]);

@Injectable()
export class StripSensitiveFieldsInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(map((data) => this.strip(data, new WeakSet<object>())));
  }

  private strip(value: unknown, seen: WeakSet<object>): unknown {
    if (value === null || typeof value !== "object") return value;

    // Dates, Buffers and any other class instances are left as-is; only plain
    // objects and arrays (what Prisma / plain JSON responses are made of) are
    // walked. This keeps Decimal money values and binary payloads intact.
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    if (seen.has(value)) return value;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) this.strip(item, seen);
      return value;
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;

    for (const key of Object.keys(value)) {
      if (SENSITIVE_RESPONSE_KEYS.has(key)) {
        delete (value as Record<string, unknown>)[key];
      } else {
        this.strip((value as Record<string, unknown>)[key], seen);
      }
    }
    return value;
  }
}
