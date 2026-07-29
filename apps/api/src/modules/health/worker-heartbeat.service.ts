import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { getProcessRole, runsQueueWorkers } from "../../process-role";

export const WORKER_HEARTBEAT_KEY = "health:worker:heartbeat";
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TTL_SECONDS = 45;

@Injectable()
export class WorkerHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly cache: CacheService) {}

  async onModuleInit(): Promise<void> {
    if (!runsQueueWorkers()) return;

    await this.writeHeartbeat();
    this.timer = setInterval(() => {
      void this.writeHeartbeat().catch((error) => {
        this.logger.error("Worker heartbeat write failed", error);
      });
    }, HEARTBEAT_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async writeHeartbeat(): Promise<void> {
    await this.cache.set(
      WORKER_HEARTBEAT_KEY,
      { at: Date.now(), role: getProcessRole() },
      { ttl: HEARTBEAT_TTL_SECONDS },
    );
  }
}
