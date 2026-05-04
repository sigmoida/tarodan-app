/**
 * Time helpers for E2E tests.
 *
 * IMPORTANT: We do NOT use jest.useFakeTimers() because the pg driver,
 * NestJS scheduler, and BullMQ all rely on real setTimeout/setInterval.
 * Faking those causes DB connections to hang and microtasks to deadlock.
 *
 * Instead we only fake Date.now() and the Date constructor via spies.
 * Cron methods are invoked manually in tests (`app.get(SchedulerService).method()`)
 * — we never wait on the @Cron decorator to fire.
 */

let baseNow = Date.now();
let dateNowSpy: jest.SpyInstance | null = null;
let dateCtorSpy: jest.SpyInstance | null = null;
const RealDate = Date;

export function useFakeClock(initial: Date | string | number = '2026-01-01T00:00:00.000Z'): void {
  baseNow = new RealDate(initial as any).getTime();

  dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => baseNow);

  // Patch new Date() with no args. Preserves new Date(arg) behavior.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PatchedDate: any = function (this: any, ...args: unknown[]) {
    if (args.length === 0) {
      return new RealDate(baseNow);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (RealDate as any)(...args);
  };
  PatchedDate.prototype = RealDate.prototype;
  PatchedDate.now = () => baseNow;
  PatchedDate.UTC = RealDate.UTC;
  PatchedDate.parse = RealDate.parse;

  dateCtorSpy = jest.spyOn(global, 'Date').mockImplementation(PatchedDate);
}

export function restoreClock(): void {
  if (dateNowSpy) {
    dateNowSpy.mockRestore();
    dateNowSpy = null;
  }
  if (dateCtorSpy) {
    dateCtorSpy.mockRestore();
    dateCtorSpy = null;
  }
}

export function advanceTimeBy(ms: number): void {
  baseNow += ms;
}

export function setNow(value: Date | string | number): void {
  baseNow = new RealDate(value as any).getTime();
}

export const SECONDS = 1000;
export const MINUTES = 60 * SECONDS;
export const HOURS = 60 * MINUTES;
export const DAYS = 24 * HOURS;
