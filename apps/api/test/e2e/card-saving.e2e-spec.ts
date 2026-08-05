import * as request from "supertest";
import { SavedCardStatus } from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import { createUser, authHeader } from "../factories/user.factory";
import { createProduct } from "../factories/product.factory";
import { createAddress } from "../factories/address.factory";
import { buyNow } from "../factories/flows";
import { signCallback } from "../mocks/paytr.mock";
import { PaymentService } from "../../src/modules/payment/payment.service";

/**
 * Faz 3 + Faz 5 — CAPI kart saklama (CIT persist) + kullanıcı kart yönetimi.
 *
 * - store_card ödemesinde PayTR bildirimle dönen `utoken` callback'te yakalanır →
 *   capi/list ile kartlar SavedCard'a upsert edilir (PAN/CVV SAKLANMAZ).
 * - GET /membership/cards: yalnız aktif kartları döndürür (maskeli), require_cvv
 *   kartlar autoRenewEligible=false.
 * - DELETE /membership/cards/:id: PayTR capi/delete + yerelde revoke.
 *
 * GERÇEK PayTR çağrısı yok; mock'lu PayTRService ile davranış doğrulanır.
 */
describe("Card saving + management (CAPI, E2E)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });
  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });
  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
    ctx.paytr.reset();
  });

  /**
   * Bir ürün siparişini gerçek akışla satın al → ödeme başlat → callback'i `utoken` ile
   * gönder (store_card ödemesini simüle eder). Callback yolu, yeni utoken-yakalama
   * kablolamasını uçtan uca egzersiz eder. Buyer'ı döndürür.
   */
  async function buyPayWithStoredCard(utoken: string) {
    const prisma = getPrisma();
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 250,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });

    const buyRes = await buyNow(ctx, buyer, product.id, addr.id).expect(201);

    // Direct API form hazırlığı merchant_oid'i atar. Kart PayTR formunda
    // saklandığında callback'teki utoken yerel token kaydını başlatır.
    const directFormRes = await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId: buyRes.body.orderId, saveCard: true })
      .expect(201);

    const payment = await prisma.payment.findUnique({
      where: { id: directFormRes.body.paymentId },
    });

    const callbackRes = await request(ctx.app.getHttpServer())
      .post("/api/payments/callback/paytr")
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: "success",
          totalAmount: Math.round(Number(payment!.amount) * 100),
          utoken,
        }),
      )
      .expect(200);

    if (callbackRes.text !== "OK") {
      throw new Error(
        `Unexpected PayTR callback response: ${callbackRes.text}`,
      );
    }

    return { buyer, seller };
  }

  it("store_card callback (utoken) gelince kartı SavedCard olarak kaydeder (PAN saklamaz)", async () => {
    const utoken = "UT-persist-1";
    ctx.paytr.setStoredCards(utoken, [
      {
        ctoken: "CT-persist-1",
        last4: "4242",
        brand: "VISA",
        month: "12",
        year: "2030",
        requireCvv: false,
      },
    ]);

    const { buyer } = await buyPayWithStoredCard(utoken);

    const prisma = getPrisma();
    const cards = await prisma.savedCard.findMany({
      where: { userId: buyer.id },
    });
    expect(cards.length).toBe(1);
    const c = cards[0];
    expect(c.provider).toBe("paytr");
    expect(c.utoken).toBe(utoken);
    expect(c.ctoken).toBe("CT-persist-1");
    expect(c.last4).toBe("4242");
    expect(c.brand).toBe("VISA");
    expect(c.status).toBe(SavedCardStatus.active);
    expect(c.mandateAcceptedAt).toBeTruthy();
    // PAN/CVV asla saklanmaz — modelde böyle alanlar yok; emniyet için kontrol et.
    expect((c as any).pan).toBeUndefined();
    expect((c as any).cvv).toBeUndefined();
  });

  it("aynı utoken/ctoken ikinci kez senkronlanınca kart çoğaltmaz (idempotent)", async () => {
    const prisma = getPrisma();
    const user = await createUser(ctx.module);
    const utoken = "UT-idem";
    ctx.paytr.setStoredCards(utoken, [
      { ctoken: "CT-idem", last4: "1111", requireCvv: false },
    ]);

    const svc = ctx.app.get(PaymentService);
    await svc.syncSavedCardsFromUtoken(user.id, utoken);
    await svc.syncSavedCardsFromUtoken(user.id, utoken);

    const cards = await prisma.savedCard.findMany({
      where: { userId: user.id },
    });
    expect(cards.length).toBe(1);
  });

  it("GET /membership/cards yalnız aktif kartları döndürür; require_cvv → autoRenewEligible=false; PAN içermez", async () => {
    const prisma = getPrisma();
    const user = await createUser(ctx.module);
    await prisma.savedCard.createMany({
      data: [
        {
          userId: user.id,
          provider: "paytr",
          utoken: "U1",
          ctoken: "A1",
          last4: "1000",
          brand: "VISA",
          requireCvv: false,
          status: SavedCardStatus.active,
        },
        {
          userId: user.id,
          provider: "paytr",
          utoken: "U1",
          ctoken: "A2",
          last4: "2000",
          brand: "MC",
          requireCvv: true,
          status: SavedCardStatus.active,
        },
        {
          userId: user.id,
          provider: "paytr",
          utoken: "U1",
          ctoken: "A3",
          last4: "3000",
          requireCvv: false,
          status: SavedCardStatus.revoked,
        },
      ],
    });

    const res = await request(ctx.app.getHttpServer())
      .get("/api/membership/cards")
      .set(authHeader(user))
      .expect(200);

    const list = res.body as any[];
    expect(list.length).toBe(2); // revoked gizli
    const byLast4 = Object.fromEntries(list.map((c) => [c.last4, c]));
    expect(byLast4["1000"].autoRenewEligible).toBe(true);
    expect(byLast4["2000"].autoRenewEligible).toBe(false); // require_cvv
    // Yanıt maskeli — PAN/CVV/token içermez.
    for (const c of list) {
      expect(c.pan).toBeUndefined();
      expect(c.cvv).toBeUndefined();
      expect(c.utoken).toBeUndefined();
      expect(c.ctoken).toBeUndefined();
    }
  });

  it("DELETE /membership/cards/:id → PayTR capi/delete çağrılır ve kart revoke edilir", async () => {
    const prisma = getPrisma();
    const user = await createUser(ctx.module);
    const utoken = "U-del";
    ctx.paytr.setStoredCards(utoken, [
      { ctoken: "C-del", last4: "9999", requireCvv: false },
    ]);
    const card = await prisma.savedCard.create({
      data: {
        userId: user.id,
        provider: "paytr",
        utoken,
        ctoken: "C-del",
        last4: "9999",
        status: SavedCardStatus.active,
      },
    });

    await request(ctx.app.getHttpServer())
      .delete(`/api/membership/cards/${card.id}`)
      .set(authHeader(user))
      .expect(200);

    expect(ctx.paytr.capiDeleteCalls.length).toBe(1);
    expect(ctx.paytr.capiDeleteCalls[0]).toEqual({ utoken, ctoken: "C-del" });
    const after = await prisma.savedCard.findUnique({ where: { id: card.id } });
    expect(after!.status).toBe(SavedCardStatus.revoked);
  });

  it("PayTR silmeyi onaylamazsa 502 döner ve kart aktif kalır", async () => {
    const prisma = getPrisma();
    const user = await createUser(ctx.module);
    const card = await prisma.savedCard.create({
      data: {
        userId: user.id,
        provider: "paytr",
        utoken: "U-provider-error",
        ctoken: "C-provider-error",
        last4: "4444",
        status: SavedCardStatus.active,
      },
    });
    const deleteSpy = jest
      .spyOn(ctx.paytr, "capiDeleteCard")
      .mockResolvedValueOnce({
        status: "error",
        reason: "provider unavailable",
      });

    try {
      await request(ctx.app.getHttpServer())
        .delete(`/api/membership/cards/${card.id}`)
        .set(authHeader(user))
        .expect(502);
    } finally {
      deleteSpy.mockRestore();
    }

    const after = await prisma.savedCard.findUnique({ where: { id: card.id } });
    expect(after!.status).toBe(SavedCardStatus.active);
  });

  it("DELETE başkasının kartını silemez (404) ve PayTR çağrısı yapmaz", async () => {
    const prisma = getPrisma();
    const owner = await createUser(ctx.module);
    const attacker = await createUser(ctx.module);
    const card = await prisma.savedCard.create({
      data: {
        userId: owner.id,
        provider: "paytr",
        utoken: "U-x",
        ctoken: "C-x",
        last4: "0001",
        status: SavedCardStatus.active,
      },
    });

    await request(ctx.app.getHttpServer())
      .delete(`/api/membership/cards/${card.id}`)
      .set(authHeader(attacker))
      .expect(404);

    expect(ctx.paytr.capiDeleteCalls.length).toBe(0);
    const after = await prisma.savedCard.findUnique({ where: { id: card.id } });
    expect(after!.status).toBe(SavedCardStatus.active); // dokunulmadı
  });
});
