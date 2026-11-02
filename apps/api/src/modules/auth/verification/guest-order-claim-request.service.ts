import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../../../prisma";
import { errorMessage } from "../../../common/helpers/error-message";
import { OutboxService } from "../../outbox/outbox.service";
import {
  OUTBOX_GUEST_ORDER_CLAIM,
  guestOrderClaimDedupeKey,
  type GuestOrderClaimPayload,
} from "../../outbox/outbox.types";

/**
 * Asks the order domain to claim the guest orders of an account whose e-mail
 * just became verified (the guest order claim plan of 2026-11-02, D1).
 *
 * Every site that sets `isEmailVerified = true` calls `request` inside that
 * transaction and `flush` after it commits: the verification link, corporate
 * invitation activation, social sign-up, the social take-over and
 * legacy-link heal, the e-mail change confirmation and admin "verify e-mail".
 * Test-lane and staff account creation do not.
 *
 * Auth never imports the order module (it would be a cycle): the claim is an
 * outbox event whose handler (`OrderGuestClaimService`) the order module
 * registers. `flush` runs it inline so the buyer sees the orders in the
 * first session; if that fails the row stays pending and the drainer retries
 * it, so a claim is never lost and never fails the caller.
 */
@Injectable()
export class GuestOrderClaimRequestService {
  private readonly logger = new Logger(GuestOrderClaimRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /** In the transaction that verifies the e-mail; returns the row's key. */
  async request(tx: Prisma.TransactionClient, userId: string): Promise<string> {
    const dedupeKey = guestOrderClaimDedupeKey(userId, randomUUID());
    await this.outbox.enqueue(tx, {
      type: OUTBOX_GUEST_ORDER_CLAIM,
      payload: { userId } satisfies GuestOrderClaimPayload,
      dedupeKey,
    });
    return dedupeKey;
  }

  /** After commit: the inline run. Never throws; the drainer is the backstop. */
  async flush(dedupeKey: string): Promise<void> {
    try {
      await this.outbox.runPendingInline(this.prisma, dedupeKey);
    } catch (error: unknown) {
      // The key holds the user id, never the e-mail.
      this.logger.warn(
        `Guest order claim deferred to the outbox (${dedupeKey}): ${errorMessage(error)}`,
      );
    }
  }
}
