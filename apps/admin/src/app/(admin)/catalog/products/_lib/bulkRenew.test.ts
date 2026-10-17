import { describe, expect, it } from "vitest";
import {
  BULK_RENEW_MAX,
  RENEW_FAILED_KEY,
  canBulkRenew,
  chunkIds,
  failedChunk,
  mergeRenewBatches,
  readRenewBatch,
  renewFailureRows,
  renewableRows,
  skippedCount,
  type RenewTarget,
} from "./bulkRenew";

const expired = (id: string): RenewTarget => ({
  id,
  status: "inactive",
  inactiveReason: "expired",
  title: `İlan ${id}`,
  productCode: `U${id}`,
});
const outOfStock: RenewTarget = {
  id: "s",
  status: "inactive",
  inactiveReason: "out_of_stock",
};
const active: RenewTarget = { id: "a", status: "active" };

describe("renewableRows / skippedCount", () => {
  it("yalnız pasif + süresi doldu satırları seçer", () => {
    const rows = [expired("1"), outOfStock, active, expired("2")];
    expect(renewableRows(rows).map((r) => r.id)).toEqual(["1", "2"]);
    expect(skippedCount(rows)).toBe(2);
  });

  it("uygun satır yoksa boş döner", () => {
    expect(renewableRows([outOfStock, active])).toEqual([]);
  });
});

describe("canBulkRenew", () => {
  it("en az bir uygun satır varken açılır", () => {
    expect(canBulkRenew([active, expired("1")], false)).toBe(true);
  });

  it("seçim boşsa ya da hiç uygun satır yoksa kapalıdır", () => {
    expect(canBulkRenew([], false)).toBe(false);
    expect(canBulkRenew([outOfStock, active], false)).toBe(false);
  });

  it("istek sürerken kapalıdır", () => {
    expect(canBulkRenew([expired("1")], true)).toBe(false);
  });
});

describe("chunkIds", () => {
  it("sunucu üst sınırında böler", () => {
    const ids = Array.from(
      { length: BULK_RENEW_MAX * 2 + 1 },
      (_, i) => `${i}`,
    );
    expect(chunkIds(ids).map((c) => c.length)).toEqual([
      BULK_RENEW_MAX,
      BULK_RENEW_MAX,
      1,
    ]);
  });

  it("boş girdide parça üretmez", () => {
    expect(chunkIds([])).toEqual([]);
  });
});

describe("sonuç birleştirme", () => {
  const body = {
    results: [
      { id: "1", ok: true },
      { id: "2", ok: false, errorKey: "server.product.listingLimitReached" },
    ],
    renewed: 1,
    failed: 1,
  };

  it("zarflı ve düz yanıtı aynı okur", () => {
    expect(readRenewBatch(body)).toEqual(body);
    expect(readRenewBatch({ data: body })).toEqual(body);
    expect(readRenewBatch(undefined)).toEqual({
      results: [],
      renewed: 0,
      failed: 0,
    });
  });

  it("parçaları ve düşen parçayı toplar", () => {
    const merged = mergeRenewBatches([
      readRenewBatch(body),
      failedChunk(["3", "4"]),
    ]);
    expect(merged.renewed).toBe(1);
    expect(merged.failed).toBe(3);
    expect(merged.results.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("renewFailureRows", () => {
  it("başarısızları başlık ve neden anahtarıyla listeler", () => {
    const result = mergeRenewBatches([
      {
        results: [
          { id: "1", ok: true },
          {
            id: "2",
            ok: false,
            errorKey: "server.product.listingLimitReached",
            errorParams: { limit: 5 },
          },
          { id: "9", ok: false, errorKey: RENEW_FAILED_KEY },
        ],
        renewed: 1,
        failed: 2,
      },
    ]);
    const rows = renewFailureRows(result, [expired("1"), expired("2")]);
    expect(rows).toEqual([
      {
        id: "2",
        title: "İlan 2",
        productCode: "U2",
        errorKey: "server.product.listingLimitReached",
        errorParams: { limit: 5 },
      },
      // Hedeflerde olmayan id başlık yerine kimliğiyle görünür.
      {
        id: "9",
        title: "9",
        productCode: undefined,
        errorKey: RENEW_FAILED_KEY,
        errorParams: {},
      },
    ]);
  });
});
