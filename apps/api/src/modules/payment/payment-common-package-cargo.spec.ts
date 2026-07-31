import { PaymentCommonService } from "./payment-common.service";
import { OrderStatus } from "@prisma/client";

/**
 * Faz 2 (a): Satıcı paketi başına TEK Sürat gönderisi. Paketin order'ları tek barkodu/
 * ref'i paylaşır (tek fiziksel koli) ama her order kendi Shipment satırını korur
 * (per-order iade/return). Cancel paket-farkındadır.
 */
describe("PaymentCommonService — paket-konsolide Sürat kargo (Faz 2a)", () => {
  const validAddr = {
    fullName: "Alıcı",
    phone: "+905551112233",
    city: "İstanbul",
    district: "Kadıköy",
    address: "Test cad. 1",
  };

  const makeService = (over: {
    orderUnique?: any;
    packageOrders?: any[];
    orderPackage?: any;
    existingShipment?: any;
  }) => {
    const captured: any = {
      barcodeCall: undefined,
      shipmentCreate: undefined,
      shipmentUpdate: undefined,
      cancelRef: undefined,
      cancelCalled: false,
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(over.orderUnique ?? null),
        findMany: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(where?.packageId ? (over.packageOrders ?? []) : []),
          ),
      },
      orderPackage: {
        // Paketin Sürat referansı ARTIK saklanan koli numarasıdır (türetilmiş
        // min-orderNumber değil) → mock hem billableDesi hem packageNumber verir.
        findUnique: jest.fn().mockResolvedValue(
          over.orderPackage ?? {
            billableDesi: 3,
            packageNumber: "PKG-COLI0001",
          },
        ),
      },
      shipment: {
        findFirst: jest.fn().mockResolvedValue(over.existingShipment ?? null),
        create: jest.fn().mockImplementation((arg: any) => {
          captured.shipmentCreate = arg.data;
          return Promise.resolve({ id: "sh-new" });
        }),
        update: jest.fn().mockImplementation((arg: any) => {
          captured.shipmentUpdate = arg.data;
          return Promise.resolve({});
        }),
      },
    } as any;
    // order.findMany `where.packageId` ile paket-booking ve cancel sibling'leri
    // için kullanılır → mock packageOrders döndürür; cancel testleri sibling'leri
    // packageOrders olarak (id+status) verir. Sürat referansı ise artık
    // orderPackage.packageNumber'dan okunur.
    const cargo = {
      isIntegrationEnabled: () => true,
      createShipmentWithBarcode: jest.fn().mockImplementation((arg: any) => {
        captured.barcodeCall = arg;
        return Promise.resolve({
          ok: true,
          kargoTakipNo: "SURAT-123",
          labelZpl: "ZPL",
        });
      }),
      cancelShipmentByOrderNumber: jest
        .fn()
        .mockImplementation((ref: string) => {
          captured.cancelCalled = true;
          captured.cancelRef = ref;
          return Promise.resolve({ ok: true });
        }),
    } as any;
    const svc = new PaymentCommonService(prisma, cargo);
    return { svc, captured, prisma, cargo };
  };

  it("createSuratBarcodeForOrder: paket başına TEK gönderi (ortak ref + toplam adet + birleşik içerik)", async () => {
    const { svc, captured } = makeService({
      orderUnique: {
        orderNumber: "ORD-2",
        shippingAddress: validAddr,
        packageId: "pkg-1",
        product: { title: "B" },
      },
      packageOrders: [
        {
          orderNumber: "ORD-2",
          quantity: 1,
          shippingAddress: validAddr,
          product: { title: "B" },
        },
        {
          orderNumber: "ORD-1",
          quantity: 2,
          shippingAddress: validAddr,
          product: { title: "A" },
        },
      ],
    });

    const res = await svc.createSuratBarcodeForOrder("o2");

    expect(res).toEqual({ kargoTakipNo: "SURAT-123", labelZpl: "ZPL" });
    // idempotency + ref paket-bazlı; ref = KOLİ NUMARASI (sipariş no değil)
    expect(captured.barcodeCall.idempotencyKey).toBe("surat:package:pkg-1");
    expect(captured.barcodeCall.correlationId).toBe("PKG-COLI0001");
    expect(captured.barcodeCall.payload.OzelKargoTakipNo).toBe("PKG-COLI0001");
    // toplam adet (2+1) + birleşik içerik
    expect(captured.barcodeCall.payload.Adet).toBe(3);
    expect(captured.barcodeCall.payload.BirimDesi).toBe(3);
    expect(captured.barcodeCall.payload.SahisBirim).toContain("A");
    expect(captured.barcodeCall.payload.SahisBirim).toContain("B");
  });

  it("ensureSuratShipmentForOrder: shipment satırı PAKET ref'i (trackingNumber) ile oluşur", async () => {
    const { svc, captured } = makeService({
      orderUnique: {
        id: "o2",
        orderNumber: "ORD-2",
        status: OrderStatus.preparing,
        shippingCost: 30,
        packageId: "pkg-1",
        shippingAddress: validAddr,
        product: { title: "B" },
      },
      packageOrders: [
        {
          orderNumber: "ORD-2",
          quantity: 1,
          shippingAddress: validAddr,
          product: { title: "B" },
        },
        {
          orderNumber: "ORD-1",
          quantity: 2,
          shippingAddress: validAddr,
          product: { title: "A" },
        },
      ],
      existingShipment: null,
    });

    const res = await svc.ensureSuratShipmentForOrder("o2");

    expect(res).toBe("created");
    // trackingNumber = KOLİ numarası, sipariş numarası (ORD-2) DEĞİL
    expect(captured.shipmentCreate.trackingNumber).toBe("PKG-COLI0001");
    expect(captured.shipmentCreate.providerTrackingId).toBe("SURAT-123");
    expect(captured.shipmentCreate.orderId).toBe("o2");
  });

  it("cancel: paketin BİR order'ı iptal, kardeş hâlâ canlı → fiziksel gönderi İPTAL EDİLMEZ (yerel cancel)", async () => {
    const { svc, captured, cargo } = makeService({
      existingShipment: {
        id: "sh1",
        status: "pending",
        trackingNumber: "ORD-1",
      },
      orderUnique: { packageId: "pkg-1" },
      packageOrders: [
        { id: "o1", status: OrderStatus.preparing }, // iptal edilen (self)
        { id: "o2", status: OrderStatus.preparing }, // kardeş HÂLÂ canlı
      ],
    });

    await svc.cancelSuratShipmentIfExists("o1", "ORD-1");

    expect(cargo.cancelShipmentByOrderNumber).not.toHaveBeenCalled();
    expect(captured.shipmentUpdate.status).toBe("cancelled"); // yerel cancel
  });

  it("cancel: TESLİM EDİLMİŞ kargo iptalde EZİLMEZ (Medium D — taşıyıcı gerçeği korunur)", async () => {
    const { svc, captured, cargo } = makeService({
      existingShipment: {
        id: "sh1",
        status: "delivered",
        trackingNumber: "ORD-1",
      },
      orderUnique: { packageId: "pkg-1" },
      packageOrders: [{ id: "o1", status: OrderStatus.cancelled }],
    });

    await svc.cancelSuratShipmentIfExists("o1", "ORD-1");

    // Terminal → fiziksel iptal yok VE yerel status EZİLMEZ (delivered korunur)
    expect(cargo.cancelShipmentByOrderNumber).not.toHaveBeenCalled();
    expect(captured.shipmentUpdate).toBeUndefined();
  });

  it("cancel: paketin TÜM order'ları iptal → fiziksel gönderi PAYLAŞILAN ref ile iptal", async () => {
    const { svc, captured, cargo } = makeService({
      existingShipment: {
        id: "sh1",
        status: "pending",
        trackingNumber: "ORD-1",
      },
      orderUnique: { packageId: "pkg-1" },
      packageOrders: [
        { id: "o1", status: OrderStatus.preparing }, // self (iptal ediliyor)
        { id: "o2", status: OrderStatus.cancelled }, // kardeş zaten iptal
      ],
    });

    await svc.cancelSuratShipmentIfExists("o1", "ORD-1");

    expect(cargo.cancelShipmentByOrderNumber).toHaveBeenCalledTimes(1);
    expect(captured.cancelRef).toBe("ORD-1"); // paylaşılan ref (order-no değil illa)
    expect(captured.shipmentUpdate.status).toBe("cancelled");
  });
});
