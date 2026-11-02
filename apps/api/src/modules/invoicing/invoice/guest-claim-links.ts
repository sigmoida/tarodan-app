import type { Prisma } from "@prisma/client";
import { invoiceTypesOfSourceKind } from "./invoice-source";

export interface GuestInvoiceLinkReassignment {
  /** The shared system guest user (`SYSTEM_GUEST_EMAIL`). */
  guestUserId: string;
  /** The account that proved the guest e-mail. */
  userId: string;
  /** Claimed orders and the packages that are now wholly the account's. */
  packageOrOrderIds: string[];
  /** Refund requests of the claimed orders (penalty documents key on them). */
  refundRequestIds: string[];
}

export interface GuestInvoiceLinkResult {
  recipientLinks: number;
  buyerLinks: number;
}

const NOTHING: GuestInvoiceLinkResult = { recipientLinks: 0, buyerLinks: 0 };

/**
 * Guest order claim (decision D3 of the 2026-11-02 guest claim plan): the
 * fiscal documents of a claimed guest order point their `recipientUserId`
 * and `buyerUserId` links at the system guest. They move to the account, so
 * "My invoices" (`recipientUserId`) and the admin buyer column see the real
 * buyer. Only those two links change, and only where they still equal the
 * guest (a repeat moves nothing); the document and its recipient snapshot
 * (name, e-mail, address, number, ETTN) are never touched.
 *
 * The source of a document is resolved by its type (`invoice-source.ts`):
 * package or order documents by the claimed ids, penalty documents by the
 * refund request ids, and return invoices by the document they reverse
 * (`<invoiceId>` or `<invoiceId>:<refundAttemptId>`).
 */
export async function reassignGuestInvoiceLinks(
  tx: Pick<Prisma.TransactionClient, "fiscalInvoice">,
  input: GuestInvoiceLinkReassignment,
): Promise<GuestInvoiceLinkResult> {
  const bySource: Prisma.FiscalInvoiceWhereInput[] = [];
  if (input.packageOrOrderIds.length > 0) {
    bySource.push({
      type: { in: invoiceTypesOfSourceKind("package_or_order") },
      sourceId: { in: input.packageOrOrderIds },
    });
  }
  if (input.refundRequestIds.length > 0) {
    bySource.push({
      type: { in: invoiceTypesOfSourceKind("refund_request") },
      sourceId: { in: input.refundRequestIds },
    });
  }
  if (bySource.length === 0) return NOTHING;

  const documents = await tx.fiscalInvoice.findMany({
    where: { OR: bySource },
    select: { id: true },
  });
  if (documents.length === 0) return NOTHING;
  const documentIds = documents.map((d) => d.id);

  const reversals = await tx.fiscalInvoice.findMany({
    where: {
      type: { in: invoiceTypesOfSourceKind("reversed_invoice") },
      OR: documentIds.flatMap((id) => [
        { sourceId: id },
        { sourceId: { startsWith: `${id}:` } },
      ]),
    },
    select: { id: true },
  });
  const ids = [...documentIds, ...reversals.map((r) => r.id)];

  const recipient = await tx.fiscalInvoice.updateMany({
    where: { id: { in: ids }, recipientUserId: input.guestUserId },
    data: { recipientUserId: input.userId },
  });
  const buyer = await tx.fiscalInvoice.updateMany({
    where: { id: { in: ids }, buyerUserId: input.guestUserId },
    data: { buyerUserId: input.userId },
  });
  return { recipientLinks: recipient.count, buyerLinks: buyer.count };
}
