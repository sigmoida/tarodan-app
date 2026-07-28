/**
 * 21 — Medya & Dosya Yükleme (MED) — Test Konsolu senaryoları.
 *
 * Yapı 01-auth.e2e-spec.ts ile birebir aynıdır (FAN-OUT şablonu): her test
 * `scenario('MED-NNN', fn)` ile manifest'e bağlanır; başlık/öncelik manifest'ten
 * otomatik gelir. Assertion'lar manifest exp'lerinden + GERÇEK koddan türetilmiştir:
 *   - media.controller.ts (path'ler, @Query, guard, alan adları: file/files/images/avatar)
 *   - media.service.ts (upload/uploadProductImageVariants, boyut/tip/limit sırası)
 *   - storage.service.ts (isPublicBucket, PUBLIC_BUCKETS, getPublicAssetUrl, key şablonu)
 *   - media-access.service.ts (assertCanModify: 403/404/uploader|admin kuralı)
 *   - moderation-ai.client.ts (assertImageClean fail-open; AI_MODERATION_ENABLED='false')
 *
 * HARNESS / ORTAM KISITLARI (gerçek koddan doğrulanmış — assertion'lar buna göre):
 *   1) StorageService test app'te TAMAMEN STUB'lanmış (create-app.ts:89-126):
 *        - uploadFile() → sabit { key:'test/file.bin', bucket:'test-bucket', size:0,
 *          mimeType:'application/octet-stream' } döner; prisma.mediaFile.create ÇAĞRILMAZ.
 *          → Yükleme sonrası MediaFile satırı OLUŞMAZ; gerçek key şablonu (dev/products/…)
 *            ve resize edilmiş obje boyutu API'den GÖZLEMLENEMEZ. Yalnız HTTP kod +
 *            gövde alan varlığı (key/url) assert edilir.
 *        - deleteFile() → NO-OP; prisma.mediaFile satırını SİLMEZ. → "silindi/ikinci kez 404"
 *          semantiği gözlemlenemez; yalnız yetki (200/403/404) ve success:true assert edilir.
 *        - getPresignedDownloadUrl() → her zaman sabit URL; asla fırlatmaz.
 *        - getPublicAssetUrl(key) → `https://test-cdn.invalid/${key}` (asla boş).
 *        - isStorageAvailable() → her zaman true (S3-down simüle edilemez).
 *   2) `sharp` native modülü CI'da KURULUDUR ve require('sharp') BAŞARILI olur:
 *      pnpm-lock.yaml @img/sharp-linux-x64@0.34.5 + @img/sharp-libvips-linux-x64@1.2.4
 *      prebuilt paketlerini içerir; setup-workspace `pnpm install --frozen-lockfile`
 *      (ignore-scripts YOK, node-linker=hoisted) ile bunları kurar; ubuntu-latest (glibc)
 *      = linux-x64. → media.service'te `sharp` TRUTHY. Sonuçlar:
 *        - upload resize/thumbnail çalıştırılır (koşul `&& sharp` TRUE). Girdi GEÇERLİ bir
 *          görsel DEĞİLSE sharp toBuffer() reddeder → upload try/catch'i "File upload failed"
 *          400'e çevirir (media.service.ts:152-154). Bu yüzden resize/thumbnail/avatar
 *          testleri GERÇEK bir PNG (realPngBuffer) yollar → resize başarılı → 201.
 *        - uploadProductImageVariants sharp TRUTHY olduğundan "sharp yok 400" dalına (service:
 *          294-296) HİÇ girmez → o negatif senaryo (MED-102) bu ortamda ERİŞİLEMEZ (skip).
 *          [Empirik doğrulama: ilk CI koşusunda bu testler 201 değil 400/500 verdi; sharp
 *          null olsaydı sessiz-atlama ile 201 dönerlerdi → CI çıktısı sharp'ın YÜKLENDİĞİNİ
 *          kanıtlar.]
 *   3) AI moderation KAPALI (AI_MODERATION_ENABLED varsayılan 'false') → assertImageClean
 *      no-op (fail-open). NSFW engelleme (MED-049/055) TETİKLENEMEZ; fail-open (MED-104/105)
 *      ise VARSAYILAN davranıştır ve doğrulanır (201 + moderation_events yazılmaz).
 *
 * Granül kurulum (MediaFile satırı seed, membership tier override) spec içinde getPrisma
 * ile inline yapılır; test-utils/factory DEĞİŞTİRİLMEZ.
 *
 * media_files ve moderation_events truncateAll listesinde DEĞİL (db.ts) → her testte
 * seedBaseline sonrası elle temizlenir (aşağıdaki beforeEach).
 */
import * as request from "supertest";
import { createE2ETestApp, E2ETestApp } from "../../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../../test-utils/db";
import {
  createUser,
  createAdminUser,
  authHeader,
} from "../../factories/user.factory";
import { scenario } from "../../test-utils/scenario";

// ──────────────────────────── Dosya içerik üreticileri ────────────────────────────
// Multer memory storage kullanılır (global override yok) → .attach(field, buffer, {filename,
// contentType}) req.file.buffer/mimetype/originalname/size'ı doldurur.
//
// İKİ TÜR içerik üretici var; hangisinin kullanılacağı testin sharp'a DOKUNUP dokunmamasına
// bağlıdır (sharp CI'da KURULUDUR — bkz. üstteki HARNESS notu, madde 2):
//   • jpegBuffer/pngBuffer → SAHTE imza + sıfır dolgu. Yalnız `file.size`/`file.mimetype`
//     kontrol edilen (sharp'a girmeyen) uçlar için: guard/limit/tip/boyut/çoklu-sayı/
//     public-url/silme senaryoları. sharp bu tamponları DECODE EDEMEZ.
//   • realPngBuffer → GERÇEK, decode edilebilir 2x2 PNG. resize/thumbnail/avatar gibi
//     media.service.upload'ın sharp'a soktuğu (koşul `&& sharp` TRUE) uçlar için ZORUNLU;
//     aksi hâlde sharp toBuffer() reddeder → upload try/catch'i "File upload failed" 400'e
//     çevirir (media.service.ts:88-92,128-131,152-154). Gerçek PNG ile resize BAŞARILI → 201.
const jpegBuffer = (bytes = 200 * 1024): Buffer => {
  const buf = Buffer.alloc(bytes, 0x00);
  // JPEG SOI/APP0 imzası (bu tampon sharp'a girmez; yalnız size/mimetype için).
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[bytes - 2] = 0xff;
  buf[bytes - 1] = 0xd9;
  return buf;
};
const pngBuffer = (bytes = 50 * 1024): Buffer => {
  const buf = Buffer.alloc(bytes, 0x00);
  // PNG imzası (bu tampon sharp'a girmez; yalnız size/mimetype için).
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf);
  return buf;
};
// GERÇEK 2x2 kırmızı RGB PNG (73 bayt). sharp bunu decode + resize edebilir → sharp'a giren
// (resize=…, thumbnail=true, avatar zorunlu 300x300) uçlarda 201 alınır. Storage STUB olduğu
// için üretilen objenin gerçek boyutu gözlemlenemez; yalnız isteğin sharp'ta patlamadan 201
// ile tamamlandığı doğrulanır.
const REAL_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==";
const realPngBuffer = (): Buffer => Buffer.from(REAL_PNG_B64, "base64");

