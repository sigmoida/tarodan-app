import { Injectable } from "@nestjs/common";
import type { NetsisCallOptions } from "../helpers/netsis.types";
import { NetsisSessionService } from "../session/netsis-session.service";
import { NetsisTransport, type NetsisRequest } from "./netsis-transport";

/**
 * Kimlikli NetOpenX çağrıları: her istek ortak oturumun token'ını taşır,
 * 401'de oturum bir kez yenilenir (`NetsisSessionService.withSession`).
 * Kaynak istemcileri (clients/) yalnız bunu kullanır; kimliksiz `public/*`
 * uçları doğrudan `NetsisTransport`'tan gider.
 */
@Injectable()
export class NetsisHttpClient {
  constructor(
    private readonly transport: NetsisTransport,
    private readonly session: NetsisSessionService,
  ) {}

  get(
    path: string,
    query?: NetsisRequest["query"],
    options?: NetsisCallOptions,
  ): Promise<unknown> {
    return this.request({ method: "GET", path, query, ...options });
  }

  post(
    path: string,
    body: unknown,
    options?: NetsisCallOptions,
  ): Promise<unknown> {
    return this.request({ method: "POST", path, body, ...options });
  }

  put(
    path: string,
    body: unknown,
    options?: NetsisCallOptions,
  ): Promise<unknown> {
    return this.request({ method: "PUT", path, body, ...options });
  }

  delete(path: string, options?: NetsisCallOptions): Promise<unknown> {
    return this.request({ method: "DELETE", path, ...options });
  }

  private request(
    request: Omit<NetsisRequest, "bearerToken" | "form">,
  ): Promise<unknown> {
    return this.session.withSession(
      (accessToken) =>
        this.transport.send({ ...request, bearerToken: accessToken }),
      // Transaction oturuma bağlı: yeni oturumda tekrar etmek yanlış olur.
      { retryOnUnauthorized: !request.transactionId },
    );
  }
}
