import * as request from 'supertest';
import {
  TradeStatus,
  ShipmentStatus,
} from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';

// Helper waits below cover both the DB row creation AND the async surat
// dispatch. Earlier versions only polled the DB, leading to occasional flakes
// when the surat call hadn't landed yet by the time we asserted on the stub.
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import {
  createUser,
  authHeader,
} from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';
import { SuratTrackingService } from '../../src/modules/surat-cargo/surat-tracking.service';

/**
 * Helper: poll until both `to_warehouse` shipments exist, since the
 * inbound dispatch is fire-and-forget post-tx in TradeService. We can't
 * call createInboundTradeShipments synchronously without racing the
 * background invocation (the (tradeId, shipperId, leg) idempotency check
 * sits inside the tx, so two concurrent runs both see "no existing rows"
 * and create duplicates). Polling avoids that race entirely.
 *
 * IMPORTANT: We wait for BOTH the DB row creation AND the carrier stub
 * call counter to settle. The two are dispatched independently in the
 * service (rows first, then surat); waiting only for rows leaves a gap
 * where stub assertions race the dispatcher and intermittently see N-1
 * calls under high load.
 */
async function waitForInboundShipments(
  prisma: ReturnType<typeof getPrisma>,
  tradeId: string,
  expected = 2,
  timeoutMs = 4_000,
  suratCallCount?: () => number,
) {
  const deadline = Date.now() + timeoutMs;
  const fetchRows = () =>
    prisma.tradeShipment.findMany({
      where: { tradeId, leg: 'to_warehouse' },
      orderBy: { trackingNumber: 'asc' },
    });
  let rows = await fetchRows();
  while (
    Date.now() < deadline &&
    (rows.length < expected ||
      (suratCallCount !== undefined && suratCallCount() < expected))
  ) {
    await new Promise((r) => setTimeout(r, 50));
    rows = await fetchRows();
  }
  return rows;
}

/**
 * E2E coverage for the auto-shipping flow added in Task 1 + Task 2:
 *
 * - Trade accept (non-cash) auto-creates two `to_warehouse` TradeShipment
 *   rows with auto-issued OzelKargoTakipNo `TRD-{tradeNumber}-WH-{INI|REC}`.
 * - When both inbound legs are reported `delivered` by the carrier-poll
 *   cron (`syncAllActiveTradeShipments`), the parent trade auto-transitions
 *   from `shipping_to_warehouse` → `at_warehouse`.
 * - The legacy form-driven `POST /trades/:id/ship-to-warehouse` route is
 *   retired and now returns HTTP 410 Gone.
 */
