import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { resolveClientIp, resolveUserAgent } from "../helpers/client-ip";

/**
 * İstek korelasyon kimliği (requestId) — bir isteğin ürettiği tüm izleri
 * birbirine bağlar: konsol satırları (AppNestLogger bağlama ekler), Sentry
 * olayı, `error_logs` satırı ve 500 yanıt gövdesi. Destek talebinde kullanıcı
 * gördüğü kimliği söyler, operatör tek grep ile isteğin tamamını bulur.
 *
 * Taşıyıcı AsyncLocalStorage: Node tek process'te binlerce isteği eşzamanlı
 * yürütür, global değişken kimlikleri birbirine karıştırırdı.
 *
 * Aynı bağlam isteği yapan istemcinin IP'sini ve kullanıcı ajanını da taşır:
 * onay kayıtları "nereden" sorusunu buradan cevaplar. Böylece checkout gibi
 * çok katmanlı bir akışın derinindeki yazım için `req`'i her imzaya taşımak
 * gerekmez.
 */
interface RequestStore {
  requestId: string;
  clientIp?: string | null;
  userAgent?: string | null;
}

/** Onay kaydının kanıt alanları; istek bağlamı yoksa ikisi de null. */
export interface RequestClientInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestStore>();

/** Aktif isteğin kimliği; istek bağlamı dışında (cron/worker) undefined. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Aktif isteği yapan istemci (bkz. `resolveClientIp`); cron/worker'da null'lar. */
export function getRequestClientInfo(): RequestClientInfo {
  const store = storage.getStore();
  return {
    ipAddress: store?.clientIp ?? null,
    userAgent: store?.userAgent ?? null,
  };
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
  storage.run(
    {
      requestId,
      clientIp: resolveClientIp(req),
      userAgent: resolveUserAgent(req),
    },
    () => next(),
  );
}