describe("21 — Medya & Dosya Yükleme (MED)", () => {
  let ctx: E2ETestApp;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
    ctx.paytr.reset();
    ctx.surat.reset();
    // media_files/moderation_events truncateAll kapsamında değil → deterministik başlangıç.
    const prisma = getPrisma();
    await prisma.mediaFile.deleteMany({});
    await prisma.moderationEvent.deleteMany({});
  });

  // ──────────────────────────── Inline kurulum yardımcıları ────────────────────────────

  /** Seed'lenen FREE tier'ın resim limitini ayarla (MED-041/042: FREE=3). */
  async function setFreeTierMaxImages(n: number): Promise<void> {
    const prisma = getPrisma();
    await prisma.membershipTier.update({
      where: { type: "free" as any },
      data: { maxImagesPerListing: n },
    });
  }

  /** İstenen tier'ı (yoksa) oluşturur ve kullanıcıya aktif üyelik bağlar (üst tier limitleri). */
  async function attachTier(
    userId: string,
    tierType: "basic" | "premium" | "business",
    maxImagesPerListing: number,
  ): Promise<void> {
    const prisma = getPrisma();
    let tier = await prisma.membershipTier.findUnique({
      where: { type: tierType as any },
    });
    if (!tier) {
      tier = await prisma.membershipTier.create({
        data: {
          type: tierType as any,
          name: `Test ${tierType}`,
          monthlyPrice: 100,
          yearlyPrice: 1000,
          maxFreeListings: 1000,
          maxTotalListings: 1000,
          maxImagesPerListing,
          canCreateCollections: true,
          canTrade: true,
          isAdFree: true,
          isActive: true,
        },
      });
    } else {
      tier = await prisma.membershipTier.update({
        where: { id: tier.id },
        data: { maxImagesPerListing },
      });
    }
    const now = new Date();
    await prisma.userMembership.create({
      data: {
        userId,
        tierId: tier.id,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(
          now.getFullYear() + 1,
          now.getMonth(),
          now.getDate(),
        ),
      },
    });
  }

  /**
   * Silme/erişim testleri için gerçek bir MediaFile satırı seed eder (upload stub'ı
   * satır yazmadığından). key @unique olduğu için rastgele bir suffix eklenir.
   */
  async function seedMediaFile(
    opts: {
      uploaderId?: string | null;
      bucket?: string;
      key?: string;
    } = {},
  ): Promise<{ id: string; key: string; bucket: string }> {
    const prisma = getPrisma();
    const key =
      opts.key ??
      `dev/products/product-images/${Math.random().toString(36).slice(2)}-card.webp`;
    const bucket = opts.bucket ?? "products";
    const row = await prisma.mediaFile.create({
      data: {
        bucket,
        key,
        filename: key.split("/").pop()!,
        mimeType: "image/webp",
        size: 12345,
        uploaderId: opts.uploaderId ?? null,
        isPublic: false,
        url: key,
      },
    });
    return { id: row.id, key: row.key, bucket: row.bucket };
  }

  // ─────────────────────── Yetki / Guard kapsamı ───────────────────────
  describe("Yetki & Guard kapsamı", () => {
    scenario("MED-001", async () => {
      // Misafir yükleme reddi. Guard (JwtAuthGuard) 401; dosya/DB yan etkisi yok.
      await request(server())
        .post("/api/media/upload")
        .attach("file", jpegBuffer(), {
          filename: "x.jpg",
          contentType: "image/jpeg",
        })
        .expect(401);
      const prisma = getPrisma();
      expect(await prisma.mediaFile.count()).toBe(0);
    });

    scenario("MED-002", async () => {
      // Misafir silme reddi (gerçek yol: DELETE /api/media/file/*).
      await request(server())
        .delete("/api/media/file/dev/avatars/x/y.jpg")
        .expect(401);
    });

    scenario("MED-003", async () => {
      // Bozuk imzalı token ile yükleme → 401. Son karakteri değiştir (imza bozulur).
      const user = await createUser(ctx.module, {
        email: "mehmet-med@test.com",
      });
      const tampered =
        user.accessToken.slice(0, -1) +
        (user.accessToken.endsWith("a") ? "b" : "a");
      await request(server())
        .post("/api/media/upload")
        .set("Authorization", `Bearer ${tampered}`)
        .attach("file", jpegBuffer(), {
          filename: "x.jpg",
          contentType: "image/jpeg",
        })
        .expect(401);
    });

    scenario("MED-004", async () => {
      // Tüm uçlar guard kapsamında: token'sız hepsi 401.
      await request(server()).post("/api/media/upload").expect(401);
      await request(server()).post("/api/media/upload/multiple").expect(401);
      await request(server()).post("/api/media/upload/product").expect(401);
      await request(server()).post("/api/media/upload/avatar").expect(401);
      await request(server())
        .get("/api/media/public-url/dev/products/x.webp")
        .expect(401);
      await request(server())
        .delete("/api/media/file/dev/products/x.webp")
        .expect(401);
    });

    scenario("MED-066", async () => {
      // Public URL için kimlik şart (controller-seviyesi @UseGuards(JwtAuthGuard)).
      await request(server())
        .get("/api/media/public-url/dev/products/x.webp")
        .expect(401);
    });
  });

  // ─────────────────────── Genel upload (POST /api/media/upload) ───────────────────────
  describe("POST /api/media/upload", () => {
    scenario("MED-010", async () => {
      // Geçerli JPEG yükleme happy path. Storage STUB → key/url sabit; MediaFile satırı
      // yazılmaz. Yalnız 201 + gövde alan varlığı (key + presigned url) assert edilir.
      const user = await createUser(ctx.module, { email: "up-jpeg@test.com" });
      const res = await request(server())
        .post("/api/media/upload?folder=messages")
        .set(authHeader(user))
        .attach("file", jpegBuffer(200 * 1024), {
          filename: "photo.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);
      expect(res.body.key).toBeTruthy();
      expect(res.body.bucket).toBeTruthy();
      expect(typeof res.body.size).toBe("number");
      // Stub getPresignedDownloadUrl her zaman URL döndürdüğünden url alanı dolu gelir.
      expect(res.body.url).toBeTruthy();
    });

    scenario("MED-011", async () => {
      // Varsayılan folder = uploads (folder query yok) → 201 (PNG kabul).
      const user = await createUser(ctx.module, {
        email: "up-default@test.com",
      });
      const res = await request(server())
        .post("/api/media/upload")
        .set(authHeader(user))
        .attach("file", pngBuffer(), {
          filename: "photo.png",
          contentType: "image/png",
        })
        .expect(201);
      expect(res.body.key).toBeTruthy();
    });

    scenario("MED-012", async () => {
      // Dosya alanı eksik → 400 "No file provided" (controller:43-45).
      const user = await createUser(ctx.module, {
        email: "up-nofile@test.com",
      });
      const res = await request(server())
        .post("/api/media/upload")
        .set(authHeader(user))
        .expect(400);
      expect(res.body.message).toBe("No file provided");
    });

    scenario("MED-013", async () => {
      // Desteklenmeyen tip PDF → 400 "File type 'application/pdf' is not allowed" (service:74-78).
      const user = await createUser(ctx.module, { email: "up-pdf@test.com" });
      const res = await request(server())
        .post("/api/media/upload")
        .set(authHeader(user))
        .attach("file", Buffer.from("%PDF-1.4 test"), {
          filename: "doc.pdf",
          contentType: "application/pdf",
        })
        .expect(400);
      expect(res.body.message).toBe(
        "File type 'application/pdf' is not allowed",
      );
    });

    scenario("MED-014", async () => {
      // text/plain → 400 "File type 'text/plain' is not allowed".
      const user = await createUser(ctx.module, { email: "up-txt@test.com" });
      const res = await request(server())
        .post("/api/media/upload")
        .set(authHeader(user))
        .attach("file", Buffer.from("hello world"), {
          filename: "note.txt",
          contentType: "text/plain",
        })
        .expect(400);
      expect(res.body.message).toBe("File type 'text/plain' is not allowed");
    });

    scenario("MED-015", async () => {
      // 10MB + 1 byte → multer's fileSize cap (#71, UPLOAD_MULTER_OPTIONS) aborts
      // the stream before the service check, so Nest maps LIMIT_FILE_SIZE to
      // 413 "File too large" (was a service-level 400 before the multer cap).
      const user = await createUser(ctx.module, { email: "up-big@test.com" });
      const res = await request(server())
        .post("/api/media/upload")
        .set(authHeader(user))
        .attach("file", jpegBuffer(10 * 1024 * 1024 + 1), {
          filename: "big.jpg",
          contentType: "image/jpeg",
        })
        .expect(413);
      // Nest maps multer LIMIT_FILE_SIZE to PayloadTooLargeException ("File too
      // large"); match loosely so minor wording changes don't break the gate.
      expect(String(res.body.message)).toMatch(/too large/i);
    });

    scenario("MED-016", async () => {
      // Tam 10MB (sınır dahil, > değil >=) → 201.
      const user = await createUser(ctx.module, { email: "up-exact@test.com" });
      await request(server())
        .post("/api/media/upload")
        .set(authHeader(user))
        .attach("file", jpegBuffer(10 * 1024 * 1024), {
          filename: "exact.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);
    });

    scenario("MED-017", async () => {
      // resize=300x300 → 201. sharp KURULU (bkz. HARNESS notu 2) → resize GERÇEKTEN çalışır;
      // bu yüzden GEÇERLİ bir PNG (realPngBuffer) yollanır → sharp toBuffer başarılı. Storage
      // stub üretilen objenin gerçek boyutunu gözlemletmez; yalnız 201 (resize patlamadı) assert.
      const user = await createUser(ctx.module, {
        email: "up-resize@test.com",
      });
      await request(server())
        .post("/api/media/upload?folder=messages&resize=300x300")
        .set(authHeader(user))
        .attach("file", realPngBuffer(), {
          filename: "r.png",
          contentType: "image/png",
        })
        .expect(201);
    });

    scenario("MED-018", async () => {
      // Geçersiz resize (abc) → width/height NaN → options.resize atanmaz → 201 (sessiz).
      const user = await createUser(ctx.module, {
        email: "up-badresize@test.com",
      });
      await request(server())
        .post("/api/media/upload?folder=messages&resize=abc")
        .set(authHeader(user))
        .attach("file", jpegBuffer(), {
          filename: "r.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);
    });

    scenario("MED-019", async () => {
      // thumbnail=true → 201. sharp KURULU → thumbnail ÜRETİLİR (koşul `generateThumbnail &&
      // … && sharp` TRUE; media.service.ts:128-147). Girdi GERÇEK PNG olmalı (aksi hâlde sharp
      // toBuffer reddeder → 400). NOT: storage STUB uploadFile sabit key ('test/file.bin')
      // döndürdüğünden result.thumbnail o sabit key olur — gerçek `.../thumbnails/thumb_…` key
      // şablonu (media.service.ts:133,138) stub yüzünden gözlemlenemez; yalnız thumbnail alanının
      // ÜRETİLDİĞİ (tanımlı/truthy) doğrulanır.
      const user = await createUser(ctx.module, { email: "up-thumb@test.com" });
      const res = await request(server())
        .post("/api/media/upload?folder=messages&thumbnail=true")
        .set(authHeader(user))
        .attach("file", realPngBuffer(), {
          filename: "t.png",
          contentType: "image/png",
        })
        .expect(201);
      // sharp KURULU → thumbnail üretildi → alan tanımlı (stub sabit key nedeniyle içerik jenerik).
      expect(res.body.thumbnail).toBeTruthy();
    });

    scenario("MED-020", async () => {
      // GIF genel upload allowedTypes içinde → 201 (service:59).
      const user = await createUser(ctx.module, { email: "up-gif@test.com" });
      await request(server())
        .post("/api/media/upload?folder=messages")
        .set(authHeader(user))
        .attach("file", Buffer.from("GIF89a" + "0".repeat(1024)), {
          filename: "a.gif",
          contentType: "image/gif",
        })
        .expect(201);
    });

    scenario("MED-087", async () => {
      // 0-byte jpeg: size(0) < 10MB geçer, tip geçer, sharp yok → ham stub upload → 201.
      // (validateProductImage'ın 1024 alt sınırı bu uçta KULLANILMAZ.)
      const user = await createUser(ctx.module, { email: "up-zero@test.com" });
      await request(server())
        .post("/api/media/upload?folder=messages")
        .set(authHeader(user))
        .attach("file", Buffer.alloc(0), {
          filename: "empty.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);
    });

    scenario("MED-088", async () => {
      // Path traversal folder query: uuid filename + string key → S3 key normal string.
      // Sunucu dosya sistemine yazma YOK (stub) → 201, patlama yok.
      const user = await createUser(ctx.module, { email: "up-trav@test.com" });
      await request(server())
        .post(
          "/api/media/upload?folder=" + encodeURIComponent("../../etc/passwd"),
        )
        .set(authHeader(user))
        .attach("file", jpegBuffer(), {
          filename: "x.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);
    });

    // MED-103 — "sharp yokken resize sessizce atlanır → 201" — bu ortamda ERİŞİLEMEZ:
    // sharp KURULU (bkz. HARNESS notu 2) → `if (resize && … && sharp)` TRUE olur; fake jpeg
    // sharp'ta decode edilemez → try/catch "File upload failed" 400'e çevirir (201 değil). Gerçek
    // PNG yollanırsa resize BAŞARILI olur ama yine "sessiz-atlama" dalı gözlemlenmez. Sharp-yok
    // silent-skip davranışı yalnız sharp KURULU DEĞİLKEN doğrulanabilir → gerekçeli skip.
    scenario.skip(
      "MED-103",
      "Sharp yokken genel upload resize sessiz atlanır → 201: sharp bu ortamda KURULU olduğundan silent-skip dalına (media.service.ts:88 `&& sharp` FALSE) hiç girilmez — fake tampon 400 (decode fail), gerçek PNG ise gerçekten resize edilir; sessiz-atlama gözlemlenemez.",
    );
  });

  // ─────────────────────── Çoklu upload (POST /api/media/upload/multiple) ───────────────────────
  describe("POST /api/media/upload/multiple", () => {
    scenario("MED-030", async () => {
      // 3 geçerli jpeg → 201, 3 elemanlık UploadResult[].
      const user = await createUser(ctx.module, { email: "mup-ok@test.com" });
      const res = await request(server())
        .post("/api/media/upload/multiple?folder=messages")
        .set(authHeader(user))
        .attach("files", jpegBuffer(), {
          filename: "a.jpg",
          contentType: "image/jpeg",
        })
        .attach("files", jpegBuffer(), {
          filename: "b.jpg",
          contentType: "image/jpeg",
        })
        .attach("files", jpegBuffer(), {
          filename: "c.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].key).toBeTruthy();
    });

    scenario("MED-031", async () => {
      // Boş dosya listesi → 400 "No files provided" (controller:77-79).
      const user = await createUser(ctx.module, {
        email: "mup-empty@test.com",
      });
      const res = await request(server())
        .post("/api/media/upload/multiple")
        .set(authHeader(user))
        .expect(400);
      expect(res.body.message).toBe("No files provided");
    });

    scenario("MED-032", async () => {
      // 11 dosya (FilesInterceptor('files',10) sınırı) → multer LIMIT_UNEXPECTED_FILE.
      // Gerçek davranış: 4xx (500'e dönüşmediği doğrulanır).
      const user = await createUser(ctx.module, { email: "mup-11@test.com" });
      let req = request(server())
        .post("/api/media/upload/multiple?folder=messages")
        .set(authHeader(user));
      for (let i = 0; i < 11; i++) {
        req = req.attach("files", jpegBuffer(1024), {
          filename: `f${i}.jpg`,
          contentType: "image/jpeg",
        });
      }
      const res = await req;
      expect(res.status).not.toBe(500);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ─────────────────────── Ürün görseli (POST /api/media/upload/product) ───────────────────────
  describe("POST /api/media/upload/product", () => {
    scenario("MED-041", async () => {
      // FREE tier limiti (3) aşımı: 4 resim → 400 "En fazla 3 resim yükleyebilirsiniz".
      // Limit kontrolü sharp'tan ÖNCE (controller:100-104) → sharp yokluğundan bağımsız geçerli.
      await setFreeTierMaxImages(3);
      const user = await createUser(ctx.module, {
        email: "prod-limit@test.com",
      });
      let req = request(server())
        .post("/api/media/upload/product")
        .set(authHeader(user));
      for (let i = 0; i < 4; i++) {
        req = req.attach("images", jpegBuffer(), {
          filename: `p${i}.jpg`,
          contentType: "image/jpeg",
        });
      }
      const res = await req.expect(400);
      expect(res.body.message).toBe("En fazla 3 resim yükleyebilirsiniz");
    });

    scenario("MED-044", async () => {
      // 16 resim: FilesInterceptor('images',15) multer sınırı → interceptor 4xx kesintisi;
      // tier "En fazla 15" mesajına ulaşılmayabilir. Gerçek davranış: 500 DEĞİL, 4xx.
      const user = await createUser(ctx.module, { email: "prod-16@test.com" });
      let req = request(server())
        .post("/api/media/upload/product")
        .set(authHeader(user));
      for (let i = 0; i < 16; i++) {
        req = req.attach("images", jpegBuffer(1024), {
          filename: `p${i}.jpg`,
          contentType: "image/jpeg",
        });
      }
      const res = await req;
      expect(res.status).not.toBe(500);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    scenario("MED-045", async () => {
      // Boş images → 400 "No files provided" (controller:96-98).
      const user = await createUser(ctx.module, {
        email: "prod-empty@test.com",
      });
      const res = await request(server())
        .post("/api/media/upload/product")
        .set(authHeader(user))
        .expect(400);
      expect(res.body.message).toBe("No files provided");
    });

    scenario("MED-046", async () => {
      // Geçersiz tip (pdf): limit geçer, moderasyon no-op, sonra uploadProductImageVariants.
      // sharp KURULU → `!sharp` dalı atlanır; TİP kontrolü (service:298) pdf'i reddeder → 400
      // "Geçersiz dosya tipi…". Bu dal sharp'a HİÇ girmez (tampon toBuffer'a ulaşmaz). Yalnız
      // status (400) assert edilir (mesaj değil).
      const user = await createUser(ctx.module, {
        email: "prod-type@test.com",
      });
      await request(server())
        .post("/api/media/upload/product")
        .set(authHeader(user))
        .attach("images", Buffer.from("%PDF-1.4"), {
          filename: "doc.pdf",
          contentType: "application/pdf",
        })
        .expect(400);
    });

    scenario("MED-047", async () => {
      // 11MB jpeg ürün görseli → 413. multer'ın fileSize cap'i (#71, UPLOAD_MULTER_OPTIONS)
      // gövde tamamen buffer'lanmadan stream'i keser (memory-DoS koruması), bu yüzden istek
      // app-seviye boyut kontrolüne (service:301, 400 "Dosya boyutu çok büyük") HİÇ ulaşmadan
      // 413 Payload Too Large döner. Genel upload'daki 10MB+1 senaryosuyla tutarlıdır.
      const user = await createUser(ctx.module, { email: "prod-big@test.com" });
      await request(server())
        .post("/api/media/upload/product")
        .set(authHeader(user))
        .attach("images", jpegBuffer(11 * 1024 * 1024), {
          filename: "big.jpg",
          contentType: "image/jpeg",
        })
        .expect(413);
    });

    // MED-102 — "Sharp yokken ürün varyantı → 400 'Image processing (sharp) is not available'"
    // (media.service.ts:294-296) — bu ortamda ERİŞİLEMEZ: sharp KURULU (bkz. HARNESS notu 2)
    // → `if (!sharp)` FALSE, o dal atlanır. Fake jpeg bunun yerine sharp(...).toBuffer()'ı
    // reddettirir; uploadProductImageVariants'te try/catch YOK → ham hata NestJS'e sızar → 500
    // (400 DEĞİL). Yani ne "sharp-yok 400" ne de anlamlı bir tip/boyut 400'ü gözlemlenir; yalnız
    // bir robustness-500 kalır. Sharp-yok dalı yalnız sharp KURULU DEĞİLKEN doğrulanabilir.
    scenario.skip(
      "MED-102",
      'Sharp yokken ürün varyantı 400 "Image processing (sharp) is not available": sharp bu ortamda KURULU olduğundan `if (!sharp)` dalına (media.service.ts:294) hiç girilmez → fake görsel sharp decode hatasını try/catch olmadan yükseltir ve 500 verir (400 değil). Sharp-yok davranışı yalnız sharp kurulu değilken assert edilebilir; MED-040/042/043/048 ile tutarlı gerekçeli skip.',
    );
  });

  // ─────────────────────── Avatar (POST /api/media/upload/avatar) ───────────────────────
  describe("POST /api/media/upload/avatar", () => {
    scenario("MED-050", async () => {
      // Avatar happy path. Avatar ucu resize'ı ZORUNLU uygular (controller:149
      // resize:{300x300}); sharp bu ortamda KURULU (bkz. HARNESS notu 2) → media.service.upload
      // fake tamponu sharp'a sokar ve decode edemezse try/catch "File upload failed" 400'e çevirir
      // (media.service.ts:88-92,152-154). Bu yüzden happy path GERÇEK, decode edilebilir bir PNG
      // (realPngBuffer) yollar → resize başarılı → 201. Storage STUB → 300x300 obje ve MediaFile
      // satırı gözlemlenemez; yalnız 201 + gövde (key) assert edilir.
      const user = await createUser(ctx.module, { email: "ayse-av@test.com" });
      const res = await request(server())
        .post("/api/media/upload/avatar")
        .set(authHeader(user))
        .attach("avatar", realPngBuffer(), {
          filename: "me.png",
          contentType: "image/png",
        })
        .expect(201);
      expect(res.body.key).toBeTruthy();
    });

    scenario("MED-051", async () => {
      // Avatar 2MB + 1 → 400 "File size exceeds maximum allowed (2MB)" (controller maxSize:2MB).
      const user = await createUser(ctx.module, { email: "av-big@test.com" });
      const res = await request(server())
        .post("/api/media/upload/avatar")
        .set(authHeader(user))
        .attach("avatar", jpegBuffer(2 * 1024 * 1024 + 1), {
          filename: "big.jpg",
          contentType: "image/jpeg",
        })
        .expect(400);
      expect(res.body.message).toBe("File size exceeds maximum allowed (2MB)");
    });

    scenario("MED-052", async () => {
      // Avatar GIF reddi (allowedTypes: jpeg/png/webp) → 400 "File type 'image/gif' is not allowed".
      const user = await createUser(ctx.module, { email: "av-gif@test.com" });
      const res = await request(server())
        .post("/api/media/upload/avatar")
        .set(authHeader(user))
        .attach("avatar", Buffer.from("GIF89a" + "0".repeat(1024)), {
          filename: "a.gif",
          contentType: "image/gif",
        })
        .expect(400);
      expect(res.body.message).toBe("File type 'image/gif' is not allowed");
    });

    scenario("MED-053", async () => {
      // Avatar dosya alanı eksik → 400 "No file provided" (controller:133-135).
      const user = await createUser(ctx.module, {
        email: "av-nofile@test.com",
      });
      const res = await request(server())
        .post("/api/media/upload/avatar")
        .set(authHeader(user))
        .expect(400);
      expect(res.body.message).toBe("No file provided");
    });

    scenario("MED-054", async () => {
      // İzolasyon: controller avatar folder'ını req.user.id'ye SABİTLER; herhangi bir
      // folder/query enjeksiyonu kabul edilmez (uploadAvatar query almaz). Kötücül query
      // yollansa da istek yine 201 ile geçer ve controller'ın hardcode ettiği folder kullanılır.
      // NOT: avatar ucu resize'ı ZORUNLU uygular ve sharp KURULU (bkz. HARNESS notu 2) → decode
      // edilebilir GERÇEK PNG (realPngBuffer) gerekir; fake tampon sharp'ta patlar → 400. Gerçek
      // key (dev/avatars/{userId}) storage STUB nedeniyle gözlemlenemez; burada guard'ın query'yi
      // yok saydığı (401/500 üretmediği, başka klasöre yazamadığı) doğrulanır.
      const user = await createUser(ctx.module, { email: "av-iso@test.com" });
      await request(server())
        .post("/api/media/upload/avatar?folder=../mehmet&bucket=documents")
        .set(authHeader(user))
        .attach("avatar", realPngBuffer(), {
          filename: "me.png",
          contentType: "image/png",
        })
        .expect(201);
    });
  });

  // ─────────────────────── Public URL (GET /api/media/public-url/*) ───────────────────────
  describe("GET /api/media/public-url/*", () => {
    scenario("MED-060", async () => {
      // Products key → 200 + { url }. Bucket key'in 2. segmentinden türetilir.
      const user = await createUser(ctx.module, { email: "pu-prod@test.com" });
      const res = await request(server())
        .get("/api/media/public-url/dev/products/product-images/abc-card.webp")
        .set(authHeader(user))
        .expect(200);
      expect(res.body.url).toBeTruthy();
    });

    scenario("MED-061", async () => {
      // Collections key → 200 (PUBLIC_BUCKETS içinde).
      const user = await createUser(ctx.module, { email: "pu-col@test.com" });
      const res = await request(server())
        .get("/api/media/public-url/dev/collections/covers/x.webp")
        .set(authHeader(user))
        .expect(200);
      expect(res.body.url).toBeTruthy();
    });

    scenario("MED-062", async () => {
      // Avatars key → 200 (PUBLIC_BUCKETS içinde).
      const user = await createUser(ctx.module, { email: "pu-av@test.com" });
      const res = await request(server())
        .get("/api/media/public-url/dev/avatars/uid/pic.jpg")
        .set(authHeader(user))
        .expect(200);
      expect(res.body.url).toBeTruthy();
    });

    scenario("MED-063", async () => {
      // Documents (fatura) → 400 "Bu içerik için herkese açık URL verilemez." (controller:170-172).
      const user = await createUser(ctx.module, { email: "pu-doc@test.com" });
      const res = await request(server())
        .get("/api/media/public-url/dev/documents/invoices/x.pdf")
        .set(authHeader(user))
        .expect(400);
      expect(res.body.message).toBe(
        "Bu içerik için herkese açık URL verilemez.",
      );
    });

    scenario("MED-064", async () => {
      // Tickets → 400 (PUBLIC değil).
      const user = await createUser(ctx.module, { email: "pu-tic@test.com" });
      const res = await request(server())
        .get("/api/media/public-url/dev/tickets/t.png")
        .set(authHeader(user))
        .expect(400);
      expect(res.body.message).toBe(
        "Bu içerik için herkese açık URL verilemez.",
      );
    });

    scenario("MED-065", async () => {
      // Manipülasyon: bucket 2. segmentten türetilir (client'a güvenilmez).
      // (1) products/dev/documents/... → 2. segment=dev → public değil → 400.
      const user = await createUser(ctx.module, { email: "pu-manip@test.com" });
      await request(server())
        .get("/api/media/public-url/products/dev/documents/invoice.pdf")
        .set(authHeader(user))
        .expect(400);
      // (2) dev/documents/products/... → 2. segment=documents → 400.
      await request(server())
        .get("/api/media/public-url/dev/documents/products/x.pdf")
        .set(authHeader(user))
        .expect(400);
    });

    scenario("MED-080", async () => {
      // PUBLIC_BUCKETS doğrulaması: products/collections/avatars → 200; documents/tickets → 400.
      const user = await createUser(ctx.module, { email: "pu-list@test.com" });
      await request(server())
        .get("/api/media/public-url/dev/products/x.webp")
        .set(authHeader(user))
        .expect(200);
      await request(server())
        .get("/api/media/public-url/dev/collections/x.webp")
        .set(authHeader(user))
        .expect(200);
      await request(server())
        .get("/api/media/public-url/dev/avatars/x.jpg")
        .set(authHeader(user))
        .expect(200);
      await request(server())
        .get("/api/media/public-url/dev/documents/x.pdf")
        .set(authHeader(user))
        .expect(400);
      await request(server())
        .get("/api/media/public-url/dev/tickets/x.png")
        .set(authHeader(user))
        .expect(400);
    });

    scenario("MED-081", async () => {
      // Private içerik (fatura) public URL ucundan verilmez (400); presigned kanalı ayrıdır.
      const user = await createUser(ctx.module, { email: "pu-priv@test.com" });
      const res = await request(server())
        .get("/api/media/public-url/dev/documents/invoices/inv.pdf")
        .set(authHeader(user))
        .expect(400);
      expect(res.body.message).toBe(
        "Bu içerik için herkese açık URL verilemez.",
      );
    });
  });

  // ─────────────────────── Silme (DELETE /api/media/file/*) ───────────────────────
  // NOT: storage.deleteFile() STUB'da no-op → DB satırı SİLİNMEZ. Bu yüzden yalnız
  // yetki sonucu (200 success / 403 / 404) assert edilir; "satır gitti" gözlemlenmez.
  describe("DELETE /api/media/file/*", () => {
    scenario("MED-070", async () => {
      // Uploader kendi dosyasını siler → 200 { success:true }.
      const mehmet = await createUser(ctx.module, {
        email: "mehmet-del@test.com",
      });
      const file = await seedMediaFile({ uploaderId: mehmet.id });
      const res = await request(server())
        .delete("/api/media/file/" + file.key)
        .set(authHeader(mehmet))
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    scenario("MED-071", async () => {
      // Başkasının dosyası (IDOR) → 403 "Bu dosya üzerinde yetkiniz yok."
      const owner = await createUser(ctx.module, {
        email: "owner-del@test.com",
      });
      const ali = await createUser(ctx.module, { email: "ali-del@test.com" });
      const file = await seedMediaFile({ uploaderId: owner.id });
      const res = await request(server())
        .delete("/api/media/file/" + file.key)
        .set(authHeader(ali))
        .expect(403);
      expect(res.body.message).toBe("Bu dosya üzerinde yetkiniz yok.");
    });

    scenario("MED-072", async () => {
      // Admin başkasının dosyasını siler → 200 (jwt.strategy isAdmin'i DB adminUser'dan türetir).
      const owner = await createUser(ctx.module, {
        email: "owner2-del@test.com",
      });
      const admin = await createAdminUser(ctx.module, {
        email: "admin-del@test.com",
      });
      const file = await seedMediaFile({ uploaderId: owner.id });
      const res = await request(server())
        .delete("/api/media/file/" + file.key)
        .set(authHeader(admin))
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    scenario("MED-073", async () => {
      // Sahipsiz (uploaderId=null) dosya → normal kullanıcı silemez → 403.
      const mehmet = await createUser(ctx.module, {
        email: "mehmet-null@test.com",
      });
      const file = await seedMediaFile({ uploaderId: null });
      await request(server())
        .delete("/api/media/file/" + file.key)
        .set(authHeader(mehmet))
        .expect(403);
    });

    scenario("MED-074", async () => {
      // Olmayan key → 404 "Dosya bulunamadı." (media-access:42-44).
      const user = await createUser(ctx.module, { email: "del-404@test.com" });
      const res = await request(server())
        .delete("/api/media/file/dev/products/olmayan-xyz.webp")
        .set(authHeader(user))
        .expect(404);
      expect(res.body.message).toBe("Dosya bulunamadı.");
    });

    scenario("MED-076", async () => {
      // Yatay IDOR: aynı tier farklı kullanıcı → 403.
      const owner = await createUser(ctx.module, {
        email: "owner3-del@test.com",
      });
      const ahmet = await createUser(ctx.module, {
        email: "ahmet-del@test.com",
      });
      const file = await seedMediaFile({ uploaderId: owner.id });
      await request(server())
        .delete("/api/media/file/" + file.key)
        .set(authHeader(ahmet))
        .expect(403);
    });

    scenario("MED-077", async () => {
      // Seller/satıcı rolü yetki VERMEZ → başkasının dosyası → 403.
      const owner = await createUser(ctx.module, {
        email: "owner4-del@test.com",
      });
      const platform = await createUser(ctx.module, {
        email: "platform-del@test.com",
        isSeller: true,
        sellerType: "platform",
      });
      const file = await seedMediaFile({ uploaderId: owner.id });
      await request(server())
        .delete("/api/media/file/" + file.key)
        .set(authHeader(platform))
        .expect(403);
    });

    scenario("MED-078", async () => {
      // Wildcard tam yol (env-prefixli avatars key) → doğru key bulunur → 200 success.
      const ayse = await createUser(ctx.module, { email: "ayse-del@test.com" });
      const file = await seedMediaFile({
        uploaderId: ayse.id,
        bucket: "avatars",
        key: `dev/avatars/${ayse.id}/pic-${Math.random().toString(36).slice(2)}.jpg`,
      });
      const res = await request(server())
        .delete("/api/media/file/" + file.key)
        .set(authHeader(ayse))
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    scenario("MED-091", async () => {
      // media-access.service.spec.ts'in 6 dalını e2e'ye taşı: uploader→200, admin→200,
      // other→403, sahipsiz→403, notfound→404, no-identity(token'sız)→401 (guard).
      const uploader = await createUser(ctx.module, {
        email: "ma-uploader@test.com",
      });
      const other = await createUser(ctx.module, {
        email: "ma-other@test.com",
      });
      const admin = await createAdminUser(ctx.module, {
        email: "ma-admin@test.com",
      });

      // 1) uploader → 200
      const f1 = await seedMediaFile({ uploaderId: uploader.id });
      await request(server())
        .delete("/api/media/file/" + f1.key)
        .set(authHeader(uploader))
        .expect(200);
      // 2) admin → 200
      const f2 = await seedMediaFile({ uploaderId: uploader.id });
      await request(server())
        .delete("/api/media/file/" + f2.key)
        .set(authHeader(admin))
        .expect(200);
      // 3) other → 403
      const f3 = await seedMediaFile({ uploaderId: uploader.id });
      await request(server())
        .delete("/api/media/file/" + f3.key)
        .set(authHeader(other))
        .expect(403);
      // 4) sahipsiz (uploaderId=null) → 403
      const f4 = await seedMediaFile({ uploaderId: null });
      await request(server())
        .delete("/api/media/file/" + f4.key)
        .set(authHeader(other))
        .expect(403);
      // 5) notfound → 404
      await request(server())
        .delete("/api/media/file/dev/products/hic-yok.webp")
        .set(authHeader(other))
        .expect(404);
      // 6) no-identity (token'sız) → 401 (JwtAuthGuard; servis-içi ForbiddenException'a ulaşmaz)
      const f6 = await seedMediaFile({ uploaderId: uploader.id });
      await request(server())
        .delete("/api/media/file/" + f6.key)
        .expect(401);
    });

    scenario("MED-093", async () => {
      // Eşzamanlı çift silme (race): biri 200, diğeri 200 veya 404; 500 OLMAMALI.
      // NOT: storage.deleteFile no-op → DB satırı kalır; her iki istek de assertCanModify'da
      // satırı bulup 200 dönebilir. Kritik olan: 500 patlaması yok, süreç bozulmaz.
      const user = await createUser(ctx.module, { email: "race-del@test.com" });
      const file = await seedMediaFile({ uploaderId: user.id });
      const [a, b] = await Promise.all([
        request(server())
          .delete("/api/media/file/" + file.key)
          .set(authHeader(user)),
        request(server())
          .delete("/api/media/file/" + file.key)
          .set(authHeader(user)),
      ]);
      expect(a.status).not.toBe(500);
      expect(b.status).not.toBe(500);
      expect([a.status, b.status]).toContain(200);
      for (const s of [a.status, b.status]) {
        expect([200, 404]).toContain(s);
      }
    });
  });

  // ─────────────────────── Moderation fail-open (AI kapalı) ───────────────────────
  describe("Moderation fail-open", () => {
    scenario("MED-104", async () => {
      // AI moderation KAPALI (AI_MODERATION_ENABLED='false') → assertImageClean no-op:
      // engelleme yok, moderation_events yazılmaz → avatar yükleme 201.
      // NOT: avatar ucu resize'ı ZORUNLU uygular ve sharp KURULU (bkz. HARNESS notu 2) →
      // fail-open'ın 201 ürettiğini doğrulamak için decode edilebilir GERÇEK PNG gerekir;
      // fake tampon sharp'ta patlayıp 400 verir → moderasyon dalını değil sharp'ı test ederdi.
      const user = await createUser(ctx.module, { email: "mod-off@test.com" });
      await request(server())
        .post("/api/media/upload/avatar")
        .set(authHeader(user))
        .attach("avatar", realPngBuffer(), {
          filename: "a.png",
          contentType: "image/png",
        })
        .expect(201);
      const prisma = getPrisma();
      expect(await prisma.moderationEvent.count()).toBe(0);
    });

    scenario("MED-105", async () => {
      // Moderation servisi erişilemez (fail-open): AI null → verdict?.decision==='flag' false
      // → engelleme yok. Test ortamında enabled=false olduğundan çağrı yapılmaz; net sonuç
      // aynıdır: 201 + moderation_events yazılmaz.
      // NOT: MED-104 ile aynı gerekçe — avatar zorunlu resize + sharp KURULU → GERÇEK PNG gerekir.
      const user = await createUser(ctx.module, {
        email: "mod-timeout@test.com",
      });
      await request(server())
        .post("/api/media/upload/avatar")
        .set(authHeader(user))
        .attach("avatar", realPngBuffer(), {
          filename: "a.png",
          contentType: "image/png",
        })
        .expect(201);
      const prisma = getPrisma();
      expect(await prisma.moderationEvent.count()).toBe(0);
    });
  });

  // ─────────────────────── SKIP — ortam/harness kısıtları ───────────────────────
  // Ürün-görseli happy path'leri (2 varyant / tier limitleri / temp klasör): sharp KURULU
  // (bkz. HARNESS notu 2) → gerçek bir PNG ile uploadProductImageVariants çalışır, AMA storage
  // TAM STUB'lanmış (create-app.ts:89-126): uploadFile sabit key ('test/file.bin') döner ve
  // getPublicAssetUrl her zaman `https://test-cdn.invalid/...` verir. Bu yüzden senaryonun
  // GERÇEK exp'i — cardKey/detailKey `.../product-images/{id}/…-card|detail.webp` şablonu,
  // cardUrl/detailUrl S3_PUBLIC_BASE_URL öneki, media_files'e EK kayıt oluşmaması (skipMediaFile)
  // — API'den GÖZLEMLENEMEZ. (Fake jpeg yollanırsa sharp decode hatası try/catch olmadan 500
  // verir; bkz. MED-102 notu.) Anlamlı bir yeşil üretilemeyeceğinden gerekçeli skip.
  scenario.skip(
    "MED-040",
    'Ürün varyantı happy path (201, [{cardKey,detailKey,cardUrl,detailUrl}]): sharp KURULU ama storage STUB → uploadFile sabit key ("test/file.bin") döner, getPublicAssetUrl sabit test-cdn URL verir; gerçek variant key şablonu, S3_PUBLIC_BASE_URL öneki ve skipMediaFile (media_files ek kayıt yok) davranışı API üzerinden gözlemlenemez.',
  );
  scenario.skip(
    "MED-042",
    "FREE=3 tam sınır 3 resim kabul (201, 3 varyant çifti): sharp KURULU ama storage STUB variant key/URL şablonunu gözlemletmez (bkz. MED-040); limit dalı MED-041'de zaten doğrulanır.",
  );
  scenario.skip(
    "MED-043",
    "Business=15 tam 15 resim kabul (201, 15 sonuç): sharp KURULU ama storage STUB variant key/URL şablonunu gözlemletmez (bkz. MED-040).",
  );
  scenario.skip(
    "MED-048",
    'productId yokken temp klasör (201, cardKey .../product-images/temp/…): sharp KURULU ama storage STUB uploadFile sabit "test/file.bin" döndüğünden "temp" folder\'lı gerçek key gözlemlenemez (bkz. MED-040).',
  );

  // Moderation KAPALI (AI_MODERATION_ENABLED='false') → NSFW engelleme tetiklenemez;
  // moderation_events'e 'blocked' yazan dallar API'den çalıştırılamaz.
  scenario.skip(
    "MED-049",
    "Ürün görseli NSFW engeli + moderation_events(blocked): AI_MODERATION_ENABLED=false → assertImageClean no-op; NSFW reddi ve blocked event üretilemez. (Ayrıca variant happy-path storage STUB nedeniyle zaten gözlemlenemez; bkz. MED-040.)",
  );
  scenario.skip(
    "MED-055",
    "Avatar NSFW engeli + moderation_events(blocked): AI kapalı → assertImageClean no-op; NSFW reddi/blocked event üretilemez.",
  );

  // Storage TAM STUB → aşağıdaki gözlemler API'den yapılamaz.
  scenario.skip(
    "MED-067",
    'S3_PUBLIC_BASE_URL boşken {url:""}: StorageService stub getPublicAssetUrl her zaman `https://test-cdn.invalid/...` döner (boş değil) → boş-URL dalı gözlemlenemez.',
  );
  scenario.skip(
    "MED-092",
    'Aynı dosyayı iki kez silme idempotency (1.→200, 2.→404): storage.deleteFile stub NO-OP → MediaFile satırı silinmez → ikinci DELETE yine 200 döner; "404" gözlemlenemez.',
  );
  scenario.skip(
    "MED-094",
    "Eşzamanlı çoklu yükleme key çakışmaması (5 farklı key): upload stub sabit key döner ve MediaFile satırı yazmaz → distinct-key/@unique doğrulaması gözlemlenemez.",
  );
  scenario.skip(
    "MED-095",
    "Aynı ad farklı kullanıcı izolasyonu (2 ayrı key + uploaderId): upload stub sabit key döndüğü ve MediaFile satırı yazmadığı için key/uploaderId gözlemlenemez.",
  );
  scenario.skip(
    "MED-100",
    'S3 erişilemezken yükleme reddi (400): stub isStorageAvailable()=>true ve uploadFile hiç "unavailable" fırlatmaz → S3-down dalı simüle edilemez.',
  );
  scenario.skip(
    "MED-101",
    "Presigned download hatasında url undefined (201): stub getPresignedDownloadUrl hiç fırlatmaz, hep URL döner → catch dalı tetiklenemez.",
  );

  // Saf dokümantasyon / infra / cross-client parite — API assertion değil.
  scenario.skip(
    "MED-082",
    "S3 bucket-policy ↔ PUBLIC_BUCKETS tutarlılığı: gerçek S3 policy incelemesi gerektiren infra/doküman doğrulaması; API üzerinden assert edilemez (PUBLIC_BUCKETS ayrıca MED-080’de kod tarafında doğrulanır).",
  );
  scenario.skip(
    "MED-110",
    "Web ürün görseli yükleme paritesi: apps/web istemci kodu/Network incelemesi (FormData alan=images, multipart); saf-UI/istemci paritesi, API-e2e kapsamı dışı.",
  );
  scenario.skip(
    "MED-111",
    "Mobil ürün görseli paritesi harici istemci kapsamı; API yalnız alan=images kontratını tanımlar.",
  );
  scenario.skip(
    "MED-112",
    "Web vs Mobile avatar paritesi (alan=avatar): iki istemci kodu incelemesi; saf-istemci paritesi, API-e2e kapsamı dışı.",
  );
  scenario.skip(
    "MED-113",
    "Mesaj/iade kanıt paritesi (folder=messages|reviews, alan=file): web+mobile istemci kodu paritesi; saf-istemci, API-e2e kapsamı dışı.",
  );
});
