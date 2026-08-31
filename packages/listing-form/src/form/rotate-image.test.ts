/** @format */

import { describe, expect, it } from "vitest";
import {
  canRotateFile,
  rotatedOutputQuality,
  rotatedOutputType,
} from "./rotate-image";

/**
 * Çevirmenin canvas kısmı tarayıcı tesisatıdır (jsdom'da canvas yok); burada
 * KARAR mantığı test edilir — hangi dosya çevrilebilir ve çıktı hangi formatta
 * yazılır. Durum geçişleri `useListingImageUpload.test.tsx` içinde.
 */

const file = (type: string) => new File([new Uint8Array(8)], "p", { type });

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

describe("çıktı formatı", () => {
  // `canvas.toBlob` "image/jpg" bilmez; tanımadığı türde sessizce PNG'ye düşer
  // ve dosya adı ile içeriği ayrışırdı.
  it("image/jpg → image/jpeg", () =>
    expect(rotatedOutputType("image/jpg")).toBe("image/jpeg"));

  it("tanınan tipler korunur", () => {
    expect(rotatedOutputType("image/png")).toBe("image/png");
    expect(rotatedOutputType("image/webp")).toBe("image/webp");
  });

  it("yalnız kayıplı formatlarda kalite verilir", () => {
    expect(rotatedOutputQuality("image/jpg")).toBe(0.92);
    expect(rotatedOutputQuality("image/webp")).toBe(0.92);
    expect(rotatedOutputQuality("image/png")).toBeUndefined();
  });
});
