import { Injectable } from "@nestjs/common";
import { ConsentAction, ConsentSource } from "@prisma/client";
import type { ConsentDocumentKey } from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { ConsentService, type ConsentWriter } from "./consent.service";

/**
 * The documents a platform service purchase is accepted under: the
 * pre-contract information form with the distance service contract, and the
 * statement that the service starts at once, so the right of withdrawal does
 * not apply. Their versions come from `CONSENT_DOCUMENTS`, like every other
 * consent.
 */
export const PLATFORM_SERVICE_CONSENT_DOCUMENTS = [
  "platform_service_sales",
  "withdrawal_waiver",
] as const satisfies readonly ConsentDocumentKey[];

/** What the buyer ticked in the purchase dialog (one box per document). */
export interface PlatformServiceConsentInput {
  preInformationAccepted?: boolean;
  withdrawalWaiverAccepted?: boolean;
}

/** Both boxes ticked. Anything but `true` (missing, false) is a refusal. */
export function platformServiceConsentsAccepted(
  input: PlatformServiceConsentInput,
): boolean {
  return (
    input.preInformationAccepted === true &&
    input.withdrawalWaiverAccepted === true
  );
}

/** The purchase the consents belong to, and the member who gave them. */
export interface PlatformServiceConsentSubject {
  orderId: string;
  userId: string;
}

/**
 * Consent to a platform service purchase (listing boost; membership can reuse
 * it). Unlike the distance sales consent there is no setting: the only client
 * that buys a platform service (web) sends both statements, so the rule is
 * closed from the start.
 *
 * The consents are recorded with the ORDER, inside the transaction that
 * creates it (`recordForOrder`), so the order never exists without them; the
 * payment step checks them again before the charge (`isRecordedForOrder`).
 */
@Injectable()
export class PlatformServiceConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentService,
  ) {}

  /**
   * Writes one granted row per document, bound to the order, through `db`
   * (the caller's transaction). The caller has checked both statements with
   * `platformServiceConsentsAccepted`. Version, IP and user agent are stamped
   * by `ConsentService`.
   */
  async recordForOrder(
    db: ConsentWriter,
    subject: PlatformServiceConsentSubject,
  ): Promise<void> {
    await this.consents.record(
      PLATFORM_SERVICE_CONSENT_DOCUMENTS.map((document) => ({
        document,
        source: ConsentSource.checkout,
        subject: { userId: subject.userId },
        orderId: subject.orderId,
      })),
      db,
    );
  }

  /**
   * Whether the order carries a granted row of every document (any version:
   * the buyer accepted the text that was current when the order was made).
   */
  async isRecordedForOrder(orderId: string): Promise<boolean> {
    const rows = await this.prisma.consentRecord.findMany({
      where: {
        orderId,
        document: { in: [...PLATFORM_SERVICE_CONSENT_DOCUMENTS] },
        action: ConsentAction.granted,
      },
      select: { document: true },
    });
    const recorded = new Set(rows.map((row) => row.document));
    return PLATFORM_SERVICE_CONSENT_DOCUMENTS.every((document) =>
      recorded.has(document),
    );
  }
}
