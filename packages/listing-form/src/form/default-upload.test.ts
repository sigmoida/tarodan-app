/** @format */

import { describe, expect, it, vi } from "vitest";
import type { ListingFormApi } from "./api-context";
import { createDefaultUpload } from "./default-upload";
import type { Translate } from "./translate";

const t = ((key: string) => key) as unknown as Translate;

const prepared = new File([new Uint8Array(10)], "buyuk.jpg", {
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
  // Küçültme kuyruğun hazırlık adımındadır (`listing-upload-queue`): port
  // gelen dosyayı OLDUĞU GİBİ gönderir, ikinci kez küçültmez.
  it("gelen (hazırlanmış) dosyayı olduğu gibi gönderir", async () => {
    const { port, uploadProductImage } = setup({
      cardKey: "c",
      detailKey: "d",
    });
    const controller = new AbortController();
    const onProgress = vi.fn();

    const result = await port(prepared, {
      signal: controller.signal,
      onProgress,
    });

    expect(uploadProductImage).toHaveBeenCalledWith(prepared, {
      signal: controller.signal,
      onProgress,
    });
    expect(result).toEqual({ cardKey: "c", detailKey: "d" });
  });

  it("sunucu anahtar dönmezse çevrilmiş hata mesajı fırlatır", async () => {
    const { port } = setup({});

    await expect(
      port(prepared, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow("product.imageUpload.noServerResult");
  });
});
