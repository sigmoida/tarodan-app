import { ElogoIssuingService } from "./elogo-issuing.service";
import type { ElogoDocumentService } from "./elogo-document.service";
import type { ElogoDeliveryService } from "./elogo-delivery.service";

/**
 * Ceza faturasının KESİMİ — matrah hesabı penalty-basis.spec'te; burada
 * belgenin doğru muhataba, doğru referansla ve doğru açıklamayla gittiği
 * ölçülür. Muhatap yanlışsa ceza kusursuz tarafa kesilmiş olur.
 */

type CutArgs = [
  type: string,
  sourceId: string,
  recipientUserId: string,
  grossAmount: number,
  opts?: {
    lineItems?: unknown;
    lineDescription?: string;
    sourceReference?: string;
    guestRecipient?: unknown;
  },
];

const SHIPPING_ADDRESS = {
  guestName: "Ayşe Yılmaz",
  guestEmail: "ayse@example.com",
  city: "İzmir",
};

function makeService(options: {
  faultParty?: string | null;
  components?: Array<{
    componentCode: string;
    treatment: string;
    netAmount: number;
  }>;
  resolvedReason?: string | null;
  sellerShipping?: number;
  sellerType?: string;
  request?: unknown;
}) {
  const cut = jest.fn<Promise<void>, CutArgs>(async () => undefined);
  const request =
    options.request === undefined
      ? {
          faultParty: options.faultParty ?? "seller",
          resolvedReason: options.resolvedReason ?? "damaged",
          financialComponents: options.components ?? [
            {
              componentCode: "outbound_shipping",
              treatment: "seller_charge",
              netAmount: 120,
            },
            {
              componentCode: "return_shipping",
              treatment: "seller_charge",
              netAmount: 120,
            },
          ],
          order: {
            packageId: "pkg1",
            buyerId: "b1",
            sellerId: "s1",
            serviceVatRate: 20,
            shippingAddress: SHIPPING_ADDRESS,
          },
        }
      : options.request;

  const prisma = {
    refundRequest: { findUnique: jest.fn(async () => request) },
    order: {
      findMany: jest.fn(async () => [
        { sellerShippingAmount: options.sellerShipping ?? 60 },
      ]),
    },
    orderPackage: {
      findUnique: jest.fn(async () => ({ packageNumber: "PKG-K7X9M2QF3N" })),
    },
    user: {
      findUnique: jest.fn(async () => ({
        sellerType: options.sellerType ?? "individual",
      })),
    },
  };
  const service = new ElogoIssuingService(
    prisma as never,
    {} as unknown as ElogoDocumentService,
    { cut } as unknown as ElogoDeliveryService,
  );
  return { service, cut };
}

describe("ElogoIssuingService.issuePenaltyInvoice", () => {
  it("satıcı kusurunda farkı SATICIYA, koli koduyla faturalar", async () => {
    const { service, cut } = makeService({});

    await service.issuePenaltyInvoice("rr1");

    // 120 gidiş − 60 zaten faturalanmış + 120 iade kargosu = 180.
    expect(cut).toHaveBeenCalledTimes(1);
    const [type, sourceId, recipient, amount, opts] = cut.mock.calls[0];
    expect([type, sourceId, recipient, amount]).toEqual([
      "penalty",
      "rr1",
      "s1",
      180,
    ]);
    // Kayıt no koli kodunun gövdesinden türer; kargo takip numarası mali
    // belgenin üstünde durmaz.
    expect(opts?.sourceReference).toBe("KYT-K7X9M2QF3N");
    // Açıklama iade nedenini taşır — belge neye istinaden kesildi.
    expect(opts?.lineDescription).toBe("Ceza bedeli (kargo) — Hasarlı");
    // Satıcı tarafında misafir alıcı kimliği anlamsızdır.
    expect(opts?.guestRecipient).toBeNull();
  });

  it("alıcı kusurunda ALICIYA keser ve misafir kimliğini taşır", async () => {
    const { service, cut } = makeService({
      faultParty: "buyer",
      resolvedReason: "buyer_damaged",
      components: [
        {
          componentCode: "outbound_shipping",
          treatment: "buyer_charge",
          netAmount: 60,
        },
        {
          componentCode: "return_shipping",
          treatment: "buyer_charge",
          netAmount: 120,
        },
      ],
    });

    await service.issuePenaltyInvoice("rr2");

    const [, , recipient, amount, opts] = cut.mock.calls[0];
    expect([recipient, amount]).toEqual(["b1", 180]);
    expect(opts?.guestRecipient).toMatchObject({
      name: "Ayşe Yılmaz",
      email: "ayse@example.com",
    });
  });

  it("kusur kargodaysa belge kesilmez", async () => {
    const { service, cut } = makeService({
      faultParty: "carrier",
      components: [
        {
          componentCode: "return_shipping",
          treatment: "platform_absorb",
          netAmount: 120,
        },
      ],
    });

    await service.issuePenaltyInvoice("rr3");

    expect(cut).not.toHaveBeenCalled();
  });

  it("platform kendi ürününü satıyorsa ceza kendine kesilmez", async () => {
    const { service, cut } = makeService({ sellerType: "platform" });
    await service.issuePenaltyInvoice("rr4");
    expect(cut).not.toHaveBeenCalled();
  });

  it("talep ya da siparişi çözülemezse hiçbir şey yapmaz", async () => {
    for (const request of [null, { faultParty: "seller", order: null }]) {
      const { service, cut } = makeService({ request });
      await service.issuePenaltyInvoice("rr5");
      expect(cut).not.toHaveBeenCalled();
    }
  });
});
