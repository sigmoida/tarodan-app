import { resolveInvoiceProcesses } from "./invoice-process";

/**
 * Admin fatura listesinin "Gerçekleşme Şekli" hücresi, belgenin dayandığı
 * işlemin numaralarını (ORD-/TKS-/RFD-/BST-/MEM-) ve detay bağlantısını
 * gösterir. Sayfa başına TOPLU çözülür: satır sayısı ne olursa olsun kaynak
 * tablo başına tek sorgu — sayfa büyüdükçe sorgu sayısı büyümemeli.
 */

type Tables =
  | "elogoInvoice"
  | "orderPackage"
  | "order"
  | "tradeCashPayment"
  | "refundRequest"
  | "productBoost"
  | "membershipPayment";

function makePrisma(rows: Partial<Record<Tables, unknown[]>> = {}) {
  const table = (name: Tables) => ({
    findMany: jest.fn().mockImplementation(({ where }) => {
      const ids: string[] = where.id.in;
      return Promise.resolve(
        (rows[name] ?? []).filter((row) =>
          ids.includes((row as { id: string }).id),
        ),
      );
    }),
  });
  const prisma = {
    elogoInvoice: table("elogoInvoice"),
    orderPackage: table("orderPackage"),
    order: table("order"),
    tradeCashPayment: table("tradeCashPayment"),
    refundRequest: table("refundRequest"),
    productBoost: table("productBoost"),
    membershipPayment: table("membershipPayment"),
  };
  return {
    prisma,
    client: prisma as unknown as Parameters<typeof resolveInvoiceProcesses>[0],
    queryCount: () =>
      Object.values(prisma).reduce(
        (sum, delegate) => sum + delegate.findMany.mock.calls.length,
        0,
      ),
  };
}

const order = (
  id: string,
  orderNumber: string,
  extra: Partial<{
    origin: string;
    offerId: string | null;
    buyerId: string;
  }> = {},
) => ({
  id,
  orderNumber,
  origin: "direct_sale",
  offerId: null,
  buyerId: "buyer-1",
  ...extra,
});

