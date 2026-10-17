import { ConsentAction, ConsentSource, Prisma } from "@prisma/client";
import {
  CONSENT_DOCUMENTS,
  isConsentDocumentKey,
  type ConsentDocumentKey,
} from "@tarodan/types";

/** Onayın kime ait olduğu — üç kimlikten en az biri dolu olmalı. */
export interface ConsentSubject {
  userId?: string | null;
  visitorId?: string | null;
  guestEmail?: string | null;
}

export interface ConsentEntry {
  document: ConsentDocumentKey;
  source: ConsentSource;
  subject: ConsentSubject;
  /** Varsayılan `granted`. */
  action?: ConsentAction;
  details?: Prisma.InputJsonValue;
  checkoutGroupId?: string | null;
  orderId?: string | null;
}

/**
 * Kayıt girdisini tablo satırına çevirir: sürüm `CONSENT_DOCUMENTS`'ten, kanıt
 * (IP, kullanıcı ajanı) çağıranın verdiğinden damgalanır. Saf ve DI'sızdır:
 * hem `ConsentService` hem seed'ler (istek bağlamı olmayan koşular) aynı satırı
 * üretir.
 */
export function toConsentRow(
  entry: ConsentEntry,
  ipAddress: string | null,
  userAgent: string | null,
): Prisma.ConsentRecordCreateManyInput {
  if (!isConsentDocumentKey(entry.document)) {
    throw new Error(`Unknown consent document: ${String(entry.document)}`);
  }
  const { userId, visitorId, guestEmail } = entry.subject;
  if (!userId && !visitorId && !guestEmail) {
    throw new Error(`Consent record without a subject: ${entry.document}`);
  }
  return {
    document: entry.document,
    version: CONSENT_DOCUMENTS[entry.document].version,
    action: entry.action ?? ConsentAction.granted,
    source: entry.source,
    userId: userId ?? null,
    visitorId: visitorId ?? null,
    guestEmail: guestEmail ? guestEmail.trim().toLowerCase() : null,
    details: entry.details ?? undefined,
    checkoutGroupId: entry.checkoutGroupId ?? null,
    orderId: entry.orderId ?? null,
    ipAddress,
    userAgent,
  };
}
