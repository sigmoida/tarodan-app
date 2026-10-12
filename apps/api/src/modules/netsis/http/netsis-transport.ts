import { Inject, Injectable } from "@nestjs/common";
import type { NetsisConfig } from "../../../config/netsis";
import {
  NETSIS_API_PREFIX,
  NETSIS_CONFIG,
  NETSIS_TRANSACTION_QUERY_PARAM,
} from "../helpers/netsis.constants";
import {
  classifyNetsisError,
  classifyNetsisResponse,
  NetsisRequestException,
  netsisSnippet,
} from "./netsis-error";

export type NetsisHttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface NetsisRequest {
  method: NetsisHttpMethod;
  /** `api/v2/` SONRASI yol, ör. `ARPs/120.01.001` (parçalar önceden kodlanmış). */
  path: string;
  query?: Record<string, string | number | undefined>;
  /** JSON gövde. */
  body?: unknown;
  /** `application/x-www-form-urlencoded` gövde — yalnız token ucu. */
  form?: Record<string, string>;
  bearerToken?: string;
  transactionId?: string;
}

/**
 * NetOpenX REST'e ham HTTP: URL kurma, timeout, JSON çözme, başarısız zarfı
 * hataya çevirme ve sınıflama. Oturum bilmez — kimlikli çağrılar
 * `NetsisHttpClient`'tan, token isteği `NetsisSessionService`'ten gelir.
 *
 * Global `fetch` kullanılır (Sürat/eLogo istemcileriyle aynı): API'nin bir
 * HTTP kütüphanesi bağımlılığı yok, eklemek için de sebep yok.
 */
@Injectable()
export class NetsisTransport {
  constructor(@Inject(NETSIS_CONFIG) private readonly config: NetsisConfig) {}

  async send(request: NetsisRequest): Promise<unknown> {
    const url = this.buildUrl(request);
    const headers: Record<string, string> = { Accept: "application/json" };
    let body: string | undefined;
    if (request.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(request.form).toString();
    } else if (request.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(request.body);
    }
    if (request.bearerToken) {
      headers.Authorization = `Bearer ${request.bearerToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let status: number;
    let text: string;
    try {
      const response = await fetch(url, {
        method: request.method,
        headers,
        body,
        signal: controller.signal,
      });
      status = response.status;
      text = await response.text();
    } catch (error: unknown) {
      // Ağ hatasının mesajı URL'i taşıyabilir ama gövdeyi (kimlik) asla.
      throw new NetsisRequestException(
        classifyNetsisError(error),
        null,
        `${request.method} ${request.path}: ${error instanceof Error ? error.name : "error"}`,
        undefined,
        error,
      );
    } finally {
      clearTimeout(timer);
    }

    if (status >= 400) throw this.failure(request, status, text);
    return this.unwrap(request, status, text);
  }

  private buildUrl(request: NetsisRequest): string {
    if (!this.config.baseUrl) {
      throw new NetsisRequestException(
        "configuration",
        null,
        "NETSIS_BASE_URL is not set",
        "server.netsis.notConfigured",
      );
    }
    const url = new URL(
      `${this.config.baseUrl}/${NETSIS_API_PREFIX}/${request.path}`,
    );
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    if (request.transactionId) {
      this.attachTransaction(url, request.transactionId);
    }
    return url.toString();
  }

  /**
   * transId'yi isteğe bağlayan TEK yer. VERIFY: dokümante değil; Commit /
   * RollBack `?transId=` aldığı için aynı query parametresi varsayıldı. Header
   * çıkarsa yalnız burası değişir.
   */
  private attachTransaction(url: URL, transactionId: string): void {
    url.searchParams.set(NETSIS_TRANSACTION_QUERY_PARAM, transactionId);
  }

  /**
   * Gövdeyi çözer. NetOpenX iş sonuçlarını `{ IsSuccessful, ErrorCode,
   * ErrorDesc, Data }` zarfıyla döndürür (VERIFY): başarısız zarf HTTP 200
   * olsa bile hatadır, başarılı zarftan yalnız `Data` döner. Zarfsız JSON
   * (token ucu, tanımlar) olduğu gibi döner; JSON olmayan gövde (HTML) metin.
   */
  private unwrap(request: NetsisRequest, status: number, text: string): unknown {
    if (!text.trim()) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return text;
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { IsSuccessful?: unknown }).IsSuccessful === "boolean"
    ) {
      const envelope = parsed as {
        IsSuccessful: boolean;
        ErrorCode?: unknown;
        ErrorDesc?: unknown;
        Data?: unknown;
      };
      if (!envelope.IsSuccessful) {
        const description = [envelope.ErrorCode, envelope.ErrorDesc]
          .filter((part) => part !== undefined && part !== null && part !== "")
          .join(" ");
        throw this.failure(request, status, description);
      }
      return envelope.Data ?? null;
    }
    return parsed;
  }

  private failure(
    request: NetsisRequest,
    status: number,
    body: string,
  ): NetsisRequestException {
    return new NetsisRequestException(
      classifyNetsisResponse(status, body),
      status,
      `${request.method} ${request.path} → ${status}: ${netsisSnippet(body)}`,
    );
  }
}
