/** @format */

import { describe, expect, it } from "vitest";
import {
  acceptFiles,
  coverIndexOf,
  imageSubmitBlocker,
  hasPendingUploads,
  itemFromExisting,
  itemFromFile,
  makeCover,
  moveItem,
  occupiedSlots,
  patchItem,
  removeItem,
  toFormImages,
  type ListingImageItem,
} from "./listing-image-item";

const fakeFile = (
  name: string,
  { type = "image/jpeg", size = 1000, lastModified = 1 } = {},
): File => ({ name, type, size, lastModified }) as unknown as File;

const objectUrl = (file: File) => `blob:${file.name}`;

const uploaded = (
  id: string,
  overrides: Partial<ListingImageItem> = {},
): ListingImageItem => ({
  clientId: id,
  previewUrl: `https://cdn/${id}.webp`,
  isObjectUrl: false,
  cardKey: `${id}-card`,
  detailKey: `${id}-detail`,
  status: "uploaded",
  progress: 100,
  ...overrides,
});

describe("ilan görseli durum modeli", () => {
  describe("form yükü", () => {
    it("yalnız yüklenmiş kalemleri ve EKRANDAKİ sırayla alır", () => {
      const items = [
        uploaded("a"),
        { ...uploaded("b"), status: "uploading" as const },
        uploaded("c"),
      ];

      expect(toFormImages(items)).toEqual([
        { cardKey: "a-card", detailKey: "a-detail" },
        { cardKey: "c-card", detailKey: "c-detail" },
      ]);
    });

    it("hata almış kalem yüke girmez", () => {
      const items = [
        uploaded("a"),
        { ...uploaded("b"), status: "failed" as const, error: "boom" },
      ];

      expect(toFormImages(items)).toHaveLength(1);
    });

    /**
     * Yüklemeler farklı zamanlarda biter; sıra tamamlanma zamanından DEĞİL,
     * kullanıcının gördüğü listeden okunur.
     */
    it("sıra, yüklemelerin bitiş sırasından etkilenmez", () => {
      let items = [
        { ...uploaded("a"), status: "uploading" as const, cardKey: undefined },
        { ...uploaded("b"), status: "uploading" as const, cardKey: undefined },
      ] as ListingImageItem[];

      // b önce biter, a sonra.
      items = patchItem(items, "b", {
        status: "uploaded",
        cardKey: "b-card",
        detailKey: "b-detail",
      });
      items = patchItem(items, "a", {
        status: "uploaded",
        cardKey: "a-card",
        detailKey: "a-detail",
      });

      expect(toFormImages(items).map((i) => i.cardKey)).toEqual([
        "a-card",
        "b-card",
      ]);
    });
  });

  describe("dosya kabulü", () => {
    it("desteklenmeyen tipi gerekçesiyle reddeder", () => {
      const { accepted, rejected } = acceptFiles(
        [],
        [fakeFile("a.pdf", { type: "application/pdf" })],
        { maxImages: 5 },
      );

      expect(accepted).toHaveLength(0);
      expect(rejected).toEqual([{ name: "a.pdf", reason: "type" }]);
    });

    it("10 MB üstünü reddeder", () => {
      const { rejected } = acceptFiles(
        [],
        [fakeFile("big.jpg", { size: 11 * 1024 * 1024 })],
        { maxImages: 5 },
      );

      expect(rejected).toEqual([{ name: "big.jpg", reason: "size" }]);
    });

    it("aynı dosyayı ikinci kez eklemez", () => {
      const first = fakeFile("a.jpg");
      const items = [itemFromFile(first, objectUrl)];

      const { accepted, rejected } = acceptFiles(items, [fakeFile("a.jpg")], {
        maxImages: 5,
      });

      expect(accepted).toHaveLength(0);
      expect(rejected).toEqual([{ name: "a.jpg", reason: "duplicate" }]);
    });

    it("kontenjanı aşanları kabul edilenlerden AYIRARAK bildirir", () => {
      const items = [uploaded("a"), uploaded("b")];

      const { accepted, rejected } = acceptFiles(
        items,
        [fakeFile("c.jpg"), fakeFile("d.jpg"), fakeFile("e.jpg")],
        { maxImages: 3 },
      );

      expect(accepted.map((f) => f.name)).toEqual(["c.jpg"]);
      expect(rejected).toEqual([
        { name: "d.jpg", reason: "limit" },
        { name: "e.jpg", reason: "limit" },
      ]);
    });

    it("geçersiz dosya kontenjan harcamaz", () => {
      const { accepted } = acceptFiles(
        [],
        [
          fakeFile("bad.pdf", { type: "application/pdf" }),
          fakeFile("good.jpg"),
        ],
        { maxImages: 1 },
      );

      expect(accepted.map((f) => f.name)).toEqual(["good.jpg"]);
    });

    it("hata almış kalem kontenjan işgal etmez", () => {
      const items = [
        uploaded("a"),
        { ...uploaded("b"), status: "failed" as const },
      ];

      expect(occupiedSlots(items)).toBe(1);
      const { accepted } = acceptFiles(items, [fakeFile("c.jpg")], {
        maxImages: 2,
      });
      expect(accepted).toHaveLength(1);
    });
  });

  describe("sıralama", () => {
    const items = [uploaded("a"), uploaded("b"), uploaded("c")];

    it("kalemi hedef konuma taşır", () => {
      expect(moveItem(items, 2, 0).map((i) => i.clientId)).toEqual([
        "c",
        "a",
        "b",
      ]);
    });

    it("aralık dışı hareket listeyi değiştirmez", () => {
      expect(moveItem(items, 0, 9)).toBe(items);
      expect(moveItem(items, -1, 0)).toBe(items);
      expect(moveItem(items, 1, 1)).toBe(items);
    });

    it("kapak yapmak kalemi başa alır ve diğerlerinin sırasını korur", () => {
      expect(makeCover(items, 2).map((i) => i.clientId)).toEqual([
        "c",
        "a",
        "b",
      ]);
    });

    it("sıralama form yükünü aynı sırayla değiştirir", () => {
      expect(toFormImages(makeCover(items, 1)).map((i) => i.cardKey)).toEqual([
        "b-card",
        "a-card",
        "c-card",
      ]);
    });
  });

  describe("kayıtlı görseller", () => {
    it("düzenlemede mevcut görsel `uploaded` başlar ve yeniden yüklenmez", () => {
      const item = itemFromExisting({
        cardKey: "k",
        detailKey: "d",
        cardUrl: "https://cdn/k.webp",
      });

      expect(item.status).toBe("uploaded");
      expect(item.file).toBeUndefined();
      expect(item.isObjectUrl).toBe(false);
      expect(item.previewUrl).toBe("https://cdn/k.webp");
    });

    it("URL yoksa anahtara düşer (kırık önizleme yerine)", () => {
      expect(
        itemFromExisting({ cardKey: "k", detailKey: "d" }).previewUrl,
      ).toBe("k");
    });
  });

  describe("gönderim kapısı", () => {
    it("kuyrukta/aktarımda kalem varken bekleyen vardır", () => {
      expect(hasPendingUploads([{ ...uploaded("a"), status: "queued" }])).toBe(
        true,
      );
      expect(
        hasPendingUploads([{ ...uploaded("a"), status: "processing" }]),
      ).toBe(true);
    });

    it("hepsi bittiyse (başarılı ya da hatalı) bekleyen yoktur", () => {
      expect(
        hasPendingUploads([
          uploaded("a"),
          { ...uploaded("b"), status: "failed" },
        ]),
      ).toBe(false);
    });
  });

  describe("gönderim kapısı — çözümlenmemiş görsel", () => {
    /**
     * Regresyon: forma yalnız `uploaded` kalemler yazıldığı için, yükleme
     * sürerken kaydedilen ilan kullanıcının ekranda gördüğünden EKSİK görselle
     * yayınlanıyordu. Kapı hem butonu hem submit handler'ı korumalı.
     */
    it("yükleme sürerken gönderimi engeller", () => {
      const blocker = imageSubmitBlocker([
        uploaded("a"),
        { ...uploaded("b"), status: "uploading" },
      ]);

      expect(blocker?.reason).toBe("pending");
      expect(blocker?.message).toMatch(/bekleyin/i);
    });

    it("sırada bekleyen kalem de engeller", () => {
      expect(
        imageSubmitBlocker([{ ...uploaded("a"), status: "queued" }])?.reason,
      ).toBe("pending");
    });

    it("işlenmekte olan kalem de engeller", () => {
      expect(
        imageSubmitBlocker([{ ...uploaded("a"), status: "processing" }])
          ?.reason,
      ).toBe("pending");
    });

    it("hata almış görsel varken gönderimi engeller", () => {
      const blocker = imageSubmitBlocker([
        uploaded("a"),
        { ...uploaded("b"), status: "failed" },
      ]);

      expect(blocker?.reason).toBe("failed");
      expect(blocker?.message).toMatch(/kaldırın|tekrar/i);
    });

    it("hepsi yüklendiyse engel yoktur", () => {
      expect(imageSubmitBlocker([uploaded("a"), uploaded("b")])).toBeNull();
    });

    it("hiç görsel yoksa engel yoktur", () => {
      expect(imageSubmitBlocker([])).toBeNull();
    });
  });

  describe("kapak görseli", () => {
    /**
     * Regresyon: kapak "ilk kalem" sayılıyordu. İlk kalem hata almışsa forma
     * yazılmadığı için ilanda BAŞKA bir görsel kapak oluyordu; ekranda
     * gösterilen kapak ile yayınlanan kapak ayrışıyordu.
     */
    it("hata almış ilk görsel kapak KABUL EDİLMEZ", () => {
      const items = [
        { ...uploaded("a"), status: "failed" as const },
        uploaded("b"),
      ];

      expect(coverIndexOf(items)).toBe(1);
    });

    it("bekleyen ilk görsel de kapak sayılmaz", () => {
      const items = [
        { ...uploaded("a"), status: "uploading" as const },
        uploaded("b"),
      ];

      expect(coverIndexOf(items)).toBe(1);
    });

    it("ilk kalem yüklendiyse kapak odur", () => {
      expect(coverIndexOf([uploaded("a"), uploaded("b")])).toBe(0);
    });

    it("kapak, forma yazılan ilk görselle AYNI olmalı", () => {
      const items = [
        { ...uploaded("a"), status: "failed" as const },
        uploaded("b"),
        uploaded("c"),
      ];

      expect(toFormImages(items)[0].cardKey).toBe(
        items[coverIndexOf(items)].cardKey,
      );
    });

    it("hiç yüklenmiş görsel yoksa kapak yoktur", () => {
      expect(coverIndexOf([{ ...uploaded("a"), status: "failed" }])).toBe(-1);
    });
  });

  it("kalem kimliğinden çıkarılır (indeksten değil)", () => {
    const items = [uploaded("a"), uploaded("b")];
    expect(removeItem(items, "a").map((i) => i.clientId)).toEqual(["b"]);
  });

  it("dosyadan üretilen kalem object URL taşır", () => {
    const item = itemFromFile(fakeFile("a.jpg"), objectUrl);
    expect(item.isObjectUrl).toBe(true);
    expect(item.previewUrl).toBe("blob:a.jpg");
    expect(item.status).toBe("queued");
  });
});
