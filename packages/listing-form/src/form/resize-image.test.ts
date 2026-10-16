/** @format */

import { describe, expect, it, vi } from "vitest";
import {
  canDownscaleFile,
  downscaledFileName,
  downscaleImageFile,
  MAX_UPLOAD_DIMENSION,
  scaledDimensions,
  type DownscaleDeps,
} from "./resize-image";

/**
 * Canvas kısmı tarayıcı tesisatıdır (jsdom'da canvas yok); burada KARAR
 * mantığı test edilir — ne zaman küçültülür, hangi boyuta inilir, hangi
 * durumda sessizce orijinale dönülür. Tesisat `DownscaleDeps` ile değiştirilir.
 */

const fileOf = (
  type: string,
  bytes: number[] | number = 4096,
  name = "p.png",
) =>
  new File(
    [typeof bytes === "number" ? new Uint8Array(bytes) : new Uint8Array(bytes)],
    name,
    {
      type,
      lastModified: 42,
    },
  );

const bitmap = (width: number, height: number) =>
  ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;

function depsFor(
  size: { width: number; height: number },
  blobBytes = 100,
): { deps: DownscaleDeps; render: ReturnType<typeof vi.fn>; bmp: ImageBitmap } {
  const bmp = bitmap(size.width, size.height);
  const render = vi.fn(async () => new Blob([new Uint8Array(blobBytes)]));
  return {
    bmp,
    render,
    deps: { decode: async () => bmp, render },
  };
}

describe("scaledDimensions", () => {
  it("uzun kenarı 1600'e indirir, oranı korur (yatay)", () =>
    expect(scaledDimensions(4000, 3000)).toEqual({
      width: 1600,
      height: 1200,
    }));

  it("dikey görselde yükseklik sınırlanır", () =>
    expect(scaledDimensions(3000, 4000)).toEqual({
      width: 1200,
      height: 1600,
    }));

  it("tam sınırdaki ve daha küçük görsele dokunmaz", () => {
    expect(scaledDimensions(MAX_UPLOAD_DIMENSION, 900)).toBeNull();
    expect(scaledDimensions(800, 600)).toBeNull();
  });

  it("aşırı ince görselde kısa kenar en az 1 px kalır", () =>
    expect(scaledDimensions(10000, 2)).toEqual({ width: 1600, height: 1 }));

  it("geçersiz boyutta küçültme önermez", () => {
    expect(scaledDimensions(0, 100)).toBeNull();
    expect(scaledDimensions(Number.NaN, 100)).toBeNull();
  });
});

describe("canDownscaleFile", () => {
  it.each(["image/jpeg", "image/jpg", "image/png", "image/webp", "IMAGE/JPEG"])(
    "%s küçültülebilir",
    (type) => expect(canDownscaleFile({ type })).toBe(true),
  );

  it("GIF'e dokunulmaz", () =>
    expect(canDownscaleFile({ type: "image/gif" })).toBe(false));
});

describe("downscaledFileName", () => {
  it("uzantıyı .jpg yapar", () => {
    expect(downscaledFileName("foto.PNG")).toBe("foto.jpg");
    expect(downscaledFileName("a.b.webp")).toBe("a.b.jpg");
  });

  it("uzantısız ve nokta-ile-başlayan adı bozmaz", () => {
    expect(downscaledFileName("foto")).toBe("foto.jpg");
    expect(downscaledFileName(".hidden")).toBe(".hidden.jpg");
  });
});

