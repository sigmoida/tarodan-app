/** @format */

import { describe, expect, it, vi } from "vitest";
import {
  canDownscaleFile,
  downscaledFileName,
  downscaleImageFile,
  MAX_UPLOAD_DIMENSION,
  parseJpegInfo,
  scaledDimensions,
  type DownscaleDeps,
} from "./resize-image";

/**
 * Canvas kısmı tarayıcı tesisatıdır (jsdom'da canvas yok); burada KARAR
 * mantığı test edilir — ne zaman küçültülür, hangi boyuta inilir, hangi
 * durumda sessizce orijinale dönülür. Tesisat `DownscaleDeps` ile değiştirilir.
 */

const u16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];

/** Minimal EXIF APP1 segmenti: tek girişli IFD0 (Orientation). */
function exifSegment(orientation: number, littleEndian: boolean): number[] {
  const short = (value: number) =>
    littleEndian ? [value & 0xff, (value >> 8) & 0xff] : u16(value);
  const long = (value: number) =>
    littleEndian
      ? [value & 0xff, (value >> 8) & 0xff, 0, 0]
      : [0, 0, ...u16(value)];
  const tiff = [
    ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...short(0x002a),
    ...long(8), // IFD0 ofseti
    ...short(1), // giriş sayısı
    ...short(0x0112), // tag
    ...short(3), // tür: SHORT
    ...long(1), // adet
    ...short(orientation),
    0,
    0, // değer alanı dolgusu
    0,
    0,
    0,
    0, // sonraki IFD yok
  ];
  const body = [..."Exif\0\0".split("").map((c) => c.charCodeAt(0)), ...tiff];
  return [0xff, 0xe1, ...u16(body.length + 2), ...body];
}

/** SOI + (isteğe bağlı EXIF) + SOF + dolgu. `progressive` SOF2 kullanır. */
function jpegBytes(options: {
  width: number;
  height: number;
  orientation?: number;
  littleEndian?: boolean;
  progressive?: boolean;
  padding?: number;
}): number[] {
  const { width, height, orientation, littleEndian = false } = options;
  return [
    0xff,
    0xd8,
    ...(orientation ? exifSegment(orientation, littleEndian) : []),
    0xff,
    options.progressive ? 0xc2 : 0xc0,
    ...u16(11),
    8,
    ...u16(height),
    ...u16(width),
    1,
    1,
    0x11,
    0,
    ...Array(options.padding ?? 4096).fill(7),
  ];
}

const jpegFile = (
  options: Parameters<typeof jpegBytes>[0],
  name = "p.jpg",
  type = "image/jpeg",
) =>
  new File([new Uint8Array(jpegBytes(options))], name, {
    type,
    lastModified: 42,
  });

const bitmap = (width: number, height: number) =>
  ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;

function depsFor(decoded: { width: number; height: number }, blobBytes = 100) {
  const bmp = bitmap(decoded.width, decoded.height);
  const decode = vi.fn(async () => bmp);
  const render = vi.fn(async () => new Blob([new Uint8Array(blobBytes)]));
  return { deps: { decode, render } as DownscaleDeps, decode, render, bmp };
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
  it.each(["image/jpeg", "image/jpg", "IMAGE/JPEG"])(
    "%s küçültülebilir",
    (type) => expect(canDownscaleFile({ type })).toBe(true),
  );

  // Alfa / animasyon kaybolmasın: JPEG dışı olduğu gibi gider.
  it.each(["image/png", "image/webp", "image/gif"])("%s'e dokunulmaz", (type) =>
    expect(canDownscaleFile({ type })).toBe(false),
  );
});

describe("downscaledFileName", () => {
  it("uzantıyı .jpg yapar", () => {
    expect(downscaledFileName("foto.JPEG")).toBe("foto.jpg");
    expect(downscaledFileName("a.b.jpg")).toBe("a.b.jpg");
  });

  it("uzantısız ve nokta-ile-başlayan adı bozmaz", () => {
    expect(downscaledFileName("foto")).toBe("foto.jpg");
    expect(downscaledFileName(".hidden")).toBe(".hidden.jpg");
  });
});

