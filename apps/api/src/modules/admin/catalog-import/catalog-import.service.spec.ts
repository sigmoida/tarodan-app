import { BadRequestException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { CatalogImportService } from "./catalog-import.service";
import { CATALOG_IMPORT_SPECS } from "./catalog-import.specs";
import {
  CATALOG_IMPORT_LIMITS,
  type CatalogImportResource,
} from "./catalog-import.types";

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

const DODGE = {
  id: "85defe79-172d-4979-aac3-b5100e156ba0",
  name: "Dodge",
  slug: "dodge",
  isActive: true,
};
const PASSIVE_BRAND = {
  id: "2d69a09e-9023-477e-8324-79ad0dff2e70",
  name: "Tofaş",
  slug: "tofas",
  isActive: false,
};

async function buildFile(
  sheetName: string,
  headers: string[],
  rows: unknown[][],
  options: { formula?: boolean; filename?: string; mimetype?: string } = {},
): Promise<Express.Multer.File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  if (options.formula) {
    sheet.getCell("A2").value = { formula: 'CONCAT("Hot"," Wheels")' } as any;
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    fieldname: "workbook",
    originalname: options.filename ?? "katalog.xlsx",
    encoding: "7bit",
    mimetype: options.mimetype ?? XLSX_MIME,
    size: buffer.byteLength,
    buffer,
    destination: "",
    filename: "",
    path: "",
    stream: undefined as never,
  };
}

const brandFile = (rows: unknown[][], options = {}) =>
  buildFile("Markalar", BRAND_HEADERS, rows, options);
const carModelFile = (rows: unknown[][]) =>
  buildFile("Modeller", CAR_MODEL_HEADERS, rows);

/** `import()` her zaman 400 atmalı; hata listesini çıkarır. */
async function importErrors(run: () => Promise<unknown>): Promise<string[]> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse() as {
      errors?: string[];
      message?: string;
    };
    return body.errors ?? [body.message ?? String(error)];
  }
  throw new Error("içe aktarma hata vermesi beklenirken başarılı oldu");
}