describe("downscaleImageFile", () => {
  it("büyük görseli küçültür: JPEG, yeni ad, hesaplanan boyutla çizer", async () => {
    const { deps, render, bmp } = depsFor({ width: 4000, height: 3000 }, 100);
    const file = fileOf("image/png", 4096, "tatil.png");

    const result = await downscaleImageFile(file, deps);

    expect(render).toHaveBeenCalledWith(bmp, { width: 1600, height: 1200 });
    expect(result).not.toBe(file);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("tatil.jpg");
    expect(result.size).toBe(100);
    expect(result.lastModified).toBe(42);
    // Bitmap belleği bırakılır.
    expect(bmp.close).toHaveBeenCalled();
  });

  it("zaten küçük görseli yeniden kodlamaz", async () => {
    const { deps, render, bmp } = depsFor({ width: 1200, height: 800 });
    const file = fileOf("image/jpeg");

    expect(await downscaleImageFile(file, deps)).toBe(file);
    expect(render).not.toHaveBeenCalled();
    expect(bmp.close).toHaveBeenCalled();
  });

  it("GIF'i çözmeye bile çalışmaz", async () => {
    const decode = vi.fn();
    const file = fileOf("image/gif");

    expect(await downscaleImageFile(file, { decode, render: vi.fn() })).toBe(
      file,
    );
    expect(decode).not.toHaveBeenCalled();
  });

  it("animasyonlu WebP'ye dokunmaz", async () => {
    // RIFF....WEBPVP8X + (4 bayt boyut) + bayrak baytı (20) animasyon biti.
    const header = Array.from({ length: 32 }, () => 0);
    "RIFF".split("").forEach((c, i) => (header[i] = c.charCodeAt(0)));
    "WEBPVP8X".split("").forEach((c, i) => (header[8 + i] = c.charCodeAt(0)));
    header[20] = 0x02;
    const { deps, render } = depsFor({ width: 4000, height: 3000 });
    const file = fileOf("image/webp", header, "anim.webp");

    expect(await downscaleImageFile(file, deps)).toBe(file);
    expect(render).not.toHaveBeenCalled();
  });

  it("animasyonsuz WebP küçültülür", async () => {
    const header = Array.from({ length: 32 }, () => 0);
    "RIFF".split("").forEach((c, i) => (header[i] = c.charCodeAt(0)));
    "WEBPVP8X".split("").forEach((c, i) => (header[8 + i] = c.charCodeAt(0)));
    const { deps } = depsFor({ width: 4000, height: 3000 }, 1);
    const file = fileOf(
      "image/webp",
      [...header, ...Array(4000).fill(1)],
      "s.webp",
    );

    const result = await downscaleImageFile(file, deps);

    expect(result).not.toBe(file);
    expect(result.name).toBe("s.jpg");
  });

  it("APNG'ye (acTL parçası) dokunmaz", async () => {
    const bytes = [
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...Array.from("acTL").map((c) => c.charCodeAt(0)),
      ...Array(64).fill(0),
    ];
    const { deps, render } = depsFor({ width: 4000, height: 3000 });
    const file = fileOf("image/png", bytes);

    expect(await downscaleImageFile(file, deps)).toBe(file);
    expect(render).not.toHaveBeenCalled();
  });

  describe("sessizce orijinale döner", () => {
    it("çözme başarısızsa (HEIC / eski tarayıcı)", async () => {
      const file = fileOf("image/jpeg");
      const deps: DownscaleDeps = {
        decode: async () => {
          throw new Error("cannot decode");
        },
        render: vi.fn(),
      };

      expect(await downscaleImageFile(file, deps)).toBe(file);
    });

    it("canvas kodlayamazsa (null blob)", async () => {
      const { bmp } = depsFor({ width: 4000, height: 3000 });
      const file = fileOf("image/jpeg");
      const deps: DownscaleDeps = {
        decode: async () => bmp,
        render: async () => null,
      };

      expect(await downscaleImageFile(file, deps)).toBe(file);
      expect(bmp.close).toHaveBeenCalled();
    });

    it("çizim fırlatırsa", async () => {
      const { bmp } = depsFor({ width: 4000, height: 3000 });
      const file = fileOf("image/jpeg");
      const deps: DownscaleDeps = {
        decode: async () => bmp,
        render: async () => {
          throw new Error("canvas boom");
        },
      };

      expect(await downscaleImageFile(file, deps)).toBe(file);
      expect(bmp.close).toHaveBeenCalled();
    });

    it("sonuç orijinalden küçük değilse", async () => {
      const { deps } = depsFor({ width: 4000, height: 3000 }, 5000);
      const file = fileOf("image/jpeg", 4096);

      expect(await downscaleImageFile(file, deps)).toBe(file);
    });

    it("ortam createImageBitmap'i hiç sunmuyorsa (varsayılan tesisat)", async () => {
      // Düğüm ortamında `createImageBitmap` yok: varsayılan çözücü fırlatır,
      // yardımcı yine de orijinali döner.
      const file = fileOf("image/jpeg");

      expect(await downscaleImageFile(file)).toBe(file);
    });
  });
});
