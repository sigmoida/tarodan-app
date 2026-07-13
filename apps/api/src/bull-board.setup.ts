import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { Module } from 'module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { QUEUE_NAMES } from './workers/constants';

const BASE_PATH = '/admin/queues';

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
    const ourBull = require('bull');

    // bull-board'un BullAdapter'ının çözeceği bull dosya yolu.
    const adapterDir = require('path').dirname(
      require.resolve('@bull-board/api/bullAdapter'),
    );
    const bbBullPath = Module.createRequire(adapterDir + '/x.js').resolve('bull');

    const ourBullPath = require.resolve('bull');
    if (bbBullPath === ourBullPath) {
      return; // Zaten aynı kopya, yapacak bir şey yok.
    }

    // bull-board'un bull yolunu, bizim bull modülümüze yönlendir.
    const shim = new Module(bbBullPath);
    shim.filename = bbBullPath;
    shim.loaded = true;
    shim.exports = ourBull;
    require.cache[bbBullPath] = shim;
    logger.log('Bull Board: bull kopyası kuyruklarla hizalandı (pnpm hoist fix).');
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
export function setupBullBoard(app: NestExpressApplication, logger: Logger): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const flag = process.env.BULLBOARD_ENABLED;

  if (flag === 'false') {
    return;
  }
  if (isProduction && flag !== 'true') {
    logger.log(
      'Bull Board kapalı (production). Açmak için BULLBOARD_ENABLED=true ayarlayın.',
    );
    return;
  }

  try {
    alignBullBoardBullCopy(logger);

    // Lazy require: bull kopyası hizalandıktan SONRA yüklenmeli.
    const { createBullBoard } = require('@bull-board/api');
    const { BullAdapter } = require('@bull-board/api/bullAdapter');
    const { ExpressAdapter } = require('@bull-board/express');

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
      logger.warn('Bull Board: hiç kuyruk çözülemedi, mount atlandı.');
      return;
    }

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(BASE_PATH);
    createBullBoard({ queues: adapters, serverAdapter });

    // Basic Auth — internal ops aracı. Prod'da şifresiz mount'a izin verme.
    const user = process.env.BULLBOARD_USER || 'admin';
    const pass = process.env.BULLBOARD_PASS || (isProduction ? '' : 'admin');
    if (!pass) {
      logger.warn(
        "Bull Board: production'da BULLBOARD_PASS tanımsız; korumasız dashboard mount EDİLMEDİ.",
      );
      return;
    }
    const expected = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    const auth = (req: Request, res: Response, next: NextFunction): void => {
      if (req.headers.authorization === expected) {
        next();
        return;
      }
      res.set('WWW-Authenticate', 'Basic realm="Tarodan Queues"');
      res.status(401).send('Authentication required');
    };

    app.use(BASE_PATH, auth, serverAdapter.getRouter());
    logger.log(
      `Bull Board hazır: http://localhost:${process.env.PORT || 3000}${BASE_PATH} (${adapters.length} kuyruk)`,
    );
  } catch (err) {
    // İzleme aracı API'yi asla düşürmez.
    logger.error(
      `Bull Board mount başarısız (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