describe("resolveInvoiceProcesses", () => {
  it("koli anahtarlı ücret belgesi kolideki TÜM siparişleri sırayla listeler", async () => {
    const { client } = makePrisma({
      orderPackage: [
        {
          id: "pkg-1",
          orders: [order("o-1", "ORD-AAA"), order("o-2", "ORD-BBB")],
        },
      ],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "seller_commission", sourceId: "pkg-1" },
    ]);

    expect(result.get("inv-1")).toEqual({
      kind: "order",
      refs: [
        { kind: "order", label: "ORD-AAA", targetId: "o-1" },
        { kind: "order", label: "ORD-BBB", targetId: "o-2" },
      ],
    });
  });

  it("koliden önce kesilmiş eski belge SİPARİŞ anahtarından çözülür", async () => {
    const { client } = makePrisma({ order: [order("o-9", "ORD-OLD")] });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "commission", sourceId: "o-9" },
    ]);

    expect(result.get("inv-1")).toEqual({
      kind: "order",
      refs: [{ kind: "order", label: "ORD-OLD", targetId: "o-9" }],
    });
  });

  it("platform satışı sipariş anahtarlıdır", async () => {
    const { client } = makePrisma({
      order: [order("o-p", "ORD-PLT", { origin: "platform_service" })],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "platform_sale", sourceId: "o-p" },
    ]);

    expect(result.get("inv-1")?.refs).toEqual([
      { kind: "order", label: "ORD-PLT", targetId: "o-p" },
    ]);
  });

  it("teklif kaynaklı siparişte numara ORD kalır, bağlantı TEKLİFE gider", async () => {
    const { client } = makePrisma({
      orderPackage: [
        {
          id: "pkg-1",
          orders: [
            order("o-1", "ORD-OFR", { origin: "offer", offerId: "offer-1" }),
          ],
        },
      ],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "buyer_service_fee", sourceId: "pkg-1" },
    ]);

    expect(result.get("inv-1")).toEqual({
      kind: "offer",
      refs: [{ kind: "offer", label: "ORD-OFR", targetId: "offer-1" }],
    });
  });

  it("teklifi kopmuş teklif siparişi siparişe bağlanır", async () => {
    const { client } = makePrisma({
      order: [order("o-1", "ORD-OFR", { origin: "offer", offerId: null })],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "commission", sourceId: "o-1" },
    ]);

    expect(result.get("inv-1")?.refs).toEqual([
      { kind: "order", label: "ORD-OFR", targetId: "o-1" },
    ]);
  });

  it("takas belgesi takas numarasını ve takasın id'sini taşır", async () => {
    const { client } = makePrisma({
      tradeCashPayment: [
        { id: "tcp-1", tradeId: "trade-1", trade: { tradeNumber: "TKS-AAA" } },
      ],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "trade_shipping", sourceId: "tcp-1" },
    ]);

    expect(result.get("inv-1")).toEqual({
      kind: "trade",
      refs: [{ kind: "trade", label: "TKS-AAA", targetId: "trade-1" }],
    });
  });

  it("ceza belgesi iade talebini ve siparişini gösterir", async () => {
    const { client } = makePrisma({
      refundRequest: [
        {
          id: "rr-1",
          refundNumber: "RFD-AAA",
          order: order("o-1", "ORD-AAA"),
        },
      ],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "penalty", sourceId: "rr-1" },
    ]);

    expect(result.get("inv-1")).toEqual({
      kind: "refund_request",
      refs: [
        { kind: "refund_request", label: "RFD-AAA", targetId: "rr-1" },
        { kind: "order", label: "ORD-AAA", targetId: "o-1" },
      ],
    });
  });

  it("öne çıkarma belgesi BST siparişinin numarasıyla boost satın alımına bağlanır", async () => {
    const { client } = makePrisma({
      productBoost: [{ id: "boost-1", orderId: "o-b" }],
      order: [order("o-b", "BST-AAA")],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "boost", sourceId: "boost-1" },
    ]);

    expect(result.get("inv-1")).toEqual({
      kind: "boost",
      refs: [{ kind: "boost", label: "BST-AAA", targetId: "boost-1" }],
    });
  });

  it("siparişsiz boost numarasız da olsa bağlantısını korur", async () => {
    const { client } = makePrisma({
      productBoost: [{ id: "boost-1", orderId: null }],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "boost", sourceId: "boost-1" },
    ]);

    expect(result.get("inv-1")?.refs).toEqual([
      { kind: "boost", label: null, targetId: "boost-1" },
    ]);
  });

  it("sipariş anahtarlı üyelik belgesi MEM numarasıyla üyenin sayfasına bağlanır", async () => {
    const { client } = makePrisma({
      order: [order("o-m", "MEM-AAA", { buyerId: "member-1" })],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "membership", sourceId: "o-m" },
    ]);

    expect(result.get("inv-1")).toEqual({
      kind: "membership",
      refs: [{ kind: "membership", label: "MEM-AAA", targetId: "member-1" }],
    });
  });

  it("üyelik ÖDEMESİ anahtarlı belge ödemenin siparişinden numara alır", async () => {
    const { client } = makePrisma({
      membershipPayment: [
        { id: "mp-1", orderId: "o-m", membership: { userId: "member-1" } },
      ],
      order: [order("o-m", "MEM-BBB", { buyerId: "member-1" })],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "membership", sourceId: "mp-1" },
    ]);

    expect(result.get("inv-1")?.refs).toEqual([
      { kind: "membership", label: "MEM-BBB", targetId: "member-1" },
    ]);
  });

  it("siparişi olmayan üyelik ödemesi numarasız, üye bağlantısıyla döner", async () => {
    const { client } = makePrisma({
      membershipPayment: [
        { id: "mp-1", orderId: null, membership: { userId: "member-1" } },
      ],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "membership", sourceId: "mp-1" },
    ]);

    expect(result.get("inv-1")?.refs).toEqual([
      { kind: "membership", label: null, targetId: "member-1" },
    ]);
  });

  it("iade faturası ters çevirdiği belgenin işlemini gösterir (kısmi anahtar dahil)", async () => {
    const { client, prisma } = makePrisma({
      elogoInvoice: [
        { id: "inv-0", type: "trade_service_fee", sourceId: "tcp-1" },
      ],
      tradeCashPayment: [
        { id: "tcp-1", tradeId: "trade-1", trade: { tradeNumber: "TKS-AAA" } },
      ],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "ret-1", type: "return_invoice", sourceId: "inv-0:attempt-3" },
    ]);

    expect(result.get("ret-1")?.refs).toEqual([
      { kind: "trade", label: "TKS-AAA", targetId: "trade-1" },
    ]);
    expect(prisma.elogoInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["inv-0"] } } }),
    );
  });

  it("iade faturası yalnız BİR seviye çözülür — iadenin iadesi boş kalır", async () => {
    const { client } = makePrisma({
      elogoInvoice: [
        { id: "ret-0", type: "return_invoice", sourceId: "inv-0" },
      ],
    });

    const result = await resolveInvoiceProcesses(client, [
      { id: "ret-1", type: "return_invoice", sourceId: "ret-0" },
    ]);

    expect(result.get("ret-1")).toBeNull();
  });

  it("kaynağı bulunamayan belge null döner", async () => {
    const { client } = makePrisma();

    const result = await resolveInvoiceProcesses(client, [
      { id: "inv-1", type: "buyer_shipping", sourceId: "missing" },
      { id: "inv-2", type: "penalty", sourceId: "missing" },
    ]);

    expect(result.get("inv-1")).toBeNull();
    expect(result.get("inv-2")).toBeNull();
  });

  it("boş sayfada hiç sorgu atmaz", async () => {
    const { client, queryCount } = makePrisma();

    const result = await resolveInvoiceProcesses(client, []);

    expect(result.size).toBe(0);
    expect(queryCount()).toBe(0);
  });

  it("satır sayısından bağımsız olarak tablo başına EN FAZLA bir sorgu atar", async () => {
    const pages = Array.from({ length: 30 }, (_, i) => i);
    const { client, prisma, queryCount } = makePrisma({
      orderPackage: pages.map((i) => ({
        id: `pkg-${i}`,
        orders: [order(`o-${i}`, `ORD-${i}`)],
      })),
      tradeCashPayment: pages.map((i) => ({
        id: `tcp-${i}`,
        tradeId: `trade-${i}`,
        trade: { tradeNumber: `TKS-${i}` },
      })),
      refundRequest: pages.map((i) => ({
        id: `rr-${i}`,
        refundNumber: `RFD-${i}`,
        order: order(`o-${i}`, `ORD-${i}`),
      })),
      productBoost: pages.map((i) => ({
        id: `boost-${i}`,
        orderId: `ob-${i}`,
      })),
      membershipPayment: pages.map((i) => ({
        id: `mp-${i}`,
        orderId: `om-${i}`,
        membership: { userId: `member-${i}` },
      })),
      order: pages.flatMap((i) => [
        order(`legacy-${i}`, `ORD-L${i}`),
        order(`ob-${i}`, `BST-${i}`),
        order(`om-${i}`, `MEM-${i}`),
      ]),
      elogoInvoice: pages.map((i) => ({
        id: `orig-${i}`,
        type: "seller_commission",
        sourceId: `pkg-${i}`,
      })),
    });
    const invoices = pages.flatMap((i) => [
      {
        id: `a-${i}`,
        type: "seller_commission" as const,
        sourceId: `pkg-${i}`,
      },
      { id: `b-${i}`, type: "commission" as const, sourceId: `legacy-${i}` },
      {
        id: `c-${i}`,
        type: "trade_service_fee" as const,
        sourceId: `tcp-${i}`,
      },
      { id: `d-${i}`, type: "penalty" as const, sourceId: `rr-${i}` },
      { id: `e-${i}`, type: "boost" as const, sourceId: `boost-${i}` },
      { id: `f-${i}`, type: "membership" as const, sourceId: `mp-${i}` },
      {
        id: `g-${i}`,
        type: "return_invoice" as const,
        sourceId: `orig-${i}:attempt`,
      },
    ]);

    const result = await resolveInvoiceProcesses(client, invoices);

    expect(result.size).toBe(invoices.length);
    expect(result.get("b-7")?.refs[0].label).toBe("ORD-L7");
    expect(result.get("e-7")?.refs[0].label).toBe("BST-7");
    expect(result.get("f-7")?.refs[0].label).toBe("MEM-7");
    expect(result.get("g-7")?.refs[0].label).toBe("ORD-7");
    for (const delegate of Object.values(prisma)) {
      expect(delegate.findMany.mock.calls.length).toBeLessThanOrEqual(1);
    }
    expect(queryCount()).toBe(7);
  });
});
