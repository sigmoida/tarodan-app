/** @format */

import { describe, expect, it, vi } from "vitest";
import type { CanvasDeps } from "./image-canvas";
import { MAX_IMAGE_BYTES } from "./listing-image-item";
import { downscaleImageFile, MAX_UPLOAD_DIMENSION } from "./resize-image";
import {
  canRotateFile,
  rotatedOutputQuality,
  rotateImageFile,
  RotateImageError,
} from "./rotate-image";

/**
 * Çevirmenin canvas kısmı tarayıcı tesisatıdır (jsdom'da canvas yok); burada
 * KARAR mantığı test edilir — hangi dosya çevrilebilir, hangi boyutta ve
 * formatta yazılır, ne zaman reddedilir. Çizim `CanvasDeps` ile değiştirilir.
 * Durum geçişleri `useListingImageUpload.test.tsx` içinde.
 */

const file = (type: string, name = "p") =>
  new File([new Uint8Array(8)], name, { type, lastModified: 7 });

const bitmap = (width: number, height: number) =>
  ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;

function depsFor(decoded: { width: number; height: number }, bytes = 100) {
  const bmp = bitmap(decoded.width, decoded.height);
  const decode = vi.fn(async () => bmp);
  const render = vi.fn(async () => new Blob([new Uint8Array(bytes)]));
  return { deps: { decode, render } as CanvasDeps, decode, render, bmp };
}

describe("canRotateFile", () => {
  it.each(["image/jpeg", "image/jpg", "image/png", "image/webp"])(
    "%s çevrilebilir",
    (type) => expect(canRotateFile(file(type))).toBe(true),
  );

  // Canvas animasyonu düzleştirir: sessizce bozmaktansa düğmeyi hiç göstermeyiz.
  it("GIF çevrilemez", () =>
    expect(canRotateFile(file("image/gif"))).toBe(false));

  it("büyük harfli MIME tipini de tanır", () =>
    expect(canRotateFile(file("IMAGE/JPEG"))).toBe(true));

  // Kayıtlı (sunucudan gelen) görselde `file` yoktur.
  it("dosyasız kalem çevrilemez", () =>
    expect(canRotateFile(undefined)).toBe(false));
});

describe("rotatedOutputQuality", () => {
  it("yalnız kayıplı formatlarda kalite verilir", () => {
    expect(rotatedOutputQuality("image/jpg")).toBe(0.92);
    expect(rotatedOutputQuality("image/webp")).toBe(0.92);
    expect(rotatedOutputQuality("image/png")).toBeUndefined();
  });
});

