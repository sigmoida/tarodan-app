import { BadRequestException } from "@nestjs/common";
import { AdminMediaService } from "./admin-media.service";

/**
 * Faz 3 — Admin Medya tarayıcısı: bucket klasörleri UI'dan takip edilebilir.
 *  - Klasör görünümü storage.listFolder'dan (delimiter'lı S3 listelemesi).
 *  - publicUrl YALNIZ public köklerde döner (messages/documents/tickets private —
 *    admin ekranında önizlenmez, "private" rozeti alır).
 *  - Kullanım eşlemesi: her dosya hangi kayda bağlı (ürün/koleksiyon/üretici/
 *    avatar/yükleme) — sahipsiz dosyalar boş kalır ve ekranda ayırt edilir.
 *  - Prefix sanitizasyonu: ".." gezinmesi reddedilir.
 */

function makeHarness(opts: {
  folders?: string[];
  files?: Array<{ key: string; size: number; lastModified: Date }>;
  productImage?: any;
  collection?: any;
  manufacturer?: any;
  user?: any;
  mediaFile?: any;
}) {
  const prisma = {
    productImage: {
      findMany: jest
        .fn()
        .mockResolvedValue(opts.productImage ? [opts.productImage] : []),
    },
    collection: {
      findMany: jest
        .fn()
        .mockResolvedValue(opts.collection ? [opts.collection] : []),
    },
    manufacturer: {
      findMany: jest
        .fn()
        .mockResolvedValue(opts.manufacturer ? [opts.manufacturer] : []),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(opts.user ? [opts.user] : []),
    },
    mediaFile: {
      findMany: jest
        .fn()
        .mockResolvedValue(opts.mediaFile ? [opts.mediaFile] : []),
    },
  };
  const storage = {
    listFolder: jest.fn().mockResolvedValue({
      folders: opts.folders ?? [],
      files: opts.files ?? [],
    }),
    getPublicAssetUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
  };
  const service = new AdminMediaService(prisma as any, storage as any);
  return { service, prisma, storage };
}

const NOW = new Date("2026-08-01T00:00:00Z");

describe("AdminMediaService.browse", () => {
  it("lists folders and files; publicUrl only for public roots", async () => {
    const { service } = makeHarness({
      folders: ["staging/products/", "staging/messages/"],
      files: [
        {
          key: "staging/products/uploads/a.webp",
          size: 100,
          lastModified: NOW,
        },
        { key: "staging/messages/u1/gizli.webp", size: 50, lastModified: NOW },
      ],
    });

    const result = await service.browse("");

    expect(result.folders.map((f) => f.name)).toEqual(["products", "messages"]);
    const [pub, priv] = result.files;
    expect(pub.publicUrl).toBe(
      "https://cdn.test/staging/products/uploads/a.webp",
    );
    // Private kök: public URL YOK — mesaj ekleri admin ekranında bile
    // doğrudan URL almaz (yetkili uçtan servis edilir).
    expect(priv.publicUrl).toBeNull();
  });

  it("maps file usage to the owning record (ürün görseli örneği)", async () => {
    const KEY = "staging/products/product-images/p1/card.webp";
    const { service } = makeHarness({
      files: [{ key: KEY, size: 10, lastModified: NOW }],
      productImage: {
        cardKey: KEY,
        detailKey: "x",
        product: { id: "p1", title: "Hot Wheels GT-R" },
      },
    });

    const result = await service.browse("products/product-images/p1/");

    expect(result.files[0].usage).toMatchObject({
      type: "product",
      label: "Hot Wheels GT-R",
    });
  });

  it("leaves unreferenced files with null usage (sahipsiz dosya tespiti)", async () => {
    const { service } = makeHarness({
      files: [
        {
          key: "staging/products/uploads/orphan.webp",
          size: 10,
          lastModified: NOW,
        },
      ],
    });

    const result = await service.browse("products/uploads/");

    expect(result.files[0].usage).toBeNull();
  });

  it("rejects path traversal in the prefix", async () => {
    const { service } = makeHarness({});
    await expect(service.browse("../prod/")).rejects.toThrow(
      BadRequestException,
    );
  });
});
