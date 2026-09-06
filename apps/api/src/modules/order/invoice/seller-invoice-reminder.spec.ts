import { OrderStatus } from "@prisma/client";
import { SellerInvoiceService } from "./seller-invoice.service";

/**
 * Ürün faturasını kesmek KURUMSAL SATICININ yükümlülüğüdür; platform yalnızca
 * PDF'i taşır. Yüklenip yüklenmediğini hiçbir şey takip etmiyordu — satıcı
 * unutursa alıcı faturasını hiç almıyor, platform da denetimde kaç siparişte
 * fatura düzenlendiğini bilemiyordu.
 *
 * Tarama iki iş yapar:
 *  - faturasız kalan siparişleri SAYAR (alarm; Tarodan'ın kendi e-Arşivlerindeki
 *    ORDERS_DELIVERED_UNINVOICED alarmının satıcı tarafındaki karşılığı),
 *  - satıcıya sipariş başına TEK hatırlatma gönderir.
 */

function makePrisma(orders: any[]) {
  const store: any = {
    orders,
    order: {
      findMany: jest.fn(async ({ where, take }: any) => {
        const remindedFilter = where.sellerInvoiceReminderAt !== undefined;
        return orders
          .filter((o) => {
            if (!where.status.in.includes(o.status)) return false;
            if (o.sellerUploadedInvoice) return false;
            if (o.seller.businessStatus !== "approved" || !o.seller.taxId)
              return false;
            if (!o.deliveredAt || o.deliveredAt >= where.deliveredAt.lt)
              return false;
            if (remindedFilter && o.sellerInvoiceReminderAt != null)
              return false;
            return true;
          })
          .slice(0, take ?? 100);
      }),
      count: jest.fn(
        async ({ where }: any) =>
          (await store.order.findMany({ where })).length,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const o = orders.find((x) => x.id === where.id);
        Object.assign(o, data);
        return o;
      }),
    },
    emailTemplate: { findUnique: jest.fn(async () => null) },
  };
  return store;
}

const deliveredOrder = (id: string, over: any = {}) => ({
  id,
  orderNumber: `ORD-${id}`,
  status: OrderStatus.delivered,
  deliveredAt: new Date("2026-07-01T00:00:00.000Z"),
  sellerInvoiceReminderAt: null,
  sellerUploadedInvoice: null,
  buyerId: "b1",
  product: { title: "Ürün" },
  seller: {
    id: "s1",
    email: "satici@example.com",
    displayName: "Satıcı",
    companyName: "Satıcı A.Ş.",
    businessStatus: "approved",
    taxId: "1234567890",
  },
  ...over,
});

function makeSmtp() {
  return { sendEmail: jest.fn(async () => undefined) } as any;
}

const NOW = new Date("2026-08-04T00:00:00.000Z");

