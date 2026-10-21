import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SYSTEM_GUEST_EMAIL } from "../../invoicing/invoice/guest-recipient";

export interface TrustEligibleUser {
  id: string;
  createdAt: Date;
}

/**
 * Account-side inputs of the seller trust score (ADR 0014,
 * `docs/SELLER_TRUST.md`). Read-only; the batch never writes the `users` row.
 */
@Injectable()
export class UserSellerTrustStatsService {
  /**
   * The accounts among `ids` that get a score: not deleted, not banned, not in
   * the test lane. Every other account is scored by the same rule, the
   * platform account included (decision D5): its membership and boost orders
   * are left out as data (`origin = platform_service`), not by account.
   * Primary-key probes. `createdAt` feeds the tenure component.
   */
  async trustEligibleUsers(
    tx: Prisma.TransactionClient,
    ids: string[],
  ): Promise<TrustEligibleUser[]> {
    if (ids.length === 0) return [];
    return tx.$queryRaw<TrustEligibleUser[]>`
      SELECT u."id", u."created_at" AS "createdAt"
      FROM "users" u
      WHERE u."id" = ANY(${ids}::text[])
        AND u."deleted_at" IS NULL
        AND u."is_banned" = false
        AND u."is_test_account" = false
      ORDER BY u."id"`;
  }

  /**
   * The shared system buyer of guest checkouts, or null when there has never
   * been one. Its orders come from different people, so the volume component
   * counts each guest order as its own counterparty.
   */
  async guestBuyerId(tx: Prisma.TransactionClient): Promise<string | null> {
    const guest = await tx.user.findUnique({
      where: { email: SYSTEM_GUEST_EMAIL },
      select: { id: true },
    });
    return guest?.id ?? null;
  }
}
