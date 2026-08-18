import { PaymentCommonService } from "./payment-common.service";
import { OrderStatus } from "@prisma/client";
import { OrderShipmentProvisioner } from "../surat-cargo/sync/order-shipment-provisioner.service";
import { CarrierCancellationService } from "../surat-cargo/sync/carrier-cancellation.service";

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

  // Gönderici = satıcı. Adresi olmayan satıcıda `createBarcode` fail-closed
  // davranır (gönderi açılmaz), o yüzden fixture'ların ortak varsayılanı budur;
  // bu davranışın kendisi ayrı bir testte ölçülüyor.
  const validSellerAddr = {
    fullName: "Satıcı",
    phone: "+905559876543",
    city: "İstanbul",
    district: "Maltepe",
    address: "Depo cad. 1",
  };
  const defaultSeller = {
    sellerId: "seller-1",
    seller: {
      displayName: "Satıcı",
      email: "satici@example.com",
      addresses: [validSellerAddr],
    },
  };

  const makeService = (over: {
    orderUnique?: any;
    packageOrders?: any[];
    orderPackage?: any;
    existingShipment?: any;
    cargoTrackingCode?: string | null;
  }) => {
    const captured: any = {
      barcodeCall: undefined,
      shipmentCreate: undefined,
      shipmentUpdate: undefined,
      shipmentReviveUpdate: undefined,
      cancelRef: undefined,
      cancelCalled: false,
    };
    const packageState = {
      billableDesi: 3,
      packageNumber: "PKG-COLI0001",
      carrierReference: "PKG-COLI0001",
      ...(over.orderPackage ?? {}),
    };
    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            over.orderUnique ? { ...defaultSeller, ...over.orderUnique } : null,
          ),
        findMany: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(where?.packageId ? (over.packageOrders ?? []) : []),
          ),
      },
      orderPackage: {
        // Paketin Sürat referansı ARTIK saklanan koli numarasıdır (türetilmiş
        // min-orderNumber değil) → mock hem billableDesi hem packageNumber verir.
        findUnique: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ ...packageState })),
        updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
          if (where.carrierReference !== packageState.carrierReference) {
            return Promise.resolve({ count: 0 });
          }
          Object.assign(packageState, data);
          return Promise.resolve({ count: 1 });
        }),
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
        updateMany: jest.fn().mockImplementation((arg: any) => {
          captured.shipmentReviveUpdate = arg.data;
          captured.shipmentUpdate = arg.data;
          return Promise.resolve({ count: 1 });
        }),
      },
      carrierCancellationTask: {
        upsert: jest.fn().mockResolvedValue({ id: "cancel-task-1" }),
      },
    } as any;
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    // order.findMany `where.packageId` ile paket-booking ve cancel sibling'leri
    // için kullanılır → mock packageOrders döndürür; cancel testleri sibling'leri
    // packageOrders olarak (id+status) verir. Sürat referansı ise artık
    // orderPackage.packageNumber'dan okunur.
    const cargo = {
      isEnabled: () => true,
      createShipment: jest.fn().mockImplementation((arg: any) => {
        captured.barcodeCall = arg;
        return Promise.resolve({
          ok: true,
          trackingCode:
            over.cargoTrackingCode === undefined
              ? "SURAT-123"
              : over.cargoTrackingCode,
          labelData: "ZPL",
        });
      }),
      clearLocalShipment: jest.fn().mockImplementation((ref: string) => {
        captured.cancelCalled = true;
        captured.cancelRef = ref;
        return Promise.resolve({ ok: true });
      }),
    } as any;
    const notifications = {
      createInAppNotification: jest.fn().mockResolvedValue(undefined),
    } as any;
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as any;
    const provisioner = new OrderShipmentProvisioner(
      prisma,
      cargo,
      notifications,
      cache,
    );
    const cancellations = new CarrierCancellationService(prisma, cargo);
    const svc = new PaymentCommonService(prisma, cancellations);
    return { svc, provisioner, captured, prisma, cargo, notifications };
  };

  it("OrderShipmentProvisioner: gönderici satıcıdır, alıcı teslimat adresidir", async () => {
    const { provisioner, captured } = makeService({
      orderUnique: {
        orderNumber: "ORD-3",
        shippingAddress: validAddr,
        packageId: null,
        product: { title: "A", shippingDesi: 2 },
      },
    });

    await provisioner.createBarcode("o3");

    // Yön testi: satıcı Maltepe'den gönderir, alıcı Kadıköy'de teslim alır.
    // İki taraf yer değiştirirse koli ters yöne açılır.
    expect(captured.barcodeCall.sender).toMatchObject({
      district: "Maltepe",
      phone: "+905559876543",
    });
    expect(captured.barcodeCall.recipient).toMatchObject({
      district: "Kadıköy",
      phone: "+905551112233",
    });
  });

  describe("satıcının kayıtlı adresi yokken", () => {
    const savedVersion = process.env.SURAT_CREATE_API_VERSION;
    const addresslessSeller = {
      orderUnique: {
        orderNumber: "ORD-4",
        shippingAddress: validAddr,
        packageId: null,
        product: { title: "A", shippingDesi: 2 },
        seller: { displayName: "Satıcı", email: "s@x.com", addresses: [] },
      },
    };

    afterEach(() => {
      if (savedVersion === undefined)
        delete process.env.SURAT_CREATE_API_VERSION;
      else process.env.SURAT_CREATE_API_VERSION = savedVersion;
    });

    it("v2'de gönderi AÇILMAZ ve satıcı bilgilendirilir", async () => {
      process.env.SURAT_CREATE_API_VERSION = "v2";
      const { provisioner, captured, cargo, notifications } =
        makeService(addresslessSeller);

      // Fail-closed: v2 göndericiyi zorunlu tutuyor; uydurma bir çıkış
      // adresiyle koli açmaktansa hiç açma. Satır pending+kodsuz kalır ve
      // barkod retry cron'u adres eklenince tamamlar.
      await expect(provisioner.createBarcode("o4")).resolves.toBeNull();
      expect(cargo.createShipment).not.toHaveBeenCalled();
      expect(captured.barcodeCall).toBeUndefined();
      expect(notifications.createInAppNotification).toHaveBeenCalledWith(
        "seller-1",
        "seller_address_required",
        expect.objectContaining({ orderNumber: "ORD-4" }),
      );
    });

    it("v1'de gönderi normal açılır — gönderici tele hiç çıkmıyor", async () => {
      process.env.SURAT_CREATE_API_VERSION = "v1";
      const { provisioner, captured, cargo, notifications } =
        makeService(addresslessSeller);

      // v1 sözleşmesinde gönderici alanı YOK. Aynı guard'ı burada uygulamak,
      // bugün sorunsuz kargolanan siparişleri (adres tutmayan satıcılar) geçiş
      // yapılmadan durdururdu.
      await expect(provisioner.createBarcode("o4")).resolves.not.toBeNull();
      expect(cargo.createShipment).toHaveBeenCalled();
      expect(captured.barcodeCall.reference).toBeTruthy();
      expect(notifications.createInAppNotification).not.toHaveBeenCalled();
    });
  });

  it("OrderShipmentProvisioner: paket başına TEK gönderi (ortak ref + toplam adet + birleşik içerik)", async () => {
    const { provisioner, captured } = makeService({
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

    const res = await provisioner.createBarcode("o2");

    expect(res).toEqual({ kargoTakipNo: "SURAT-123", labelZpl: "ZPL" });
    // idempotency + ref paket-bazlı; ref = KOLİ NUMARASI (sipariş no değil)
    expect(captured.barcodeCall.idempotencyKey).toBe("surat:package:pkg-1");
    expect(captured.barcodeCall.correlationId).toBe("PKG-COLI0001");
    expect(captured.barcodeCall.reference).toBe("PKG-COLI0001");
    expect(captured.barcodeCall.desi).toBe(3);
    expect(captured.barcodeCall.content).toContain("A");
    expect(captured.barcodeCall.content).toContain("B");
  });

  it("OrderShipmentProvisioner: shipment satırı PAKET ref'i (trackingNumber) ile oluşur", async () => {
    const { provisioner, captured } = makeService({
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

    const res = await provisioner.ensure("o2");

    expect(res).toBe("created");
    // trackingNumber = KOLİ numarası, sipariş numarası (ORD-2) DEĞİL
    expect(captured.shipmentCreate.trackingNumber).toBe("PKG-COLI0001");
    expect(captured.shipmentCreate.providerTrackingId).toBeNull();
    expect(captured.shipmentUpdate.providerTrackingId).toBe("SURAT-123");
    expect(captured.shipmentCreate.orderId).toBe("o2");
    // Gönderi satırı koliye bağlanır → poller/webhook kardeşleri bulabilir.
    expect(captured.shipmentCreate.packageId).toBe("pkg-1");
  });

  it("şube kabulünden önce gerçek kod olmadan gönderiyi label_created yapar", async () => {
    const { provisioner, captured } = makeService({
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
      ],
      existingShipment: null,
      cargoTrackingCode: null,
    });

    await expect(provisioner.ensure("o2")).resolves.toBe("created");
    expect(captured.shipmentUpdate).toEqual(
      expect.objectContaining({
        providerTrackingId: null,
        status: "label_created",
      }),
    );
  });

  it("OrderShipmentProvisioner: iptal sonrası yeni paket ref'i ayırır ve retry kimliğini değiştirir", async () => {
    const { provisioner, captured, prisma } = makeService({
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
      ],
      existingShipment: {
        id: "sh-old",
        status: "cancelled",
        trackingNumber: "PKG-COLI0001",
      },
    });

    const res = await provisioner.ensure("o2");

    expect(res).toBe("revived");
    expect(captured.shipmentReviveUpdate.trackingNumber).toMatch(
      /^PKG-COLI0001-R[A-Z0-9]+$/,
    );
    expect(captured.barcodeCall.correlationId).toBe(
      captured.shipmentReviveUpdate.trackingNumber,
    );
    expect(captured.barcodeCall.idempotencyKey).toContain(
      captured.shipmentReviveUpdate.trackingNumber,
    );
    expect(prisma.orderPackage.updateMany).toHaveBeenCalledTimes(1);
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

    expect(cargo.clearLocalShipment).not.toHaveBeenCalled();
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
    expect(cargo.clearLocalShipment).not.toHaveBeenCalled();
    expect(captured.shipmentUpdate).toBeUndefined();
  });

  it("cancel: paketin TÜM order'ları iptal → fiziksel gönderi PAYLAŞILAN ref ile iptal", async () => {
    const { svc, captured, cargo, prisma } = makeService({
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

    expect(cargo.clearLocalShipment).toHaveBeenCalledTimes(1);
    expect(captured.cancelRef).toBe("ORD-1"); // paylaşılan ref (order-no değil illa)
    expect(captured.shipmentUpdate.status).toBe("cancelled");
    expect(prisma.carrierCancellationTask.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: "surat",
          reference: "ORD-1",
          entityType: "order_shipment",
          entityId: "sh1",
        }),
      }),
    );
  });
});