describe("SellerInvoiceService.remindMissing", () => {
  it("faturasız kalan kurumsal siparişleri sayar", async () => {
    const prisma = makePrisma([deliveredOrder("o1"), deliveredOrder("o2")]);
    const svc = new SellerInvoiceService(prisma as any, {} as any, makeSmtp());

    const result = await svc.remindMissing({ deadlineDays: 7, now: NOW });
    expect(result.missing).toBe(2);
  });

  it("satıcıya hatırlatma gönderir ve siparişi işaretler", async () => {
    const prisma = makePrisma([deliveredOrder("o1")]);
    const smtp = makeSmtp();
    const svc = new SellerInvoiceService(prisma as any, {} as any, smtp);

    const result = await svc.remindMissing({ deadlineDays: 7, now: NOW });

    expect(result.reminded).toBe(1);
    expect(smtp.sendEmail).toHaveBeenCalledTimes(1);
    expect(smtp.sendEmail.mock.calls[0][0].to).toBe("satici@example.com");
    expect(prisma.orders[0].sellerInvoiceReminderAt).toBeInstanceOf(Date);
  });

  it("aynı sipariş için ikinci hatırlatma gitmez", async () => {
    const prisma = makePrisma([
      deliveredOrder("o1", { sellerInvoiceReminderAt: new Date() }),
    ]);
    const smtp = makeSmtp();
    const svc = new SellerInvoiceService(prisma as any, {} as any, smtp);

    const result = await svc.remindMissing({ deadlineDays: 7, now: NOW });

    // Sayımdan düşmez (fatura hâlâ yok) ama tekrar hatırlatılmaz.
    expect(result.missing).toBe(1);
    expect(result.reminded).toBe(0);
    expect(smtp.sendEmail).not.toHaveBeenCalled();
  });

  it("faturası yüklenmiş sipariş kapsam dışıdır", async () => {
    const prisma = makePrisma([
      deliveredOrder("o1", { sellerUploadedInvoice: { id: "inv1" } }),
    ]);
    const svc = new SellerInvoiceService(prisma as any, {} as any, makeSmtp());

    expect(await svc.remindMissing({ deadlineDays: 7, now: NOW })).toEqual({
      missing: 0,
      reminded: 0,
      missingOrders: [],
    });
  });

  it("bireysel satıcı kapsam dışıdır — fatura kesme yükümlülüğü yok", async () => {
    const prisma = makePrisma([
      deliveredOrder("o1", {
        seller: {
          id: "s2",
          email: "birey@example.com",
          displayName: "Birey",
          companyName: null,
          businessStatus: null,
          taxId: null,
        },
      }),
    ]);
    const svc = new SellerInvoiceService(prisma as any, {} as any, makeSmtp());

    expect(
      (await svc.remindMissing({ deadlineDays: 7, now: NOW })).missing,
    ).toBe(0);
  });

  it("teslimden bu yana süre dolmadıysa henüz hatırlatılmaz", async () => {
    const prisma = makePrisma([
      deliveredOrder("o1", {
        deliveredAt: new Date("2026-08-03T00:00:00.000Z"), // 1 gün önce
      }),
    ]);
    const svc = new SellerInvoiceService(prisma as any, {} as any, makeSmtp());

    expect(
      (await svc.remindMissing({ deadlineDays: 7, now: NOW })).missing,
    ).toBe(0);
  });

  it("e-posta patlarsa işaret KONMAZ — sonraki tur yeniden dener", async () => {
    const prisma = makePrisma([deliveredOrder("o1")]);
    const smtp = {
      sendEmail: jest.fn(async () => {
        throw new Error("smtp down");
      }),
    } as any;
    const svc = new SellerInvoiceService(prisma as any, {} as any, smtp);

    const result = await svc.remindMissing({ deadlineDays: 7, now: NOW });

    expect(result.reminded).toBe(0);
    expect(prisma.orders[0].sellerInvoiceReminderAt).toBeNull();
  });

  it("e-postası olmayan satıcı taramayı durdurmaz", async () => {
    const prisma = makePrisma([
      deliveredOrder("o1", {
        seller: {
          id: "s1",
          email: null,
          displayName: "Satıcı",
          companyName: "Satıcı A.Ş.",
          businessStatus: "approved",
          taxId: "1234567890",
        },
      }),
      deliveredOrder("o2"),
    ]);
    const smtp = makeSmtp();
    const svc = new SellerInvoiceService(prisma as any, {} as any, smtp);

    const result = await svc.remindMissing({ deadlineDays: 7, now: NOW });
    expect(result.missing).toBe(2);
    expect(result.reminded).toBe(1);
  });
});

/**
 * Alıcı, ürün faturası için ne bekleyeceğini bilmeli.
 *
 * Bireysel satıcı mükellef olmadığı için ürün faturası HİÇ gelmez; kurumsal
 * satıcıda ise fatura gelecektir ama gecikebilir. İkisi de "fatura yok" olarak
 * göründüğü sürece alıcı bekleyip bekleyemeyeceğini bilemiyordu.
 */
describe("SellerInvoiceService.getForOrder — satıcı fatura keser mi", () => {
  const makeSvc = (seller: any, uploaded: any = null) => {
    const prisma: any = {
      order: {
        findUnique: jest.fn(async () => ({
          sellerId: "s1",
          buyerId: "b1",
          status: OrderStatus.delivered,
          seller,
        })),
      },
      sellerUploadedInvoice: { findUnique: jest.fn(async () => uploaded) },
      user: {
        findUnique: jest.fn(async () => ({ ...seller, membership: null })),
      },
    };
    return new SellerInvoiceService(prisma as any, {} as any, makeSmtp());
  };

  it("kurumsal satıcıda fatura beklenir", async () => {
    const svc = makeSvc({
      businessStatus: "approved",
      taxId: "1234567890",
      companyName: "Satıcı A.Ş.",
    });
    const result = await svc.getForOrder("o1", "b1");
    expect(result.sellerIssuesInvoice).toBe(true);
  });

  it("bireysel satıcıda ürün faturası hiç gelmez", async () => {
    const svc = makeSvc({
      businessStatus: null,
      taxId: null,
      companyName: null,
    });
    const result = await svc.getForOrder("o1", "b1");
    expect(result.sellerIssuesInvoice).toBe(false);
  });

  it("onayı beklemede olan işletme de henüz mükellef sayılmaz", async () => {
    const svc = makeSvc({
      businessStatus: "pending",
      taxId: "1234567890",
      companyName: "Satıcı A.Ş.",
    });
    expect((await svc.getForOrder("o1", "b1")).sellerIssuesInvoice).toBe(false);
  });
});