describe('Trade Auto-Shipping (E2E)', () => {
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
    ctx.surat.reset();
  });

  /**
   * Helper: create the standard two-seller + addresses + trade-enabled
   * products fixture used by every test below.
   */
  async function setupBilateralTrade() {
    const initiator = await createUser(ctx.module, { isSeller: true });
    const receiver = await createUser(ctx.module, { isSeller: true });
    await createAddress({ userId: initiator.id });
    await createAddress({ userId: receiver.id });

    const initiatorProduct = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      price: 100,
      quantity: 1,
    });
    const receiverProduct = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      price: 100,
      quantity: 1,
    });

    return { initiator, receiver, initiatorProduct, receiverProduct };
  }

  it('trade accept (non-cash) creates two to_warehouse TradeShipments with auto tracking numbers', async () => {
    const { initiator, receiver, initiatorProduct, receiverProduct } =
      await setupBilateralTrade();

    const created = await request(ctx.app.getHttpServer())
      .post('/api/trades')
      .set(authHeader(initiator))
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: receiverProduct.id, quantity: 1 }],
      })
      .expect(201);
    const tradeId: string = created.body.id;

    await request(ctx.app.getHttpServer())
      .post(`/api/trades/${tradeId}/accept`)
      .set(authHeader(receiver))
      .send({})
      .expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId, 2, 4000, () => ctx.surat.shipmentCalls.length);
    expect(toWarehouse).toHaveLength(2);

    const trackingPattern = /^TRD-[\w-]+-WH-(INI|REC)$/;
    for (const ts of toWarehouse) {
      expect(ts.carrier).toBe('surat');
      expect(ts.trackingNumber).toMatch(trackingPattern);
      expect(ts.status).toBe(ShipmentStatus.label_created);
      expect(ts.leg).toBe('to_warehouse');
      expect(ts.recipientType).toBe('warehouse');
      expect(ts.recipientUserId).toBeNull();
    }

    const suffixes = toWarehouse
      .map((s) => s.trackingNumber!.match(/WH-(INI|REC)$/)?.[1])
      .sort();
    expect(suffixes).toEqual(['INI', 'REC']);

    // Sürat stub must have been called twice — one per leg.
    expect(ctx.surat.shipmentCalls.length).toBe(2);
    const stubRefs = ctx.surat.shipmentCalls
      .map((p) => p.OzelKargoTakipNo)
      .sort();
    expect(stubRefs).toEqual(toWarehouse.map((s) => s.trackingNumber!).sort());
  });

  it('only one to_warehouse leg delivered → trade stays in shipping_to_warehouse', async () => {
    const { initiator, receiver, initiatorProduct, receiverProduct } =
      await setupBilateralTrade();

    const created = await request(ctx.app.getHttpServer())
      .post('/api/trades')
      .set(authHeader(initiator))
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: receiverProduct.id, quantity: 1 }],
      })
      .expect(201);
    const tradeId: string = created.body.id;

    await request(ctx.app.getHttpServer())
      .post(`/api/trades/${tradeId}/accept`)
      .set(authHeader(receiver))
      .send({})
      .expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId, 2, 4000, () => ctx.surat.shipmentCalls.length);
    expect(toWarehouse).toHaveLength(2);

    // Mark only ONE leg delivered.
    await prisma.tradeShipment.update({
      where: { id: toWarehouse[0].id },
      data: {
        status: ShipmentStatus.delivered,
        deliveredAt: new Date(),
      },
    });

    // Invoke the private transition helper directly. It must NOT flip the
    // trade because the second leg is still in `label_created`.
    const surat = ctx.app.get(SuratTrackingService) as any;
    await surat.maybeTransitionTradeToAtWarehouse(tradeId);

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.shipping_to_warehouse);
  });

  it('both to_warehouse legs delivered → trade transitions to at_warehouse', async () => {
    const { initiator, receiver, initiatorProduct, receiverProduct } =
      await setupBilateralTrade();

    const created = await request(ctx.app.getHttpServer())
      .post('/api/trades')
      .set(authHeader(initiator))
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: receiverProduct.id, quantity: 1 }],
      })
      .expect(201);
    const tradeId: string = created.body.id;

    await request(ctx.app.getHttpServer())
      .post(`/api/trades/${tradeId}/accept`)
      .set(authHeader(receiver))
      .send({})
      .expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId, 2, 4000, () => ctx.surat.shipmentCalls.length);
    expect(toWarehouse).toHaveLength(2);

    // Mark BOTH legs delivered (mirrors what the carrier-poll cron does
    // when Sürat reports a delivery code).
    await prisma.tradeShipment.updateMany({
      where: { tradeId, leg: 'to_warehouse' },
      data: {
        status: ShipmentStatus.delivered,
        deliveredAt: new Date(),
      },
    });

    // Invoke the transition helper directly — same code path the cron runs
    // after the second leg flips to delivered.
    const surat = ctx.app.get(SuratTrackingService) as any;
    await surat.maybeTransitionTradeToAtWarehouse(tradeId);

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.at_warehouse);

    // The transition writes an `auto_at_warehouse` event on each leg.
    const events = await prisma.tradeShipmentEvent.findMany({
      where: {
        tradeShipmentId: { in: toWarehouse.map((s) => s.id) },
        status: 'auto_at_warehouse',
      },
    });
    expect(events).toHaveLength(2);
  });

  it('deprecated POST /trades/:id/ship-to-warehouse returns 410 Gone', async () => {
    const { initiator, receiver, initiatorProduct, receiverProduct } =
      await setupBilateralTrade();
    const initiatorShipAddress = await createAddress({
      userId: initiator.id,
      isDefault: false,
    });

    const created = await request(ctx.app.getHttpServer())
      .post('/api/trades')
      .set(authHeader(initiator))
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: receiverProduct.id, quantity: 1 }],
      })
      .expect(201);
    const tradeId: string = created.body.id;

    await request(ctx.app.getHttpServer())
      .post(`/api/trades/${tradeId}/accept`)
      .set(authHeader(receiver))
      .send({})
      .expect(201);

    // Trade is now in shipping_to_warehouse — even so, the deprecated
    // endpoint must reject every caller with 410, regardless of payload.
    await request(ctx.app.getHttpServer())
      .post(`/api/trades/${tradeId}/ship-to-warehouse`)
      .set(authHeader(initiator))
      .send({
        fromAddressId: initiatorShipAddress.id,
        carrier: 'Sürat Kargo',
      })
      .expect(410);
  });
});