describe("CatalogImportService", () => {
  let prisma: any;
  let cache: { delPattern: jest.Mock };
  let audit: { createAuditLog: jest.Mock };
  let service: CatalogImportService;

  beforeEach(() => {
    const delegate = () => ({
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    });
    prisma = {
      brand: delegate(),
      manufacturer: delegate(),
      carModel: delegate(),
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    cache = { delPattern: jest.fn().mockResolvedValue(0) };
    audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    service = new CatalogImportService(
      prisma as any,
      cache as any,
      audit as any,
    );
  });

  describe("dosya ve sayfa doğrulaması", () => {
    it("xlsx olmayan dosyayı reddeder", async () => {
      const file = await brandFile([["Hot Wheels"]], {
        filename: "markalar.csv",
        mimetype: "text/csv",
      });

      await expect(service.import("admin-1", "brands", file)).rejects.toThrow(
        "Yalnızca .xlsx",
      );
    });

    it("MIME türü boş ya da octet-stream olan .xlsx dosyasını kabul eder", async () => {
      // Office kaydı olmayan sistemlerde tarayıcı `File.type`'ı boş bırakır ve
      // parçayı octet-stream olarak gönderir; katı MIME eşitliği, kullanıcının
      // gerçekten .xlsx seçtiği durumda çelişkili bir hata üretirdi.
      for (const mimetype of ["", "application/octet-stream"]) {
        const file = await brandFile([["Hot Wheels"]], { mimetype });
        await expect(
          service.import("admin-1", "brands", file),
        ).resolves.toMatchObject({ createdCount: 1 });
      }
    });

    it("büyük harfle yazılmış başlık satırını tanır", async () => {
      // Türkçe yerelde küçültme "I" harfini "ı" yapar; "KURULUS_YILI" hiçbir
      // anahtarla eşleşmez ve gözle görülür duran sütun "eksik" raporlanırdı.
      const file = await buildFile(
        "Markalar",
        BRAND_HEADERS.map((header) => header.toUpperCase()),
        [["Hot Wheels", null, null, null, 1968]],
      );

      await expect(
        service.import("admin-1", "brands", file),
      ).resolves.toMatchObject({ createdCount: 1 });
      expect(prisma.brand.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ foundedYear: 1968 })],
      });
    });

    it("beklenen sayfa yoksa hata verir", async () => {
      const file = await buildFile("YanlisSayfa", BRAND_HEADERS, [
        ["Hot Wheels"],
      ]);

      await expect(service.import("admin-1", "brands", file)).rejects.toThrow(
        "'Markalar' sayfası",
      );
    });

    it("eksik sütunları tek hatada bildirir", async () => {
      const file = await buildFile(
        "Markalar",
        ["ad", "ulke"],
        [["Hot Wheels"]],
      );

      await expect(service.import("admin-1", "brands", file)).rejects.toThrow(
        /Excel sütunları eksik/,
      );
    });

    it("formül içeren dosyayı reddeder", async () => {
      // ExcelJS formülün önbelleklenmiş sonucunu okur: dosyayı hazırlayan
      // kişinin gördüğünden farklı bir değer içe aktarılabilirdi.
      const file = await brandFile([["Hot Wheels"]], { formula: true });

      await expect(service.import("admin-1", "brands", file)).rejects.toThrow(
        "Formül içeren Excel",
      );
    });

    it("veri satırı yoksa hata verir", async () => {
      const file = await brandFile([]);

      await expect(service.import("admin-1", "brands", file)).rejects.toThrow(
        "veri satırı yok",
      );
    });

    it("satır sınırını aşan dosyayı reddeder", async () => {
      const rows = Array.from(
        { length: CATALOG_IMPORT_LIMITS.maxRows + 1 },
        (_, index) => [`Marka ${index}`],
      );
      const file = await brandFile(rows);

      await expect(service.import("admin-1", "brands", file)).rejects.toThrow(
        `en fazla ${CATALOG_IMPORT_LIMITS.maxRows} satır`,
      );
    });
  });

  describe("satır doğrulaması", () => {
    it("zorunlu alan boşsa satır numarasıyla bildirir", async () => {
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([[null, "Açıklama var, ad yok"], ["Matchbox"]]),
        ),
      );

      expect(errors).toEqual(['2. satır: "ad" zorunludur']);
    });

    it("tamamen boş satırları yok sayar", async () => {
      // Şablonun altında kalan biçimlendirilmiş boş satırlar hata üretmemeli.
      const result = await service.import(
        "admin-1",
        "brands",
        await brandFile([["Hot Wheels"], [], ["Matchbox"]]),
      );

      expect(result.createdCount).toBe(2);
    });

    it("tüm hatalı satırları tek seferde toplar", async () => {
      // Kullanıcı dosyayı bir turda düzeltebilsin: ilk hatada durmayız.
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([
            [null, "Ad yok"],
            ["Matchbox", null, null, null, "bin dokuz yüz"],
            ["Bburago", null, null, null, 1974, "çok"],
          ]),
        ),
      );

      expect(errors).toHaveLength(3);
      expect(errors[0]).toContain("2. satır");
      expect(errors[1]).toContain("3. satır");
      expect(errors[2]).toContain("4. satır");
    });

    it("aralık dışı yılı reddeder", async () => {
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([["Matchbox", null, null, null, 1500]]),
        ),
      );

      expect(errors[0]).toContain("kurulus_yili");
    });

    it("uzunluk sınırını aşan metni reddeder", async () => {
      // Şemada alanlar sınırsız `text`; sınır olmasa 50 KB'lık hücre girebilir.
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([["A".repeat(121)]]),
        ),
      );

      expect(errors[0]).toContain("en fazla 120 karakter");
    });

    it("geçersiz evet/hayır değerini reddeder", async () => {
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([
            ["Matchbox", null, null, null, null, null, "belki"],
          ]),
        ),
      );

      expect(errors[0]).toContain("aktif");
    });

    it("ondalık sayıyı satır hatası yapar, 500'e düşmez", async () => {
      // Sütunların hepsi Prisma `Int`; ondalık değer buradan geçseydi
      // createMany PrismaClientValidationError atar ve kullanıcı satır listesi
      // yerine genel bir sunucu hatası görürdü.
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([["Matchbox", null, null, null, null, "1,5"]]),
        ),
      );

      expect(errors[0]).toContain("tam sayı olmalıdır");
      expect(prisma.brand.createMany).not.toHaveBeenCalled();
    });

    it("32-bit tamsayıyı aşan değeri reddeder", async () => {
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([["Matchbox", null, null, null, null, 99999999999]]),
        ),
      );

      expect(errors[0]).toContain("tam sayı olmalıdır");
    });

    it("slug üretilemeyen adı reddeder", async () => {
      const errors = await importErrors(async () =>
        service.import("admin-1", "brands", await brandFile([["!!!"]])),
      );

      expect(errors[0]).toContain("slug");
    });
  });

  describe("tekillik", () => {
    it("dosya içindeki aynı adı yakalar", async () => {
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([["Hot Wheels"], ["hot wheels"]]),
        ),
      );

      expect(errors[0]).toContain("dosyada 2. satırda zaten var");
    });

    it("farklı yazılıp aynı adrese düşen adları yakalar", async () => {
      // "Şahin" ve "Sahin" aynı slug'a iner; DB'de slug @unique olduğu için
      // ikisi birden kaydedilemez — kullanıcıya net sebep gösterilir.
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([["Şahin"], ["Sahin"]]),
        ),
      );

      expect(errors[0]).toContain("aynı adresi");
    });

    it("veritabanında zaten olan kaydı hata sayar, atlamaz", async () => {
      prisma.brand.findMany.mockResolvedValue([
        { name: "Hot Wheels", slug: "hot-wheels" },
      ]);

      const errors = await importErrors(async () =>
        service.import("admin-1", "brands", await brandFile([["Hot Wheels"]])),
      );

      expect(errors[0]).toContain("zaten kayıtlı");
      expect(prisma.brand.createMany).not.toHaveBeenCalled();
    });

    it("biçim hatası ile mevcut kaydı aynı turda birlikte bildirir", async () => {
      // Kullanıcı iki tur dönmesin: önce biçimi düzeltip yeniden yükledikten
      // sonra "zaten kayıtlı" ile geri gelmek gereksiz bir gidiş-geliş.
      prisma.brand.findMany.mockResolvedValue([
        { name: "Hot Wheels", slug: "hot-wheels" },
      ]);

      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([[null, "Ad yok"], ["Hot Wheels"]]),
        ),
      );

      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('"ad" zorunludur');
      expect(errors[1]).toContain("zaten kayıtlı");
    });

    it("büyük/küçük harf farkına rağmen mevcut adı yakalar", async () => {
      prisma.brand.findMany.mockResolvedValue([
        { name: "HOT WHEELS", slug: "hot-wheels" },
      ]);

      const errors = await importErrors(async () =>
        service.import("admin-1", "brands", await brandFile([["Hot Wheels"]])),
      );

      expect(errors[0]).toContain("zaten kayıtlı");
    });
  });

  describe("hepsi ya da hiç", () => {
    it("tek satır hatalıysa hiçbir kayıt oluşturmaz", async () => {
      await importErrors(async () =>
        service.import(
          "admin-1",
          "brands",
          await brandFile([["Hot Wheels"], [null, "Ad yok"], ["Matchbox"]]),
        ),
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.brand.createMany).not.toHaveBeenCalled();
      expect(audit.createAuditLog).not.toHaveBeenCalled();
      expect(cache.delPattern).not.toHaveBeenCalled();
    });
  });

  describe("eşzamanlı yükleme yarışı", () => {
    it("P2002'yi 500 yerine hata listesine çevirir", async () => {
      // Doğrulama ile yazma arasında başka bir yükleme aynı kaydı oluşturursa
      // ham Prisma hatası kullanıcıya anlamsız bir sunucu hatası olarak dönerdi.
      prisma.brand.createMany.mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
      );

      const errors = await importErrors(async () =>
        service.import("admin-1", "brands", await brandFile([["Hot Wheels"]])),
      );

      expect(errors[0]).toContain("başka bir işlemle oluşturuldu");
      expect(audit.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("başarılı içe aktarma", () => {
    it("markaları tek transaction ve tek createMany ile yazar", async () => {
      const result = await service.import(
        "admin-1",
        "brands",
        await brandFile([
          ["Hot Wheels", "Açıklama", "https://hw.com", "ABD", 1968, 5, "Hayır"],
          ["Matchbox"],
        ]),
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.brand.createMany).toHaveBeenCalledWith({
        data: [
          {
            name: "Hot Wheels",
            slug: "hot-wheels",
            description: "Açıklama",
            website: "https://hw.com",
            country: "ABD",
            foundedYear: 1968,
            sortOrder: 5,
            isActive: false,
          },
          {
            name: "Matchbox",
            slug: "matchbox",
            description: null,
            website: null,
            country: null,
            foundedYear: null,
            sortOrder: 0,
            isActive: true,
          },
        ],
      });
      expect(result).toEqual({
        resource: "brands",
        createdCount: 2,
        names: ["Hot Wheels", "Matchbox"],
      });
    });

    it("dosya başına TEK denetim kaydı yazar", async () => {
      // Satır başına kayıt, 200 satırlık bir dosyada denetim günlüğünü boğardı.
      await service.import(
        "admin-1",
        "brands",
        await brandFile([["Hot Wheels"], ["Matchbox"], ["Bburago"]]),
      );

      expect(audit.createAuditLog).toHaveBeenCalledTimes(1);
      const [adminId, action, entity, entityId, oldValue, newValue] =
        audit.createAuditLog.mock.calls[0];
      expect({ adminId, action, entity, oldValue }).toEqual({
        adminId: "admin-1",
        action: "brand_bulk_import",
        entity: "Brand",
        oldValue: null,
      });
      expect(entityId).toEqual(expect.any(String));
      expect(newValue.createdCount).toBe(3);
      expect(newValue.names).toHaveLength(3);
    });

    it("marka cache'ini temizler", async () => {
      await service.import("admin-1", "brands", await brandFile([["Ford"]]));

      expect(cache.delPattern).toHaveBeenCalledWith("brands:*");
    });

    it("üretici içe aktarımında cache çağrısı yapmaz", async () => {
      // Üretici tarafında public cache yok; gereksiz Redis çağrısı üretmeyiz.
      await service.import(
        "admin-1",
        "manufacturers",
        await buildFile("Ureticiler", BRAND_HEADERS, [["Mattel"]]),
      );

      expect(prisma.manufacturer.createMany).toHaveBeenCalled();
      expect(cache.delPattern).not.toHaveBeenCalled();
    });
  });

  describe("araç modeli", () => {
    beforeEach(() => {
      prisma.brand.findMany.mockResolvedValue([DODGE, PASSIVE_BRAND]);
    });

    it("markayı ad, slug veya id ile çözer ve slug'ı marka ile önekler", async () => {
      await service.import(
        "admin-1",
        "car-models",
        await carModelFile([
          ["Dodge", "Challenger R/T"],
          ["dodge", "Charger"],
          [DODGE.id, "Viper"],
        ]),
      );

      expect(prisma.carModel.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            brandId: DODGE.id,
            name: "Challenger R/T",
            slug: "dodge-challenger-r-t",
          }),
          expect.objectContaining({ slug: "dodge-charger" }),
          expect.objectContaining({ slug: "dodge-viper" }),
        ]),
      });
    });

    it("bilinmeyen markada yönlendirici hata verir", async () => {
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "car-models",
          await carModelFile([["Dodgee", "Charger"]]),
        ),
      );

      expect(errors[0]).toContain("Markalar ekranından ekleyin");
      expect(prisma.carModel.createMany).not.toHaveBeenCalled();
    });

    it("pasif markayı kabul eder", async () => {
      // Marka sonradan aktifleştirilebilir; modeli reddetmek gereksiz engel.
      await service.import(
        "admin-1",
        "car-models",
        await carModelFile([["Tofaş", "Şahin"]]),
      );

      expect(prisma.carModel.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            brandId: PASSIVE_BRAND.id,
            slug: "tofas-sahin",
          }),
        ],
      });
    });

    it("başlangıç yılı bitiş yılından büyükse reddeder", async () => {
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "car-models",
          await carModelFile([["Dodge", "Charger", null, 1974, 1970]]),
        ),
      );

      expect(errors[0]).toContain("büyük olamaz");
    });

    it("aynı markadaki aynı modeli dosya içinde yakalar", async () => {
      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "car-models",
          await carModelFile([
            ["Dodge", "Charger"],
            ["dodge", "charger"],
          ]),
        ),
      );

      expect(errors[0]).toContain("zaten var");
    });

    it("aynı markada aynı adlı mevcut modeli slug farklı olsa da yakalar", async () => {
      // Eski kayıtların slug'ı bozuk üreteçle yazılmış olabilir ("tofa-ahin");
      // yalnız slug'a bakmak, tekil ekleme yolunun (brandId + ad) reddettiği
      // mükerrer modeli içe aktarmadan geçirirdi.
      prisma.carModel.findMany.mockResolvedValue([
        { brandId: DODGE.id, name: "Charger", slug: "dodge-charger-eski" },
      ]);

      const errors = await importErrors(async () =>
        service.import(
          "admin-1",
          "car-models",
          await carModelFile([["Dodge", "charger"]]),
        ),
      );

      expect(errors[0]).toContain("zaten kayıtlı");
      expect(prisma.carModel.createMany).not.toHaveBeenCalled();
    });

    it("farklı markalardaki aynı model adını çakışma saymaz", async () => {
      // Tekillik markaya göredir; slug öneki bunu zaten ayırır.
      prisma.brand.findMany.mockResolvedValue([
        DODGE,
        { ...PASSIVE_BRAND, name: "Ford", slug: "ford", isActive: true },
      ]);

      await service.import(
        "admin-1",
        "car-models",
        await carModelFile([
          ["Dodge", "Charger"],
          ["Ford", "Charger"],
        ]),
      );

      expect(prisma.carModel.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ slug: "dodge-charger" }),
          expect.objectContaining({ slug: "ford-charger" }),
        ]),
      });
    });
  });

  describe("getSchema", () => {
    it("her kaynak için kolonları ve limitleri döner", () => {
      const resources: CatalogImportResource[] = [
        "brands",
        "manufacturers",
        "car-models",
      ];

      for (const resource of resources) {
        const schema = service.getSchema(resource);
        expect(schema.resource).toBe(resource);
        expect(schema.sheetName).toBe(CATALOG_IMPORT_SPECS[resource].sheetName);
        expect(schema.columns).toBe(CATALOG_IMPORT_SPECS[resource].columns);
        expect(schema.limits).toBe(CATALOG_IMPORT_LIMITS);
        expect(schema.columns.some((column) => column.required)).toBe(true);
      }
    });

    it("logo ve slug kolonlarını içermez", async () => {
      // Logo S3 anahtarı gerektirir, slug ad'dan türetilir; ikisi de elle
      // girilirse elle ekleme ile içe aktarma ayrışır.
      for (const spec of Object.values(CATALOG_IMPORT_SPECS)) {
        const keys = spec.columns.map((column) => column.key);
        expect(keys).not.toContain("logo");
        expect(keys).not.toContain("slug");
      }
    });
  });
});
