import { ConsentAction, ConsentSource, Prisma } from "@prisma/client";
import {
  currentConsentVersion,
  isConsentDocumentKey,
  type ConsentDocumentKey,
  type ConsentVersionContext,
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
  /** The trade cash payment a distance sales consent belongs to. */
  tradeCashPaymentId?: string | null;
}

/**
 * Turns an entry into a table row: the version is the one in force in
 * `versionContext` (`currentConsentVersion`), the evidence (IP, user agent)
 * is what the caller passes. Pure and DI-free: `ConsentService` and the seeds
 * (runs without a request context) build the same row.
 */
export function toConsentRow(
  entry: ConsentEntry,
  ipAddress: string | null,
  userAgent: string | null,
  versionContext: ConsentVersionContext,
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
    version: currentConsentVersion(entry.document, versionContext),
    action: entry.action ?? ConsentAction.granted,
    source: entry.source,
    userId: userId ?? null,
    visitorId: visitorId ?? null,
    guestEmail: guestEmail ? guestEmail.trim().toLowerCase() : null,
    details: entry.details ?? undefined,
    checkoutGroupId: entry.checkoutGroupId ?? null,
    orderId: entry.orderId ?? null,
    tradeCashPaymentId: entry.tradeCashPaymentId ?? null,
    ipAddress,
    userAgent,
  };
}
