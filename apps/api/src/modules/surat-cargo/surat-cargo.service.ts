import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import type {
  SuratGonderiPayload,
  SuratShipmentInput,
  SuratShipmentResult,
  SuratShipmentSuccess,
  SuratTechnicalCode,
} from './surat-cargo.types';
import { SuratSoapClient } from './surat-soap.client';
import { withSuratTechnicalRetries } from './surat-technical-retry';

export const SURAT_SOAP_CLIENT = Symbol('SURAT_SOAP_CLIENT');

const IDEM_CACHE_PREFIX = 'surat:idem:ok:';
const IDEM_CACHE_TTL_SEC = 7 * 24 * 3600;

function classifyCaughtError(e: unknown): SuratTechnicalCode {
  if (e && typeof e === 'object') {
    const err = e as NodeJS.ErrnoException & { statusCode?: number; message?: string };
    const code = err.code;
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return 'TIMEOUT';
    if (
      code === 'ECONNRESET' ||
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      code === 'EPIPE'
    ) {
      return 'NETWORK';
    }
    const sc = err.statusCode;
    if (typeof sc === 'number' && sc >= 500) return 'HTTP_5XX';
    const msg = String(err.message || '');
    if (/SURAT_SOAP_LIVE_NOT_IMPLEMENTED/i.test(msg)) return 'UNKNOWN';
    if (/SOAP\s*Fault/i.test(msg)) return 'SOAP_FAULT';
    if (/XML|parse|Unexpected/i.test(msg)) return 'PARSE_ERROR';
  }
  return 'UNKNOWN';
}

@Injectable()
export class SuratCargoService {
  private readonly logger = new Logger(SuratCargoService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
    @Inject(SURAT_SOAP_CLIENT) private readonly soapClient: SuratSoapClient,
  ) {}

  /**
   * When false, OrderService skips Surat entirely (legacy behaviour).
   */
  isIntegrationEnabled(): boolean {
    const v = this.configService.get<string>('SURAT_CARGO_ENABLED', 'false')?.trim();
    return v === 'true' || v === '1';
  }

  /**
   * Idempotent success cache + technical retries. Same idempotencyKey replays cached Tamam without second SOAP.
   */
  async submitShipmentWithRetry(input: SuratShipmentInput): Promise<SuratShipmentResult> {
    const cacheKey = `${IDEM_CACHE_PREFIX}${input.idempotencyKey}`;
    const cached = await this.cache.get<SuratShipmentSuccess>(cacheKey);
    if (cached?.ok === true && cached.suratMessage === 'Tamam') {
      this.logger.log(
        `Surat idempotency cache hit key=${input.idempotencyKey} correlation=${input.correlationId}`,
      );
      return {
        ok: true,
        suratMessage: 'Tamam',
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
      };
    }

    const maxAttempts = Math.max(
      1,
      Number(this.configService.get('SURAT_CARGO_MAX_RETRIES', '3')) || 3,
    );
    const baseMs = Number(this.configService.get('SURAT_CARGO_RETRY_BASE_MS', '200')) || 200;
    const timeoutMs = Number(this.configService.get('SURAT_SOAP_TIMEOUT_MS', '15000')) || 15000;

    const result = await withSuratTechnicalRetries(maxAttempts, baseMs, () =>
      this.submitShipmentOnce(input, timeoutMs),
    );

    if (result.ok) {
      await this.cache.set(cacheKey, result, { ttl: IDEM_CACHE_TTL_SEC });
    }

    return result;
  }

  private async submitShipmentOnce(
    input: SuratShipmentInput,
    timeoutMs: number,
  ): Promise<SuratShipmentResult> {
    const { idempotencyKey, correlationId, payload } = input;
    let raw: string | undefined;
    try {
      raw = await this.soapClient.callGonderiyiKargoyaGonderYeni(payload, {
        timeoutMs,
      });
    } catch (e) {
      const code = classifyCaughtError(e);
      this.logger.warn({
        msg: 'Surat SOAP call threw',
        correlationId,
        idempotencyKey,
        code,
        err: e instanceof Error ? e.message : String(e),
      });
      return {
        ok: false,
        kind: 'technical',
        code,
        cause: e instanceof Error ? e : undefined,
        correlationId,
        idempotencyKey,
      };
    }

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return {
        ok: false,
        kind: 'technical',
        code: 'EMPTY_RESPONSE',
        cause: undefined,
        correlationId,
        idempotencyKey,
      };
    }

    const normalized = String(raw).trim();
    if (normalized === 'Tamam') {
      return {
        ok: true,
        suratMessage: 'Tamam',
        correlationId,
        idempotencyKey,
      };
    }

    this.logger.warn({
      msg: 'Surat business failure',
      correlationId,
      idempotencyKey,
      suratMessage: normalized,
    });

    return {
      ok: false,
      kind: 'business',
      suratMessage: normalized,
      correlationId,
      idempotencyKey,
    };
  }

  /**
   * Cancel a shipment in Sürat by OzelKargoTakipNo (typically order number).
   * Idempotent: "Pasif Edilecek Gonderi Bulunamadi!" is treated as success
   * (already cancelled or never existed).
   *
   * Returns { ok: true } if Sürat confirms cancellation or shipment doesn't exist.
   * Returns { ok: false, suratMessage } if Sürat rejects the call for other reasons.
   * Throws on technical failures (timeout, network).
   */
  async cancelShipmentByOrderNumber(
    ozelKargoTakipNo: string,
  ): Promise<{ ok: boolean; suratMessage?: string }> {
    if (!this.isIntegrationEnabled()) {
      return { ok: true, suratMessage: 'integration_disabled' };
    }

    const timeoutMs = Number(this.configService.get('SURAT_SOAP_TIMEOUT_MS', '15000')) || 15000;

    try {
      const raw = await this.soapClient.callGonderiSil(ozelKargoTakipNo, { timeoutMs });
      const normalized = (raw || '').trim();

      // "Tamam" = cancelled, "Pasif Edilecek Gonderi Bulunamadi!" = already gone (idempotent OK)
      if (
        normalized === 'Tamam' ||
        /pasif edilecek gonderi bulunamadi/i.test(normalized) ||
        /bulunamadi/i.test(normalized)
      ) {
        // Invalidate idempotency cache so a future re-submit goes back to API
        try {
          // Cache key uses idempotencyKey (sha256 hash) — we don't have it here.
          // Best effort: nothing to invalidate. The order number alone won't match.
        } catch {
          /* ignore */
        }
        this.logger.log(`Surat shipment cancelled (or absent) ref=${ozelKargoTakipNo} result="${normalized}"`);
        return { ok: true, suratMessage: normalized };
      }

      this.logger.warn(`Surat cancel failed ref=${ozelKargoTakipNo} result="${normalized}"`);
      return { ok: false, suratMessage: normalized };
    } catch (error: any) {
      this.logger.error(`Surat cancel threw ref=${ozelKargoTakipNo}: ${error.message}`);
      throw error;
    }
  }
}
