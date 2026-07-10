/**
 * Bağımsız Bull Board entrypoint (izleme servisi).
 *
 * Ne API'ye ne worker'a bağlıdır — Redis'i DOĞRUDAN okur ve kuyruk panelini kendi
 * portundan sunar. Böylece API veya worker çökse bile kuyruk/iş izleme AYAKTA kalır.
 * Sunucuda ayrı bir container/servis olarak koşar (PROCESS_ROLE=bullboard).
 *
 * Bull kopyası hizalaması: pnpm hoisted altında `bull`'ın iki fiziksel kopyası
 * olabilir → BullAdapter'ın `instanceof Bull` kontrolü patlar. Bizim kuyruklarımızın
 * bull'unu bull-board'un göreceği bull'a module-cache üzerinden eşitliyoruz
 * (bull-board.setup.ts ile aynı teknik).
 */
import { Logger } from "@nestjs/common";
import { Module } from "module";
import type { Request, Response, NextFunction } from "express";
import { QUEUE_NAMES } from "./workers/constants";

// CommonJS modüller: bu projede esModuleInterop KAPALI → `import X from '...'` default
// runtime'da `.default` (undefined) verir. bull/express saf CJS (module.exports = X),
// o yüzden require ile alıyoruz (ioredis'in kendi default'u var, o import edilebiliyor).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Bull: new (name: string, opts: any) => any = require("bull");

const logger = new Logger("BullBoard");

function alignBullBoardBullCopy(): void {
  try {
    const ourBull = require("bull");
    const adapterDir = require("path").dirname(
      require.resolve("@bull-board/api/bullAdapter"),
    );
    const bbBullPath = Module.createRequire(adapterDir + "/x.js").resolve(
      "bull",
    );
    const ourBullPath = require.resolve("bull");
    if (bbBullPath === ourBullPath) return;
    const shim = new Module(bbBullPath);
    shim.filename = bbBullPath;
    shim.loaded = true;
    shim.exports = ourBull;
    require.cache[bbBullPath] = shim;
    logger.log("bull kopyası hizalandı (pnpm hoist fix).");
  } catch (e) {
    logger.warn(
      `bull kopyası hizalanamadı: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

async function bootstrap(): Promise<void> {
  const redis = {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  };

  // Tüm kuyrukları Redis'e bağla (salt-izleme; @Process yok → tüketmez).
  const queues = Object.values(QUEUE_NAMES).map(
    (name) => new Bull(name, { redis }),
  );

  alignBullBoardBullCopy();
  const { createBullBoard } = require("@bull-board/api");
  const { BullAdapter } = require("@bull-board/api/bullAdapter");
  const { ExpressAdapter } = require("@bull-board/express");

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/");
  createBullBoard({
    queues: queues.map((q) => new BullAdapter(q)),
    serverAdapter,
  });

  // Basic Auth (API'deki Bull Board ile aynı env'ler).
  const user = process.env.BULLBOARD_USER || "admin";
  const pass = process.env.BULLBOARD_PASS || "admin";
  const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  const auth = (req: Request, res: Response, next: NextFunction): void => {
    // /healthz auth'suz — Docker healthcheck için.
    if (req.path === "/healthz") {
      res.json({ status: "ok", role: "bullboard" });
      return;
    }
    if (req.headers.authorization === expected) {
      next();
      return;
    }
    res.set("WWW-Authenticate", 'Basic realm="Tarodan Queues"');
    res.status(401).send("Authentication required");
  };

  const app = express();
  app.use(auth);
  app.use("/", serverAdapter.getRouter());

  const port = Number(process.env.BULLBOARD_PORT) || 3004;
  app.listen(port, () => {
    logger.log(
      `Bağımsız Bull Board hazır: http://localhost:${port}/ (${queues.length} kuyruk, API/worker'dan bağımsız)`,
    );
  });
}

bootstrap().catch((e) => {
  logger.error(
    `Bull Board başlatılamadı: ${e instanceof Error ? e.message : String(e)}`,
  );
  process.exit(1);
});
