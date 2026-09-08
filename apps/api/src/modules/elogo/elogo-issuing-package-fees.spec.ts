import { ElogoIssuingService } from "./elogo-issuing.service";
import type { ElogoDocumentService } from "./elogo-document.service";
import type { ElogoDeliveryService } from "./elogo-delivery.service";
import type { PackageFeeDocument } from "./invoice/package-fee-basis";

/**
 * Bir alışverişte HANGİ belgelerin kesildiği.
 *
 * Kural mali: alıcıya üç, satıcıya üç belge — her hizmet kaleminin kendi
 * e-belgesi. Buradaki asıl risk mükerrer beyandır: aynı bedel hem birleşik eski
 * belgede hem kalem bazlı yeni belgede yer alırsa iki kez faturalanmış olur.
 * Bu yüzden nesil seçimi (kalem bazlı / birleşik) tek karar noktasıdır ve
 * testlerin çoğu onu ölçer.
 */

const doc = (
  type: PackageFeeDocument["type"],
  side: PackageFeeDocument["side"],
  net: number,
): PackageFeeDocument => ({
  type,
  side,
  base: net,
  net,
  lines: [{ name: type, quantity: 1, net, unitPrice: net, vatRate: 20 }],
});

/** `ElogoDeliveryService.cut` imzası — casusun tiplenmesi için. */
type CutArgs = [
  type: string,
  sourceId: string,
  recipientUserId: string,
  grossAmount: number,
  opts?: { lineItems?: unknown; guestRecipient?: unknown },
];

const ALL_SIX: PackageFeeDocument[] = [
  doc("buyer_commission", "buyer", 5),
  doc("buyer_service_fee", "buyer", 8),
  doc("buyer_shipping", "buyer", 40),
  doc("seller_commission", "seller", 20),
  doc("seller_platform_fee", "seller", 12),
  doc("seller_shipping", "seller", 10),
];

function makeService(options: {
  documents?: PackageFeeDocument[];
  componentBreakdownComplete?: boolean;
  /** Pakette zaten duran (iptal edilmemiş) belge türleri. */
  existingTypes?: string[];
  sellerType?: string;
}) {
  const cut = jest.fn<Promise<void>, CutArgs>(async () => undefined);
  const existingTypes = options.existingTypes ?? [];
  const prisma = {
    elogoInvoice: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.type.in.some((t: string) => existingTypes.includes(t))
          ? { id: "existing" }
          : null,
      ),
    },
    user: {
      findUnique: jest.fn(async () => ({
        sellerType: options.sellerType ?? "individual",
      })),
    },
  };
  const documents = {
    resolvePackageFeeBasis: jest.fn(async () => ({
      sellerId: "s1",
      buyerId: "b1",
      componentBreakdownComplete: options.componentBreakdownComplete ?? true,
      shippingAddress: null,
      documents: options.documents ?? ALL_SIX,
    })),
  };
  const delivery = { cut };
  const service = new ElogoIssuingService(
    prisma as never,
    documents as unknown as ElogoDocumentService,
    delivery as unknown as ElogoDeliveryService,
  );
  return { service, cut, prisma };
}

/** `cut` çağrılarını (tür, muhatap, matrah) üçlüsüne indirger. */
const cutCalls = (cut: jest.Mock<Promise<void>, CutArgs>) =>
  cut.mock.calls.map((c) => [c[0], c[2], c[3]]);

describe("ElogoIssuingService.issuePackageFeeInvoices", () => {
  it("bir alışverişte alıcıya üç, satıcıya üç belge keser", async () => {
    const { service, cut } = makeService({});

    await service.issuePackageFeeInvoices("pkg1");

    expect(cutCalls(cut)).toEqual([
      ["buyer_commission", "b1", 5],
      ["buyer_service_fee", "b1", 8],
      ["buyer_shipping", "b1", 40],
      ["seller_commission", "s1", 20],
      ["seller_platform_fee", "s1", 12],
      ["seller_shipping", "s1", 10],
    ]);
    // Kalemler kesim anında snapshot'lanır: KDV satır bazında yuvarlanır.
    expect(cut.mock.calls[0][4]?.lineItems).toEqual(ALL_SIX[0].lines);
  });

  it("kesinti kırılımı olmayan pakette ücretler BİRLEŞİK kesilir, kargo yine kalem bazlı", async () => {
    const { service, cut } = makeService({ componentBreakdownComplete: false });
    const legacy = jest
      .spyOn(service, "issueCommissionInvoice")
      .mockResolvedValue(undefined);
    const legacyFee = jest
      .spyOn(service, "issueServiceFeeInvoice")
      .mockResolvedValue(undefined);

    await service.issuePackageFeeInvoices("pkg1");

    expect(legacy).toHaveBeenCalledWith("pkg1");
    expect(legacyFee).toHaveBeenCalledWith("pkg1");
    // Kalem bazlı ücret belgesi YOK — aksi halde aynı bedel iki belgede olurdu.
    expect(cutCalls(cut)).toEqual([
      ["buyer_shipping", "b1", 40],
      ["seller_shipping", "s1", 10],
    ]);
  });

  it("paket daha önce birleşik belgeyle faturalandıysa kalem bazlıya GEÇMEZ", async () => {
    const { service, cut } = makeService({ existingTypes: ["commission"] });
    jest.spyOn(service, "issueCommissionInvoice").mockResolvedValue(undefined);
    jest.spyOn(service, "issueServiceFeeInvoice").mockResolvedValue(undefined);

    await service.issuePackageFeeInvoices("pkg1");

    expect(cutCalls(cut).map((c) => c[0])).toEqual([
      "buyer_shipping",
      "seller_shipping",
    ]);
  });

  it("platform kendi ürününü satıyorsa kesinti belgesi kesilmez", async () => {
    const { service, cut } = makeService({ sellerType: "platform" });

    await service.issuePackageFeeInvoices("pkg1");

    expect(cut).not.toHaveBeenCalled();
  });

  it("bir belge patlasa da diğerleri kesilir ve hata yukarı taşınır", async () => {
    const { service, cut } = makeService({});
    cut.mockImplementation(async (type) => {
      if (type === "buyer_service_fee") throw new Error("eLogo down");
    });

    await expect(service.issuePackageFeeInvoices("pkg1")).rejects.toThrow(
      /eLogo down/,
    );
    // Patlayan belge diğerlerini BLOKLAMAZ: altısı da denenir.
    expect(cut).toHaveBeenCalledTimes(6);
  });

  it("paket çözülemezse hiçbir belge kesilmez", async () => {
    const { service, cut } = makeService({});
    (service as never as { documents: ElogoDocumentService }).documents = {
      resolvePackageFeeBasis: jest.fn(async () => null),
    } as unknown as ElogoDocumentService;

    await service.issuePackageFeeInvoices("pkg1");

    expect(cut).not.toHaveBeenCalled();
  });
});
