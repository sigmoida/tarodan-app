/** @format */

import { describe, expect, it, vi } from "vitest";
import type { ListingFormApi } from "./api-context";
import { createDefaultUpload } from "./default-upload";
import { downscaleImageFile } from "./resize-image";
import type { Translate } from "./translate";

vi.mock("./resize-image", () => ({ downscaleImageFile: vi.fn() }));

const t = ((key: string) => key) as unknown as Translate;
const resize = vi.mocked(downscaleImageFile);

const original = new File([new Uint8Array(2048)], "buyuk.jpg", {
  type: "image/jpeg",
});
const small = new File([new Uint8Array(10)], "buyuk.jpg", {
  type: "image/jpeg",
});

function setup(result: { cardKey?: string; detailKey?: string } | null) {
  const uploadProductImage = vi.fn(async () => result as never);
  const port = createDefaultUpload(t, {
    uploadProductImage,
  } as unknown as ListingFormApi);
  return { port, uploadProductImage };
}

describe("createDefaultUpload", () => {
  it("sunucuya KÜÇÜLTÜLMÜŞ dosyayı gönderir", async () => {
    resize.mockResolvedValueOnce(small);
    const { port, uploadProductImage } = setup({
      cardKey: "c",
      detailKey: "d",
    });
    const controller = new AbortController();
    const onProgress = vi.fn();

    const result = await port(original, {
      signal: controller.signal,
      onProgress,
    });

    expect(resize).toHaveBeenCalledWith(original);
    expect(uploadProductImage).toHaveBeenCalledWith(small, {
      signal: controller.signal,
      onProgress,
    });
    expect(result).toEqual({ cardKey: "c", detailKey: "d" });
  });

  it("küçültme sürerken iptal edilirse istek HİÇ başlamaz", async () => {
    const controller = new AbortController();
    resize.mockImplementationOnce(async () => {
      controller.abort();
      return small;
    });
    const { port, uploadProductImage } = setup({
      cardKey: "c",
      detailKey: "d",
    });

    await expect(
      port(original, { signal: controller.signal, onProgress: vi.fn() }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(uploadProductImage).not.toHaveBeenCalled();
  });

  it("sunucu anahtar dönmezse çevrilmiş hata mesajı fırlatır", async () => {
    resize.mockResolvedValueOnce(original);
    const { port } = setup({});

    await expect(
      port(original, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow("product.imageUpload.noServerResult");
  });
});
