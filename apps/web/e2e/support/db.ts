/**
 * DB-seviyesi yardımcılar — API'deki KORUMALI /dev hook'ları üzerinden (NODE_ENV=test).
 * Web paketine @prisma/client bağımlılığı eklemeden DB assertion + zaman yolculuğu +
 * cron/sweep tetikleme sağlar. (Bkz. apps/api/src/modules/dev/dev.controller.ts)
 */
import { APIRequestContext, expect } from '@playwright/test';
import { API } from './helpers';

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
export async function runScheduler(request: APIRequestContext, name: SchedulerName): Promise<any> {
  const res = await request.post(`${API}/dev/run/${name}`);
  expect(res.ok(), `dev run ${name} (NODE_ENV=test + DevModule yüklü mü?)`).toBeTruthy();
  // Scheduler'lar çoğunlukla void döner → boş gövde; res.json() patlamasın (Unexpected end of JSON input).
  return res.json().catch(() => ({}));
}

/** Zaman yolculuğu: bir/çok kaydın tarih alanını geçmişe/ileriye çek. */
export async function backdate(
  request: APIRequestContext,
  model: string,
  where: Record<string, any>,
  data: Record<string, any>,
): Promise<{ count: number }> {
  const res = await request.post(`${API}/dev/backdate`, { data: { model, where, data } });
  expect(res.ok(), `backdate ${model}`).toBeTruthy();
  return res.json();
}

/** DB-seviyesi assertion: tek kayıt (Prisma findFirst). model = camelCase (order, payment, userMembership...). */
export async function dbFind(
  request: APIRequestContext,
  model: string,
  where: Record<string, any>,
  select?: Record<string, any>,
  orderBy?: any,
): Promise<any> {
  const res = await request.post(`${API}/dev/find`, { data: { model, where, select, orderBy } });
  expect(res.ok(), `db find ${model}`).toBeTruthy();
  // Kayıt yoksa Nest boş gövde döndürür → res.json() patlamasın (Unexpected end of JSON input) → null.
  return res.json().catch(() => null);
}

export async function dbCount(
  request: APIRequestContext,
  model: string,
  where?: Record<string, any>,
): Promise<number> {
  const res = await request.post(`${API}/dev/count`, { data: { model, where } });
  expect(res.ok(), `db count ${model}`).toBeTruthy();
  return (await res.json()).count;
}

/** Bir alanın belirli değere ulaşmasını bekle (cron/async sonrası). */
export async function expectDbEventually(
  request: APIRequestContext,
  model: string,
  where: Record<string, any>,
  predicate: (row: any) => boolean,
  timeoutMs = 8000,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await dbFind(request, model, where);
    if (last && predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`expectDbEventually(${model}) sağlanmadı. son kayıt: ${JSON.stringify(last)}`);
}