describe("parseJpegInfo", () => {
  const parse = (options: Parameters<typeof jpegBytes>[0]) =>
    parseJpegInfo(new Uint8Array(jpegBytes(options)));

  it("EXIF yoksa yön 1, SOF boyutunu okur", () =>
    expect(parse({ width: 4000, height: 3000 })).toEqual({
      width: 4000,
      height: 3000,
      orientation: 1,
    }));

  it.each([false, true])("EXIF yönünü okur (littleEndian=%s)", (little) =>
    expect(
      parse({
        width: 4000,
        height: 3000,
        orientation: 6,
        littleEndian: little,
      }),
    ).toEqual({ width: 4000, height: 3000, orientation: 6 }),
  );

  it("progressive (SOF2) JPEG'i de okur", () =>
    expect(parse({ width: 3000, height: 2000, progressive: true })).toEqual({
      width: 3000,
      height: 2000,
      orientation: 1,
    }));

  it("JPEG değilse null", () =>
    expect(parseJpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull());

  it("SOF'a ulaşmadan biterse null", () =>
    expect(parseJpegInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]))).toBeNull());

  it("geçersiz yön değerini yok sayar (1'de kalır)", () =>
    expect(parse({ width: 4000, height: 3000, orientation: 9 })).toMatchObject({
      orientation: 1,
    }));
});

