import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { QUEUE_NAMES } from "./constants";
import { cleanupOrphanRepeatables } from "../monitoring/bull-cron.helper";

/**
 * WORKER-ONLY: tüm scheduler onModuleInit registration'ları bittikten SONRA
 * (OnApplicationBootstrap) Redis'teki ölü/yeniden-adlandırılmış repeatable
 * key'lerini süpürür.
 *
 * Yalnız SchedulerModule (worker) sağlar → yalnız worker'da çalışır. Worker TÜM
 * işleri kaydettiği için registeredJobNames tamdır; süpürme güvenle sadece gerçek
 * orphan'ları siler. (API bu servisi yüklemez; kısmi set ile canlı key silinmesin.)
 */
@Injectable()
export class ScheduledJanitorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduledJanitorService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await cleanupOrphanRepeatables(this.scheduledQueue, this.logger);
  }
}
