import {
  SubscriptionStatus,
  SavedCardStatus,
  PaymentStatus,
  MembershipTierType,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../test-utils/db';
import { createUser } from '../factories/user.factory';
import { MembershipService } from '../../src/modules/membership/membership.service';

/**
 * Faz 4/5 — Kullanıcısız oto-yenileme (PayTR CAPI recurring) + dunning.
 * Mock'lu PayTR (MockPayTRService.chargeRecurring) ile davranış doğrulanır.
 * GERÇEK PayTR çağrısı yok; canlı doğrulama Non3D yetkisi gelince yapılır.
 */
describe('Recurring auto-renewal (CAPI, E2E)', () => {
  let ctx: E2ETestApp;

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });
  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
    ctx.paytr.reset();
    jest.restoreAllMocks();
  });

  /** PAYTR_RECURRING_ENABLED flag'ini deterministik kontrol et. */
  function setFlag(enabled: boolean): void {
    const cfg = ctx.app.get(ConfigService);
    const real = cfg.get.bind(cfg);
    jest
      .spyOn(cfg, 'get')
      .mockImplementation((key: any, def?: any) =>
        key === 'PAYTR_RECURRING_ENABLED' ? (enabled ? 'true' : 'false') : real(key, def),
      );
  }

  /** Yenilemeye hazır (süresi dolmuş) ücretli üyelik + kayıtlı kart seed'le. */
  async function seedDueMembership(opts: { requireCvv?: boolean } = {}) {
    const prisma = getPrisma();
    const user = await createUser(ctx.module);
    const tier = await prisma.membershipTier.findFirst({
      where: { type: MembershipTierType.basic },
    });
    const start = new Date(Date.now() - 31 * 86_400_000); // ~1 ay önce → monthly
    const end = new Date(Date.now() - 86_400_000); // dün doldu
    const m = await prisma.userMembership.create({
      data: {
        userId: user.id,
        tierId: tier!.id,
        status: SubscriptionStatus.active,
        autoRenew: true,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });
    const card = await prisma.savedCard.create({
      data: {
        userId: user.id,
        provider: 'paytr',
        utoken: `UT-${user.id.slice(0, 8)}`,
        ctoken: `CT-${user.id.slice(0, 8)}`,
        last4: '4358',
        brand: 'VISA',
        status: SavedCardStatus.active,
        requireCvv: opts.requireCvv ?? false,
      },
    });
    return { user, tier, m, card };
  }

  it('flag kapalıyken hiçbir çekim yapmaz (no-op)', async () => {
    setFlag(false);
    await seedDueMembership();
    const res = await ctx.app.get(MembershipService).runAutoRenewals();
    expect(res.attempted).toBe(0);
    expect(ctx.paytr.recurringCalls.length).toBe(0);
  });

  it('başarılı çekimde üyeliği yeniler ve dönemi ileriye uzatır', async () => {
    setFlag(true);
    const { m, tier } = await seedDueMembership();
    ctx.paytr.nextRecurringResult = { status: 'success' };

    const res = await ctx.app.get(MembershipService).runAutoRenewals();

    expect(res.renewed).toBe(1);
    expect(ctx.paytr.recurringCalls.length).toBe(1);
    const prisma = getPrisma();
    const after = await prisma.userMembership.findUnique({ where: { id: m.id } });
    expect(after!.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
    expect(after!.status).toBe(SubscriptionStatus.active);
    const mp = await prisma.membershipPayment.findFirst({
      where: { membershipId: m.id, status: PaymentStatus.completed },
    });
    expect(mp).toBeTruthy();
    expect(Number(mp!.amount)).toBe(Number(tier!.monthlyPrice));
  });

  it('kalıcı başarısızlıkta (try_again=false) kartı revoke eder', async () => {
    setFlag(true);
    const { card } = await seedDueMembership();
    ctx.paytr.nextRecurringResult = { status: 'failed', reason: 'Kart kapalı', tryAgain: false };

    const res = await ctx.app.get(MembershipService).runAutoRenewals();

    expect(res.failed).toBe(1);
    const prisma = getPrisma();
    const c = await prisma.savedCard.findUnique({ where: { id: card.id } });
    expect(c!.status).toBe(SavedCardStatus.revoked);
  });

  it('geçici başarısızlıkta (try_again=true) kartı aktif bırakır', async () => {
    setFlag(true);
    const { card } = await seedDueMembership();
    ctx.paytr.nextRecurringResult = { status: 'failed', reason: 'geçici', tryAgain: true };

    await ctx.app.get(MembershipService).runAutoRenewals();

    const prisma = getPrisma();
    const c = await prisma.savedCard.findUnique({ where: { id: card.id } });
    expect(c!.status).toBe(SavedCardStatus.active);
  });

  it('CVV gerektiren kartı atlar (kullanıcısız çekilemez)', async () => {
    setFlag(true);
    await seedDueMembership({ requireCvv: true });
    const res = await ctx.app.get(MembershipService).runAutoRenewals();
    expect(res.attempted).toBe(0);
    expect(ctx.paytr.recurringCalls.length).toBe(0);
  });
});