describe("downscaleImageFile", () => {
  it("büyük JPEG'i hedef boyutta çözer ve küçültür", async () => {
    const { deps, decode, render, bmp } = depsFor({
      width: 1600,
      height: 1200,
    });
    const file = jpegFile({ width: 4000, height: 3000 }, "tatil.jpeg");

    const result = await downscaleImageFile(file, deps);

    // Tam çözünürlüklü bitmap hiç oluşmasın: hedef boyut çözücüye verilir.
    expect(decode).toHaveBeenCalledWith(file, { width: 1600, height: 1200 });
    expect(render).toHaveBeenCalledWith(bmp, { width: 1600, height: 1200 });
    expect(result).not.toBe(file);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("tatil.jpg");
    expect(result.size).toBe(100);
    expect(result.lastModified).toBe(42);
    expect(bmp.close).toHaveBeenCalled();
  });

  it("yön 1-4'te (eksen değişmez) hedef boyutla çözer", async () => {
    const { deps, decode } = depsFor({ width: 1600, height: 1200 });

    await downscaleImageFile(
      jpegFile({ width: 4000, height: 3000, orientation: 3 }),
      deps,
    );

    expect(decode).toHaveBeenCalledWith(expect.anything(), {
      width: 1600,
      height: 1200,
    });
  });

  describe("EXIF yönü 5-8", () => {
    it("tarayıcı yönü uyguladıysa (bitmap dikey) küçültür; hedef görüntülenen yönde", async () => {
      // Ham 4000×3000, yön 6 → görüntülenen 3000×4000; bitmap yönlü geldi.
      const { deps, decode, render } = depsFor({ width: 3000, height: 4000 });
      const file = jpegFile({ width: 4000, height: 3000, orientation: 6 });

      const result = await downscaleImageFile(file, deps);

      // Uygulanıp uygulanmadığını bitmap boyutundan ayırt edebilmek için
      // hedef boyutla DEĞİL tam çözülür.
      expect(decode).toHaveBeenCalledWith(file, undefined);
      expect(render).toHaveBeenCalledWith(expect.anything(), {
        width: 1200,
        height: 1600,
      });
      expect(result).not.toBe(file);
    });

    it("tarayıcı yönü UYGULAMADIYSA (bitmap ham boyutta) orijinali gönderir", async () => {
      const { deps, render, bmp } = depsFor({ width: 4000, height: 3000 });
      const file = jpegFile({ width: 4000, height: 3000, orientation: 6 });

      expect(await downscaleImageFile(file, deps)).toBe(file);
      // Yan çizilmiş görsel üretilmez; sunucu autoOrient ile düzeltir.
      expect(render).not.toHaveBeenCalled();
      expect(bmp.close).toHaveBeenCalled();
    });

    it.each([5, 7, 8])(
      "yön %i için de aynı korumayı uygular",
      async (orientation) => {
        const { deps, render } = depsFor({ width: 4000, height: 3000 });
        const file = jpegFile({ width: 4000, height: 3000, orientation });

        expect(await downscaleImageFile(file, deps)).toBe(file);
        expect(render).not.toHaveBeenCalled();
      },
    );

    it("kare görselde (ayırt edilemez, zararsız) koruma devreye girmez", async () => {
      const { deps, render } = depsFor({ width: 3000, height: 3000 });
      const file = jpegFile({ width: 3000, height: 3000, orientation: 6 });

      expect(await downscaleImageFile(file, deps)).not.toBe(file);
      expect(render).toHaveBeenCalled();
    });
  });

  it("zaten küçük JPEG'i çözmeden bırakır", async () => {
    const { deps, decode } = depsFor({ width: 1200, height: 800 });
    const file = jpegFile({ width: 1200, height: 800 });

    expect(await downscaleImageFile(file, deps)).toBe(file);
    expect(decode).not.toHaveBeenCalled();
  });

  it("yön 6'da KÜÇÜK ham boyut da görüntülenen yöne göre değerlendirilir", async () => {
    // Ham 1500×1000 → görüntülenen 1000×1500: sınırın altında, dokunulmaz.
    const { deps, decode } = depsFor({ width: 1000, height: 1500 });
    const file = jpegFile({ width: 1500, height: 1000, orientation: 6 });

    expect(await downscaleImageFile(file, deps)).toBe(file);
    expect(decode).not.toHaveBeenCalled();
  });

  it.each(["image/png", "image/webp", "image/gif"])(
    "%s dosyasını okumaz/çözmez bile (alfa ve animasyon korunur)",
    async (type) => {
      const decode = vi.fn();
      const file = new File([new Uint8Array(4096)], "x", { type });

      expect(await downscaleImageFile(file, { decode, render: vi.fn() })).toBe(
        file,
      );
      expect(decode).not.toHaveBeenCalled();
    },
  );

  it("başlığı çözülemeyen JPEG'i olduğu gibi bırakır", async () => {
    const { deps, decode } = depsFor({ width: 4000, height: 3000 });
    const file = new File([new Uint8Array(4096)], "bozuk.jpg", {
      type: "image/jpeg",
    });

    expect(await downscaleImageFile(file, deps)).toBe(file);
    expect(decode).not.toHaveBeenCalled();
  });

  describe("sessizce orijinale döner", () => {
    it("çözme başarısızsa (eski tarayıcı)", async () => {
      const file = jpegFile({ width: 4000, height: 3000 });
      const deps: DownscaleDeps = {
        decode: async () => {
          throw new Error("cannot decode");
        },
        render: vi.fn(),
      };

      expect(await downscaleImageFile(file, deps)).toBe(file);
    });

    it("canvas kodlayamazsa (null blob)", async () => {
      const { bmp } = depsFor({ width: 1600, height: 1200 });
      const file = jpegFile({ width: 4000, height: 3000 });
      const deps: DownscaleDeps = {
        decode: async () => bmp,
        render: async () => null,
      };

      expect(await downscaleImageFile(file, deps)).toBe(file);
      expect(bmp.close).toHaveBeenCalled();
    });

    it("çizim fırlatırsa", async () => {
      const { bmp } = depsFor({ width: 1600, height: 1200 });
      const file = jpegFile({ width: 4000, height: 3000 });
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
      const { deps } = depsFor({ width: 1600, height: 1200 }, 50_000);
      const file = jpegFile({ width: 4000, height: 3000 });

      expect(await downscaleImageFile(file, deps)).toBe(file);
    });

    it("ortam createImageBitmap'i sunmuyorsa (varsayılan tesisat)", async () => {
      const file = jpegFile({ width: 4000, height: 3000 });

      expect(await downscaleImageFile(file)).toBe(file);
    });
  });

  describe("tek seferde bir dosya", () => {
    it("ikinci dosyanın çözmesi birincisi bitmeden başlamaz", async () => {
      let releaseFirst!: () => void;
      const firstDone = new Promise<void>(
        (resolve) => (releaseFirst = resolve),
      );
      const order: string[] = [];

      const make = (label: string, gate?: Promise<void>): DownscaleDeps => ({
        decode: async () => {
          order.push(`decode:${label}`);
          await gate;
          return bitmap(1600, 1200);
        },
        render: async () => {
          order.push(`render:${label}`);
          return new Blob([new Uint8Array(10)]);
        },
      });

      const first = downscaleImageFile(
        jpegFile({ width: 4000, height: 3000 }, "a.jpg"),
        make("a", firstDone),
      );
      const second = downscaleImageFile(
        jpegFile({ width: 4000, height: 3000 }, "b.jpg"),
        make("b"),
      );

      // Birincinin çözmesi askıdayken ikinci hiç başlamamış olmalı.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(order).toEqual(["decode:a"]);

      releaseFirst();
      await Promise.all([first, second]);
      expect(order).toEqual(["decode:a", "render:a", "decode:b", "render:b"]);
    });

    it("birinin hatası sıradakini engellemez", async () => {
      const failing: DownscaleDeps = {
        decode: async () => {
          throw new Error("boom");
        },
        render: vi.fn(),
      };
      const { deps } = depsFor({ width: 1600, height: 1200 });

      const [a, b] = await Promise.all([
        downscaleImageFile(jpegFile({ width: 4000, height: 3000 }), failing),
        downscaleImageFile(jpegFile({ width: 4000, height: 3000 }), deps),
      ]);

      expect(a.type).toBe("image/jpeg");
      expect(b.size).toBe(100);
    });
  });
});
