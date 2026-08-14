import * as request from "supertest";
import { AdminRole } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import {
  createUser,
  createAdminUser,
  authHeader,
} from "../factories/user.factory";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const BRAND_HEADERS = [
  "ad",
  "aciklama",
  "web_sitesi",
  "ulke",
  "kurulus_yili",
  "sira",
  "aktif",
];
const CAR_MODEL_HEADERS = [
  "marka",
  "ad",
  "aciklama",
  "baslangic_yili",
  "bitis_yili",
  "sira",
  "aktif",
];

async function workbook(
  sheetName: string,
  headers: string[],
  rows: unknown[][],
): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe("Admin catalog bulk import (E2E)", () => {
  let ctx: E2ETestApp;

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
  });

  describe("izin matrisi", () => {
    // Bu bloğun tamamı, içe aktarma uçlarının PARAMETRELİ bir yola
    // (/admin/catalog/imports/:resource) taşınmasına karşı kilittir: RolesGuard
    // izni URL'in ilk segmentinden çözdüğü için böyle bir yol moderator ve
    // admin'e 403 verirdi.
    it("moderator marka içe aktarma şemasını okuyabilir", async () => {
      const moderator = await createAdminUser(ctx.module, {
        role: AdminRole.moderator,
      });

      const res = await request(ctx.app.getHttpServer())
        .get("/api/admin/brands/import-schema")
        .set(authHeader(moderator))
        .expect(200);

      expect(res.body.resource).toBe("brands");
      expect(res.body.columns.length).toBeGreaterThan(0);
    });

    it("moderator araç modeli içe aktarımı yapabilir", async () => {
      const moderator = await createAdminUser(ctx.module, {
        role: AdminRole.moderator,
      });

      await request(ctx.app.getHttpServer())
        .post("/api/admin/car-models/bulk-import")
        .set(authHeader(moderator))
        .attach(
          "workbook",
          await workbook("Modeller", CAR_MODEL_HEADERS, [
            ["Test Brand", "Charger"],
          ]),
          { filename: "modeller.xlsx", contentType: XLSX_MIME },
        )
        .expect(200);
    });

    it("admin olmayan kullanıcı içe aktaramaz", async () => {
      const regular = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post("/api/admin/brands/bulk-import")
        .set(authHeader(regular))
        .attach(
          "workbook",
          await workbook("Markalar", BRAND_HEADERS, [["Hot Wheels"]]),
          { filename: "markalar.xlsx", contentType: XLSX_MIME },
        );

      expect([401, 403]).toContain(res.status);
    });

    it("kimliksiz istek reddedilir", async () => {
      const res = await request(ctx.app.getHttpServer()).get(
        "/api/admin/brands/import-schema",
      );

      expect([401, 403]).toContain(res.status);
    });
  });

  describe("marka içe aktarma", () => {
    it("geçerli dosyadaki markaları oluşturur", async () => {
      const admin = await createAdminUser(ctx.module, {
        role: AdminRole.admin,
      });

      const res = await request(ctx.app.getHttpServer())
        .post("/api/admin/brands/bulk-import")
        .set(authHeader(admin))
        .attach(
          "workbook",
          await workbook("Markalar", BRAND_HEADERS, [
            [
              "Hot Wheels",
              "Açıklama",
              "https://hw.com",
              "ABD",
              1968,
              1,
              "Evet",
            ],
            ["Öz Çelik"],
          ]),
          { filename: "markalar.xlsx", contentType: XLSX_MIME },
        )
        .expect(200);

      expect(res.body).toMatchObject({ resource: "brands", createdCount: 2 });

      const created = await getPrisma().brand.findMany({
        where: { name: { in: ["Hot Wheels", "Öz Çelik"] } },
        orderBy: { name: "asc" },
      });
      expect(created.map((brand) => brand.slug)).toEqual([
        "hot-wheels",
        // Türkçe harfler çevrilir, silinmez (eski davranış "z-elik" üretiyordu).
        "oz-celik",
      ]);
    });

    it("aynı dosya ikinci kez yüklenince hiçbir kayıt oluşturmaz", async () => {
      const admin = await createAdminUser(ctx.module, {
        role: AdminRole.admin,
      });
      const file = await workbook("Markalar", BRAND_HEADERS, [["Hot Wheels"]]);

      await request(ctx.app.getHttpServer())
        .post("/api/admin/brands/bulk-import")
        .set(authHeader(admin))
        .attach("workbook", file, {
          filename: "markalar.xlsx",
          contentType: XLSX_MIME,
        })
        .expect(200);

      const res = await request(ctx.app.getHttpServer())
        .post("/api/admin/brands/bulk-import")
        .set(authHeader(admin))
        .attach("workbook", file, {
          filename: "markalar.xlsx",
          contentType: XLSX_MIME,
        })
        .expect(400);

      // Admin arayüzü hata listesini `body.errors` altında arıyor.
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors[0]).toContain("zaten kayıtlı");
      expect(
        await getPrisma().brand.count({ where: { slug: "hot-wheels" } }),
      ).toBe(1);
    });

    it("tek satır hatalıysa geçerli satırları da yazmaz", async () => {
      const admin = await createAdminUser(ctx.module, {
        role: AdminRole.admin,
      });

      const res = await request(ctx.app.getHttpServer())
        .post("/api/admin/brands/bulk-import")
        .set(authHeader(admin))
        .attach(
          "workbook",
          await workbook("Markalar", BRAND_HEADERS, [
            ["Matchbox"],
            [null, "Ad yok"],
          ]),
          { filename: "markalar.xlsx", contentType: XLSX_MIME },
        )
        .expect(400);

      expect(res.body.errors[0]).toContain("3. satır");
      expect(
        await getPrisma().brand.count({ where: { name: "Matchbox" } }),
      ).toBe(0);
    });

    it("denetim kaydını dosya başına tek satır olarak yazar", async () => {
      const admin = await createAdminUser(ctx.module, {
        role: AdminRole.admin,
      });

      await request(ctx.app.getHttpServer())
        .post("/api/admin/brands/bulk-import")
        .set(authHeader(admin))
        .attach(
          "workbook",
          await workbook("Markalar", BRAND_HEADERS, [
            ["Hot Wheels"],
            ["Matchbox"],
            ["Bburago"],
          ]),
          { filename: "markalar.xlsx", contentType: XLSX_MIME },
        )
        .expect(200);

      const logs = await getPrisma().auditLog.findMany({
        where: { action: "brand_bulk_import" },
      });
      expect(logs).toHaveLength(1);
    });
  });

  describe("araç modeli içe aktarma", () => {
    it("bilinmeyen markayı yönlendirici hatayla reddeder", async () => {
      const admin = await createAdminUser(ctx.module, {
        role: AdminRole.admin,
      });

      const res = await request(ctx.app.getHttpServer())
        .post("/api/admin/car-models/bulk-import")
        .set(authHeader(admin))
        .attach(
          "workbook",
          await workbook("Modeller", CAR_MODEL_HEADERS, [
            ["Bilinmeyen Marka", "Charger"],
          ]),
          { filename: "modeller.xlsx", contentType: XLSX_MIME },
        )
        .expect(400);

      expect(res.body.errors[0]).toContain("Markalar ekranından ekleyin");
    });

    it("modeli marka slug'ı önekiyle kaydeder", async () => {
      const admin = await createAdminUser(ctx.module, {
        role: AdminRole.admin,
      });

      await request(ctx.app.getHttpServer())
        .post("/api/admin/car-models/bulk-import")
        .set(authHeader(admin))
        .attach(
          "workbook",
          await workbook("Modeller", CAR_MODEL_HEADERS, [
            ["Test Brand", "Challenger R/T", null, 1970, 1974],
          ]),
          { filename: "modeller.xlsx", contentType: XLSX_MIME },
        )
        .expect(200);

      const model = await getPrisma().carModel.findFirst({
        where: { name: "Challenger R/T" },
      });
      expect(model?.slug).toBe("test-brand-challenger-r-t");
      expect(model?.yearStart).toBe(1970);
    });
  });

  describe("şablon indirme", () => {
    it("ayrıştırıcının beklediği başlıklarla xlsx döner", async () => {
      const admin = await createAdminUser(ctx.module, {
        role: AdminRole.admin,
      });

      const res = await request(ctx.app.getHttpServer())
        .get("/api/admin/manufacturers/import-template")
        .set(authHeader(admin))
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers["content-type"]).toContain("spreadsheetml");
      expect(res.headers["content-disposition"]).toContain(".xlsx");

      const book = new ExcelJS.Workbook();
      await book.xlsx.load(res.body);
      expect(book.getWorksheet("Ureticiler")).toBeDefined();
    });
  });
});
