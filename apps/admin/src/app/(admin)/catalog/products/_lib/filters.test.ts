import { describe, expect, it, vi } from "vitest";

// Alanların `render`i burada çağrılmaz; yalnız anahtarlar okunur. Bileşen
// kütüphanesini node ortamına yüklememek için Select taklit edilir.
vi.mock("@tarodan/ui", () => ({ Select: () => null }));

import { productFilterKeys } from "./filters";

const t = ((key: string) => key) as unknown as Parameters<
  typeof productFilterKeys
>[0];

describe("productFilterKeys", () => {
  it("listenin gönderdiği TÜM filtre anahtarlarını diyalog alanlarından türetir", () => {
    expect(productFilterKeys(t)).toEqual([
      "sellerId",
      "brandId",
      "carModelId",
      "removalReason",
      "removalActor",
      "startDate",
      "endDate",
    ]);
  });
});
