/**
 * /dev hook yardımcıları — API E2E için zaman-bazlı/async akış kontrolü.
 *
 * DevController (@Public, yalnız NODE_ENV=test) cron tetikleme, backdate ve
 * generic DB okuma sağlar (apps/api/src/modules/dev/dev.controller.ts).
 * Bu sarmalayıcılar supertest ile o uçlara vurur.
 *
 * NOT: API harness'inde DB okuma için doğrudan `getPrisma()` tercih edilir;
 * burada `devFind`/`devCount` yalnızca web e2e ile imza paritesi için var.
 * Asıl gerekli olanlar cron tetikleme (`runScheduler`) ve `backdate`'tir —
 * çünkü bunlar HTTP hook olmadan (gerçek @Cron beklemeden) çalıştırılamaz.
 */
import * as request from 'supertest';

/** ctx.app gibi getHttpServer() sunan her şey. */
export interface HttpAppLike {
  getHttpServer(): unknown;
}

export type SchedulerName =
  | 'cancel-expired-payments'
  | 'release-expired-reservations'
  | 'release-holds-due'
  | 'reconcile-paytr'
  | 'sweep-out-of-stock'
  | 'expire-offers'
  | 'cancel-expired-trades'
  | 'check-expired-memberships'
  | 'process-auto-renewals';

/** Cron/sweep'i HTTP'den tetikle (zaman-bazlı/async akışlar). */
export async function runScheduler(app: HttpAppLike, name: SchedulerName): Promise<any> {
  const res = await request(app.getHttpServer() as any).post(`/api/dev/run/${name}`);
  if (res.status >= 400) {
    throw new Error(
      `dev run ${name} başarısız (HTTP ${res.status}). DevModule yüklü mü (NODE_ENV=test)?`,
    );
  }
  return res.body ?? {};
}

/** Zaman yolculuğu: bir/çok kaydın tarih alanını geçmişe/ileriye çek (Prisma updateMany). */
export async function backdate(
  app: HttpAppLike,
  model: string,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<{ count: number }> {
  const res = await request(app.getHttpServer() as any)
    .post('/api/dev/backdate')
    .send({ model, where, data });
  if (res.status >= 400) throw new Error(`backdate ${model} başarısız (HTTP ${res.status})`);
  return res.body;
}

/** DB-seviyesi okuma (Prisma findFirst). model camelCase: order, payment, userMembership... */
export async function devFind(
  app: HttpAppLike,
  model: string,
  where: Record<string, unknown>,
  select?: Record<string, unknown>,
  orderBy?: unknown,
): Promise<any> {
  const res = await request(app.getHttpServer() as any)
    .post('/api/dev/find')
    .send({ model, where, select, orderBy });
  if (res.status >= 400) throw new Error(`db find ${model} başarısız (HTTP ${res.status})`);
  return res.body ?? null;
}

export async function devCount(
  app: HttpAppLike,
  model: string,
  where?: Record<string, unknown>,
): Promise<number> {
  const res = await request(app.getHttpServer() as any)
    .post('/api/dev/count')
    .send({ model, where });
  if (res.status >= 400) throw new Error(`db count ${model} başarısız (HTTP ${res.status})`);
  return res.body.count;
}

/** Seed snapshot durumuna geri sar (non-seed kullanıcı/ürün/üyelik temizliği). */
export async function resetState(app: HttpAppLike): Promise<void> {
  await request(app.getHttpServer() as any).post('/api/dev/reset-state');
}
