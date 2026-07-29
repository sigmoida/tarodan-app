import { Logger } from "@nestjs/common";
import { getQueueToken } from "@nestjs/bull";
import { Module } from "module";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Request, Response, NextFunction } from "express";
import { QUEUE_NAMES } from "./workers/constants";
import { CronTrackerService } from "./monitoring/cron-tracker.service";
import type { CronRunRecord } from "./monitoring/cron-tracker.service";

const BASE_PATH = "/admin/queues";

/**
 * pnpm `node-linker=hoisted` altında `bull` paketinin iki fiziksel kopyası
 * oluşabiliyor: kuyruklar `.pnpm/bull@x` kopyasından (@nestjs/bull üzerinden),
 * `@bull-board/api` ise kök `node_modules/bull` kopyasından yükleniyor. Aynı
 * sürüm olsalar da farklı dosya yolu = Node için iki ayrı modül; bu yüzden
 * BullAdapter'ın `queue instanceof Bull` kontrolü "non-Bull queue" diye patlar.
 *
 * Çözüm (izole + reinstall'a dayanıklı): bull-board'un göreceği `bull`'u, bizim
 * kuyruklarımızın `bull`'una module cache üzerinden eşitle. Yalnızca bull-board'u
 * etkiler (kök kopyanın tek tüketicisi o); uygulamanın kendi bull kullanımına
 * dokunmaz. Bunu BullAdapter require edilmeden ÖNCE yapmak gerektiği için
 * bull-board modülleri statik import değil, lazy `require` ile yüklenir.
 */
