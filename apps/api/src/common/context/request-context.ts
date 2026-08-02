import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * İstek korelasyon kimliği (requestId) — bir isteğin ürettiği tüm izleri
 * birbirine bağlar: konsol satırları (AppNestLogger bağlama ekler), Sentry
 * olayı, `error_logs` satırı ve 500 yanıt gövdesi. Destek talebinde kullanıcı
 * gördüğü kimliği söyler, operatör tek grep ile isteğin tamamını bulur.
 *
 * Taşıyıcı AsyncLocalStorage: Node tek process'te binlerce isteği eşzamanlı
 * yürütür, global değişken kimlikleri birbirine karıştırırdı.
 */
interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

/** Aktif isteğin kimliği; istek bağlamı dışında (cron/worker) undefined. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Verilen kimlikle bir bağlam açar — testler ve worker'lar için. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** Gelen başlık istemci kontrolündedir: log enjeksiyonuna karşı daralt. */
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Her isteğe kimlik atar, yanıt başlığına yazar ve bağlamı açar. Zincirin
 * devamı için gelen `X-Request-Id` korunur (proxy veya çağıran servis üretmişse
 * aynı kimlikle devam edilir), ancak yalnız güvenli biçimdeyse.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers?.["x-request-id"];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId =
    candidate && SAFE_ID.test(candidate) ? candidate : randomUUID();

  res.setHeader("X-Request-Id", requestId);
  storage.run({ requestId }, () => next());
}
