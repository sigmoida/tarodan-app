import { Prisma, OfferStatus } from '@prisma/client';
import { getPrisma } from '../test-utils/db';

const DEFAULT_EXPIRY_HOURS = 48;

/**
 * Insert an offer row directly. Bypasses controller validation — use only
 * when the test cares about post-create state (e.g. expiry/cancel cron).
 * For full create-flow coverage hit POST /api/offers via supertest.
 */
export async function createOfferRow(opts: {
  productId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  status?: OfferStatus;
  buyerMustAccept?: boolean;
  expiresAt?: Date;
  message?: string | null;
}): Promise<{ id: string }> {
  const prisma = getPrisma();
  const expiresAt =
    opts.expiresAt ??
    new Date(Date.now() + DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000);

  const offer = await prisma.offer.create({
    data: {
      productId: opts.productId,
      buyerId: opts.buyerId,
      sellerId: opts.sellerId,
      amount: new Prisma.Decimal(opts.amount),
      message: opts.message ?? null,
      status: opts.status ?? OfferStatus.pending,
      buyerMustAccept: opts.buyerMustAccept ?? false,
      expiresAt,
    },
  });
  return { id: offer.id };
}
