import { TradeCommonService } from "./trade-common.service";

/**
 * TAKAS YANITI (v2) — ekranlar İKİ tarafın ödeme kalemini de gösterir.
 *
 * v1'de tek satır vardı ve yanıt onu `cashPayment` olarak düzleştiriyordu. v2'de
 * taraf başına bir satır var; tek satıra indirgenen yanıtla arayüz karşı tarafın
 * ödeme durumunu ("2 ödemeden 1'i tamam") gösteremez. `cashPayment` yalnız eski
 * istemciler (mobil) için korunur.
 */
describe("TradeCommonService — takas yanıtındaki ödeme satırları", () => {
  const service = new TradeCommonService(
    {} as any,
    {} as any,
    {} as any,
  ) as any;

  const row = (over: Record<string, any>) => ({
    id: "tcp-1",
    payerId: "u1",
    recipientId: null,
    amount: "0",
    tradeFeeAmount: "35",
    shippingAmount: "60",
    commission: "0",
    totalAmount: "95",
    status: "pending",
    paidAt: null,
    ...over,
  });

  const trade = (cashPayments: any[]) => ({
    id: "t1",
    tradeNumber: "TKS-10001",
    initiatorId: "u1",
    receiverId: "u2",
    status: "awaiting_payment",
    items: [],
    shipments: [],
    cashPayments,
    responseDeadline: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it("her iki tarafın satırını da kalem kırılımıyla döner", async () => {
    const dto = await service.mapToResponseDto(
      trade([
        row({}),
        row({
          id: "tcp-2",
          payerId: "u2",
          recipientId: "u1",
          amount: "200",
          totalAmount: "295",
          status: "completed",
        }),
      ]),
      "u1",
    );

    expect(dto.cashPayments).toHaveLength(2);
    expect(dto.cashPayments[0]).toMatchObject({
      payerId: "u1",
      amount: 0,
      tradeFeeAmount: 35,
      shippingAmount: 60,
      totalAmount: 95,
      recipientId: null,
    });
    expect(dto.cashPayments[1]).toMatchObject({
      payerId: "u2",
      amount: 200,
      recipientId: "u1",
      status: "completed",
    });
  });

  it("LEGACY cashPayment alanı farkı taşıyan satırı gösterir", async () => {
    const dto = await service.mapToResponseDto(
      trade([
        row({}),
        row({ id: "tcp-2", payerId: "u2", recipientId: "u1", amount: "200" }),
      ]),
      "u1",
    );

    expect(dto.cashPayment.id).toBe("tcp-2");
  });

  it("ödeme satırı yoksa dizi boştur (undefined değil)", async () => {
    const dto = await service.mapToResponseDto(trade([]), "u1");

    expect(dto.cashPayments).toEqual([]);
    expect(dto.cashPayment).toBeUndefined();
  });
});