function alignBullBoardBullCopy(logger: Logger): void {
  try {
    // Bizim (kuyrukların) bull kopyası — bu dosya apps/api bağlamında çalışır,
    // dolayısıyla @nestjs/bull ile aynı kopyayı çözer.
    const ourBull = require("bull");

    // bull-board'un BullAdapter'ının çözeceği bull dosya yolu.
    const adapterDir = require("path").dirname(
      require.resolve("@bull-board/api/bullAdapter"),
    );
    const bbBullPath = Module.createRequire(adapterDir + "/x.js").resolve(
      "bull",
    );

    const ourBullPath = require.resolve("bull");
    if (bbBullPath === ourBullPath) {
      return; // Zaten aynı kopya, yapacak bir şey yok.
    }

    // bull-board'un bull yolunu, bizim bull modülümüze yönlendir.
    const shim = new Module(bbBullPath);
    shim.filename = bbBullPath;
    shim.loaded = true;
    shim.exports = ourBull;
    require.cache[bbBullPath] = shim;
    logger.log(
      "Bull Board: bull kopyası kuyruklarla hizalandı (pnpm hoist fix).",
    );
  } catch (e) {
    // Hizalama başarısızsa mount denemesi yine de yapılır; en kötü ihtimalle
    // adapter düzeyinde yakalanır. Açılışı bloklamaz.
    logger.warn(
      `Bull Board: bull kopyası hizalanamadı: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Bull Board — tek ekranda kuyruk izleme (Flower benzeri).
 *
 * Tasarım kararları (CLAUDE.md: additive / reversible / akışı bozma):
 *   - Tamamen opsiyonel: BULLBOARD_ENABLED=false ile kapatılır.
 *   - Production'da DEFAULT KAPALI; açmak için BULLBOARD_ENABLED=true gerekir.
 *   - Basic Auth arkasında (uygulamanın JWT akışına dokunmaz — ayrı ops aracı).
 *   - helmet'TEN ÖNCE mount edilir; böylece CSP UI'ı bozmaz ve istek
 *     bull-board router'ında yanıtlanıp helmet'e hiç düşmez.
 *   - Her şey try/catch içinde: bir izleme aracı asla API açılışını bloklamaz.
 */
export function setupBullBoard(
  app: NestExpressApplication,
  logger: Logger,
): void {
  // Off by default on every deployed environment — including staging — so the
  // queue dashboard is never exposed unless BULLBOARD_ENABLED=true. Local
  // development keeps it on for convenience (unless explicitly disabled). Not
  // driven by the negation of `production` anymore (#69).
  const isLocalDev = process.env.NODE_ENV === "development";
  const flag = process.env.BULLBOARD_ENABLED;

  const enabled = flag === "true" || (isLocalDev && flag !== "false");
  if (!enabled) {
    logger.log(
      "Bull Board kapalı. Açmak için BULLBOARD_ENABLED=true ayarlayın.",
    );
    return;
  }

  try {
    alignBullBoardBullCopy(logger);

    // Lazy require: bull kopyası hizalandıktan SONRA yüklenmeli.
    const { createBullBoard } = require("@bull-board/api");
    const { BullAdapter } = require("@bull-board/api/bullAdapter");
    const { ExpressAdapter } = require("@bull-board/express");

    // Kayıtlı tüm kuyrukları Nest DI'dan çöz (WorkerModule -> AppModule).
    const adapters = Object.values(QUEUE_NAMES)
      .map((name) => {
        try {
          const queue = app.get(getQueueToken(name), { strict: false });
          return queue ? new BullAdapter(queue) : null;
        } catch (e) {
          logger.warn(
            `Bull Board: '${name}' kuyruğu çözülemedi: ${e instanceof Error ? e.message : String(e)}`,
          );
          return null;
        }
      })
      .filter((a): a is unknown => a !== null);

    if (adapters.length === 0) {
      logger.warn("Bull Board: hiç kuyruk çözülemedi, mount atlandı.");
      return;
    }

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(BASE_PATH);
    createBullBoard({ queues: adapters, serverAdapter });

    // Basic Auth — internal ops aracı. Only local dev gets a default password;
    // every deployed environment (incl. staging) must set BULLBOARD_PASS or the
    // dashboard is refused rather than mounted unprotected (#69).
    const user = process.env.BULLBOARD_USER || "admin";
    const pass = process.env.BULLBOARD_PASS || (isLocalDev ? "admin" : "");
    if (!pass) {
      logger.warn(
        "Bull Board: BULLBOARD_PASS tanımsız; korumasız dashboard mount EDİLMEDİ.",
      );
      return;
    }
    const expected =
      "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

    const auth = (req: Request, res: Response, next: NextFunction): void => {
      if (req.headers.authorization === expected) {
        next();
        return;
      }
      res.set("WWW-Authenticate", 'Basic realm="Tarodan Queues"');
      res.status(401).send("Authentication required");
    };

    app.use(BASE_PATH, auth, serverAdapter.getRouter());
    logger.log(
      `Bull Board hazır: http://localhost:${process.env.PORT || 3000}${BASE_PATH} (${adapters.length} kuyruk)`,
    );

    // --- Cron dashboard (/admin/jobs) — aynı Basic Auth arkasında ---
    mountCronDashboard(app, auth, logger);
  } catch (err) {
    // İzleme aracı API'yi asla düşürmez.
    logger.error(
      `Bull Board mount başarısız (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const JOBS_PATH = "/admin/jobs";

/**
 * Bull cron işlerini tek ekranda gösterir (in-process ikizler kaldırıldı, Bull-only): son durum, son çalışma, süre,
 * hata, toplam çalışma/başarısızlık. Bull Board ile aynı Basic Auth'u paylaşır.
 *   - GET /admin/jobs       -> HTML tablo (3 sn'de bir otomatik yenilenir)
 *   - GET /admin/jobs/api   -> JSON (programatik erişim / Sentry karşılaştırma)
 */
function mountCronDashboard(
  app: NestExpressApplication,
  auth: (req: Request, res: Response, next: NextFunction) => void,
  logger: Logger,
): void {
  let tracker: CronTrackerService | null = null;
  try {
    tracker = app.get(CronTrackerService, { strict: false });
  } catch {
    logger.warn(
      "Cron dashboard: CronTrackerService çözülemedi, /admin/jobs atlandı.",
    );
    return;
  }
  if (!tracker) return;

  app.use(JOBS_PATH, auth, (req: Request, res: Response) => {
    const records = tracker!.list();
    if (req.path === "/api" || req.path === "/api/") {
      res.json({ count: records.length, jobs: records });
      return;
    }
    res
      .set("Content-Type", "text/html; charset=utf-8")
      .send(renderCronHtml(records));
  });

  logger.log(
    `Cron dashboard hazır: http://localhost:${process.env.PORT || 3000}${JOBS_PATH}`,
  );
}

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

function renderCronHtml(records: CronRunRecord[]): string {
  const color: Record<string, string> = {
    success: "#1a7f37",
    failed: "#cf222e",
    running: "#9a6700",
    idle: "#57606a",
  };
  const rows = records
    .map((r) => {
      const c = color[r.status] ?? "#57606a";
      return `<tr>
        <td><code>${esc(r.job)}</code></td>
        <td><code>${esc(r.schedule)}</code></td>
        <td><b style="color:${c}">${esc(r.status.toUpperCase())}</b></td>
        <td>${r.lastStartedAt ? esc(r.lastStartedAt.replace("T", " ").slice(0, 19)) : "—"}</td>
        <td>${r.lastDurationMs != null ? r.lastDurationMs + " ms" : "—"}</td>
        <td>${r.runs}</td>
        <td style="color:${r.failures ? "#cf222e" : "inherit"}">${r.failures}</td>
        <td style="color:#cf222e">${r.lastError ? esc(r.lastError) : ""}</td>
      </tr>`;
    })
    .join("");
  const empty = records.length
    ? ""
    : '<tr><td colspan="8" style="color:#57606a">Henüz cron çalışmadı (kayıtlar ilk tetiklenmede görünür).</td></tr>';
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="3">
<title>Tarodan Cron Jobs</title>
<style>
  body{font:14px/1.5 -apple-system,system-ui,sans-serif;margin:24px;color:#1f2328}
  h1{font-size:18px} .sub{color:#57606a;margin-bottom:16px}
  table{border-collapse:collapse;width:100%} th,td{padding:6px 10px;border-bottom:1px solid #d0d7de;text-align:left;vertical-align:top}
  th{font-size:12px;text-transform:uppercase;color:#57606a} code{background:#f6f8fa;padding:1px 5px;border-radius:4px}
  a{color:#0969da}
</style></head><body>
<h1>⏱️ Cron Jobs — Tarodan</h1>
<div class="sub">${records.length} izlenen iş • 3 sn'de bir otomatik yenilenir • <a href="/admin/queues">Kuyruklar (Bull Board) →</a></div>
<table>
  <tr><th>İş</th><th>Schedule</th><th>Durum</th><th>Son çalışma</th><th>Süre</th><th>Çalışma</th><th>Hata</th><th>Son hata mesajı</th></tr>
  ${rows}${empty}
</table>
</body></html>`;
}
