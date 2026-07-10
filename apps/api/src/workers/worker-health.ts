import { createServer, Server } from "http";
import { Logger } from "@nestjs/common";
import Redis from "ioredis";

/**
 * Worker health + heartbeat — API'den TAMAMEN BAĞIMSIZ izleme.
 *
 * Neden: Bull Board API'de mount'lu; API çökünce o panel gider. Ama worker ayrı
 * process olarak çalışmaya devam eder. Bu yüzden worker'ın "yaşıyorum" sinyalini
 * (heartbeat → Redis) ve kendi HTTP /health adresini API'den bağımsız veriyoruz:
 *  - Docker healthcheck bu adresi yoklar → Docker Desktop'ta yeşil/kırmızı.
 *  - Sen doğrudan curl'leyebilirsin (API ölü olsa bile).
 *  - Bağımsız Bull Board bu heartbeat key'ini okuyup "worker canlı mı" gösterebilir.
 */

export const WORKER_HEARTBEAT_KEY = "worker:heartbeat";
const HEARTBEAT_INTERVAL_MS = 10_000;
/** Heartbeat bundan eskiyse worker "sağlıksız" (donmuş/ölü) sayılır. */
const HEARTBEAT_STALE_MS = 30_000;

function redisFromEnv(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });
}

/**
 * Heartbeat interval'ını ve /health HTTP sunucusunu başlatır.
 * Dönen fonksiyon graceful shutdown'da çağrılır (temizlik).
 */
export function startWorkerHealth(logger: Logger): () => Promise<void> {
  const redis = redisFromEnv();

  const beat = async (): Promise<void> => {
    try {
      // 60 sn TTL: worker ölürse key kendiliğinden düşer → "stale" netleşir.
      await redis.set(WORKER_HEARTBEAT_KEY, Date.now().toString(), "EX", 60);
    } catch {
      /* health sunucusu durumu yine de raporlar; sessiz geç */
    }
  };
  void beat();
  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);

  // 3005 (3003 DEĞİL): monitoring yığınındaki Grafana host 3003'ü kullanıyor, çakışmasın.
  const port = Number(process.env.WORKER_HEALTH_PORT) || 3005;
  const server: Server = createServer((req, res) => {
    if (req.url !== "/health" && req.url !== "/") {
      res.writeHead(404);
      res.end();
      return;
    }
    void (async () => {
      let redisOk = false;
      let lastBeat: number | null = null;
      try {
        await redis.ping();
        redisOk = true;
        const v = await redis.get(WORKER_HEARTBEAT_KEY);
        lastBeat = v ? Number(v) : null;
      } catch {
        /* redisOk = false kalır */
      }
      const ageMs = lastBeat != null ? Date.now() - lastBeat : null;
      const healthy = redisOk && ageMs != null && ageMs < HEARTBEAT_STALE_MS;
      res.writeHead(healthy ? 200 : 503, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify({
          status: healthy ? "ok" : "unhealthy",
          role: "worker",
          redis: redisOk,
          lastHeartbeatMsAgo: ageMs,
          ts: new Date().toISOString(),
        }),
      );
    })();
  });
  server.listen(port, () => {
    logger.log(
      `Worker health endpoint: http://localhost:${port}/health (heartbeat every ${HEARTBEAT_INTERVAL_MS / 1000}s)`,
    );
  });

  return async (): Promise<void> => {
    clearInterval(timer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await redis.quit().catch(() => undefined);
  };
}
