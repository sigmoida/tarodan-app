import { Cron, CronOptions } from '@nestjs/schedule';
import { getCronTracker } from './cron-tracker.holder';

/**
 * `@Cron` için drop-in yedek: zamanlama davranışı BİREBİR `@Cron` ile aynıdır
 * (altında onu çağırır), tek farkı method'u CronTracker ile sarmasıdır.
 *
 * Sarmalayıcı orijinali `this`, argümanlar, dönüş değeri ve fırlatılan hatayı
 * koruyarak çağırır — yani izleme cron'un çalışmasını DEĞİŞTİRMEZ. Tracker
 * bir sebeple yoksa, iş hiç sarılmadan olduğu gibi çalışır.
 *
 * İş adı otomatik türetilir: `SınıfAdı.methodAdı` (ekstra parametre gerekmez).
 */
export function TrackedCron(cronTime: string, options?: CronOptions): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const job = `${target?.constructor?.name ?? 'Unknown'}.${String(propertyKey)}`;
    const schedule = String(cronTime);

    descriptor.value = function wrapped(...args: unknown[]) {
      const tracker = getCronTracker();
      if (!tracker) {
        return original.apply(this, args);
      }
      return tracker.track(job, schedule, () => original.apply(this, args));
    };

    // Gerçek zamanlamayı sarılmış method üzerine uygula — Nest scheduler
    // bu key'i çağırdığında wrapped() çalışır.
    Cron(cronTime, options)(target, propertyKey, descriptor);
    return descriptor;
  };
}