describe("rotateImageFile", () => {
  it("çevirme ile küçültmeyi TEK geçişte yapar (uzun kenar 1600)", async () => {
    // Görüntülenen yönde 4000×3000 yatay → çevrilmiş 1200×1600 dikey.
    const { deps, decode, render, bmp } = depsFor({
      width: 4000,
      height: 3000,
    });
    const input = file("image/jpeg", "foto.jpg");

    const result = await rotateImageFile(input, { deps });

    expect(decode).toHaveBeenCalledWith(input);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(bmp, {
      width: 1200,
      height: MAX_UPLOAD_DIMENSION,
      type: "image/jpeg",
      quality: 0.92,
      quarterTurn: true,
    });
    expect(result.name).toBe("foto.jpg");
    expect(result.type).toBe("image/jpeg");
    expect(result.lastModified).toBe(7);
    expect(bmp.close).toHaveBeenCalled();
  });

  it("zaten küçük görselde ölçek değişmez, yalnız en-boy yer değiştirir", async () => {
    const { deps, render } = depsFor({ width: 800, height: 600 });

    await rotateImageFile(file("image/png"), { deps });

    expect(render).toHaveBeenCalledWith(expect.anything(), {
      width: 600,
      height: 800,
      type: "image/png",
      quality: undefined,
      quarterTurn: true,
    });
  });

  // `canvas.toBlob` "image/jpg" bilmez: çıktı türü normalize edilir.
  it("image/jpg girdisi image/jpeg olarak kodlanır", async () => {
    const { deps, render } = depsFor({ width: 800, height: 600 });

    const result = await rotateImageFile(file("image/jpg"), { deps });

    expect(render).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "image/jpeg" }),
    );
    expect(result.type).toBe("image/jpeg");
  });

  /**
   * Regresyon: çevirme tam çözünürlükte q0.92 kodluyordu; büyük JPEG ara
   * dosyada 10 MB'ı aşıp "çevrilemedi" diyordu. Artık çıktı zaten 1600 px'tir
   * ve sınır yalnız bu SON dosyaya uygulanır.
   */
  it("son dosya sunucu sınırını aşarsa tooLarge", async () => {
    const { deps, bmp } = depsFor(
      { width: 1600, height: 1600 },
      MAX_IMAGE_BYTES + 1,
    );

    const error = await rotateImageFile(file("image/png"), { deps }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(RotateImageError);
    expect((error as RotateImageError).reason).toBe("tooLarge");
    expect(bmp.close).toHaveBeenCalled();
  });

  it("çözülemezse decode", async () => {
    const deps: CanvasDeps = {
      decode: async () => {
        throw new Error("heic");
      },
      render: vi.fn(),
    };

    await expect(
      rotateImageFile(file("image/jpeg"), { deps }),
    ).rejects.toMatchObject({ reason: "decode" });
  });

  it("kodlanamazsa (null blob ya da çizim hatası) encode", async () => {
    const { bmp } = depsFor({ width: 10, height: 10 });

    await expect(
      rotateImageFile(file("image/jpeg"), {
        deps: { decode: async () => bmp, render: async () => null },
      }),
    ).rejects.toMatchObject({ reason: "encode" });
    await expect(
      rotateImageFile(file("image/jpeg"), {
        deps: {
          decode: async () => bmp,
          render: async () => {
            throw new Error("canvas");
          },
        },
      }),
    ).rejects.toMatchObject({ reason: "encode" });
  });

  it("GIF'i hiç çözmeden reddeder", async () => {
    const { deps, decode } = depsFor({ width: 10, height: 10 });

    await expect(
      rotateImageFile(file("image/gif"), { deps }),
    ).rejects.toMatchObject({ reason: "unsupported" });
    expect(decode).not.toHaveBeenCalled();
  });

  // Küçültme ile AYNI sıraya girer: aynı anda iki tam çözünürlüklü bitmap yok.
  it("süren bir küçültme bitmeden çözmeye başlamaz", async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const order: string[] = [];

    // 4000×3000 JPEG başlığı (SOI + SOF0) — küçültme gerçekten çözmeye girsin.
    const jpeg = new File(
      [
        new Uint8Array([
          0xff,
          0xd8,
          0xff,
          0xc0,
          0x00,
          0x0b,
          8,
          0x0b,
          0xb8, // yükseklik 3000
          0x0f,
          0xa0, // genişlik 4000
          1,
          1,
          0x11,
          0,
          ...Array(4096).fill(7),
        ]),
      ],
      "a.jpg",
      { type: "image/jpeg" },
    );
    const downscaling = downscaleImageFile(jpeg, {
      deps: {
        decode: async () => {
          order.push("downscale:decode");
          await released;
          return bitmap(1600, 1200);
        },
        render: async () => {
          order.push("downscale:render");
          return new Blob([new Uint8Array(10)]);
        },
      },
    });

    const { bmp } = depsFor({ width: 10, height: 10 });
    const rotating = rotateImageFile(file("image/png"), {
      deps: {
        decode: async () => {
          order.push("rotate:decode");
          return bmp;
        },
        render: async () => new Blob([new Uint8Array(10)]),
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual(["downscale:decode"]);

    release();
    await Promise.all([downscaling, rotating]);
    expect(order).toEqual([
      "downscale:decode",
      "downscale:render",
      "rotate:decode",
    ]);
  });
});
