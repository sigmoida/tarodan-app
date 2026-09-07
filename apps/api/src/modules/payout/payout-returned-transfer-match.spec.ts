import { PayoutStatus } from "@prisma/client";
import { PayoutService } from "./payout.service";
import type { PaytrReturnedTransfer } from "../payment-providers/paytr/paytr-transfer.service";

/**
 * PayTR geri dönen transfer listesi bizim trans_id'mizi vermez; yalnız PayTR'nin
 * ref_no'su (talimat yanıtındaki `reference`) gelir. Eski kod `returned.trans_id`
 * ile aradığı için hiçbir satır eşleşmiyor ve hata yutuluyordu: bankadan dönen
 * havale sistemde sonsuza dek "completed" görünüyordu.
 */
const VALID_IBAN = "TR330006100519786457841326";

const row = (
  o: Partial<PaytrReturnedTransfer> = {},
): PaytrReturnedTransfer => ({
  refNo: "PAYTRREF1",
  dateDetected: "2026-08-03",
  dateReimbursed: "2026-08-02",
  transferName: "Seller",
  transferIban: VALID_IBAN,
  transferAmount: 90,
  transferCurrency: "TL",
  transferDate: "2026-08-01",
  raw: { ref_no: "PAYTRREF1" },
  ...o,
});

function build(payouts: any[], rows: PaytrReturnedTransfer[]) {
  const updates: any[] = [];
  const prisma = {
    payoutTransfer: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            payouts.find(
              (p) =>
                p.providerReference === where.providerReference &&
                where.status.in.includes(p.status),
            ) ?? null,
          ),
        ),
      findMany: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            payouts.filter(
              (p) =>
                p.providerReference == null &&
                p.transferIban === where.transferIban &&
                where.status.in.includes(p.status),
            ),
          ),
        ),
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        const p = payouts.find((x) => x.id === where.id);
        if (!p || !where.status.in.includes(p.status)) {
          return Promise.resolve({ count: 0 });
        }
        updates.push({ id: p.id, data });
        Object.assign(p, data);
        return Promise.resolve({ count: 1 });
      }),
    },
    sellerBankAccount: {
      findUnique: jest.fn().mockResolvedValue({
        userId: "seller-1",
        iban: VALID_IBAN,
        isVerified: true,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ displayName: "S" }) },
  };
  const notification = { sendTemplateEmailToUser: jest.fn() };
  const getReturnedTransfers = jest.fn().mockResolvedValue(rows);
  const service = new PayoutService(
    prisma as any,
    { resolve: () => ({ getReturnedTransfers }) } as any,
    { get: jest.fn().mockReturnValue(undefined) } as any,
    notification as any,
  );
  return { service, prisma, updates, notification, getReturnedTransfers };
}

const payout = (o: Record<string, unknown> = {}) => ({
  id: "p1",
  sellerId: "seller-1",
  transId: "PYTK7X9M2QF3N",
  netAmount: 90,
  submittedAmount: 90,
  submittedAt: new Date("2026-08-01T07:00:00Z"),
  transferIban: VALID_IBAN,
  status: PayoutStatus.completed,
  providerReference: "PAYTRREF1",
  providerResponse: { status: "success", reference: "PAYTRREF1" },
  ...o,
});

describe("PayoutService.checkReturnedTransfers — ref_no ile eşleme", () => {
  it("matches by providerReference, keeps the instruction response and emails without a reason", async () => {
    const { service, updates, notification } = build([payout()], [row()]);

    const result = await service.checkReturnedTransfers();

    expect(result).toEqual({ returned: 1, unmatched: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0].data.status).toBe(PayoutStatus.returned);
    expect(updates[0].data.failureReason).toContain("PAYTRREF1");
    // Talimat yanıtı (reference) silinmez; dönüş satırı yanına eklenir.
    expect(updates[0].data.providerResponse).toEqual({
      status: "success",
      reference: "PAYTRREF1",
      returned: { ref_no: "PAYTRREF1" },
    });
    expect(notification.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "payout-returned-seller",
      expect.not.objectContaining({ failureReason: expect.anything() }),
    );
  });

  it("falls back to IBAN + amount for rows submitted before the reference was stored", async () => {
    const legacy = payout({ providerReference: null, providerResponse: null });
    const { service, updates } = build([legacy], [row({ refNo: "OLDREF" })]);

    const result = await service.checkReturnedTransfers();

    expect(result).toEqual({ returned: 1, unmatched: 0 });
    expect(updates[0].data.providerReference).toBe("OLDREF");
    expect(updates[0].data.providerResponse).toEqual({
      returned: { ref_no: "PAYTRREF1" },
    });
  });

  it("leaves an ambiguous row untouched when several legacy payouts fit", async () => {
    const a = payout({ id: "a", providerReference: null });
    const b = payout({ id: "b", providerReference: null });
    const { service, updates, notification } = build(
      [a, b],
      [row({ refNo: "OLDREF" })],
    );

    const result = await service.checkReturnedTransfers();

    expect(result).toEqual({ returned: 0, unmatched: 1 });
    expect(updates).toHaveLength(0);
    expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
  });

  it("does not re-mark a payout that was already returned or re-queued", async () => {
    const { service, updates } = build(
      [payout({ status: PayoutStatus.pending })],
      [row()],
    );

    const result = await service.checkReturnedTransfers();

    expect(result).toEqual({ returned: 0, unmatched: 1 });
    expect(updates).toHaveLength(0);
  });

  it("sends the window to PayTR in Istanbul wall-clock format", async () => {
    const { service, getReturnedTransfers } = build([], []);

    await service.checkReturnedTransfers();

    const args = getReturnedTransfers.mock.calls[0][0];
    expect(args.startDate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(args.endDate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("lets a provider error surface so the cron fails loudly", async () => {
    const { service, getReturnedTransfers } = build([], []);
    getReturnedTransfers.mockRejectedValueOnce(new Error("paytr down"));

    await expect(service.checkReturnedTransfers()).rejects.toThrow(
      "paytr down",
    );
  });
});
