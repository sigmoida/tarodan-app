import { describe, expect, it } from "vitest";
import {
  BULK_RENEW_MAX,
  RENEW_FAILED_KEY,
  canBulkRenew,
  chunkIds,
  mergeRenewBatches,
  readRenewBatch,
  primitiveParams,
  reconcileUnknown,
  renewFailureRows,
  resolveErrorKey,
  unknownChunk,
  RENEW_UNKNOWN_KEY,
  renewableRows,
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

describe("renewableRows", () => {
  it("yalnız pasif + süresi doldu satırları seçer", () => {
    const rows = [expired("1"), outOfStock, active, expired("2")];
    expect(renewableRows(rows).map((r) => r.id)).toEqual(["1", "2"]);
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
    unknown: 0,
  };

  it("zarflı ve düz yanıtı aynı okur", () => {
    expect(readRenewBatch(body)).toEqual(body);
    expect(readRenewBatch({ data: body })).toEqual(body);
    expect(readRenewBatch(undefined)).toEqual({
      results: [],
      renewed: 0,
      failed: 0,
      unknown: 0,
    });
  });

  it("parçaları ve düşen parçayı toplar", () => {
    const merged = mergeRenewBatches([
      readRenewBatch(body),
      unknownChunk(["3", "4"]),
    ]);
    expect(merged.renewed).toBe(1);
    expect(merged.failed).toBe(1);
    expect(merged.unknown).toBe(2);
    expect(merged.results.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("reconcileUnknown", () => {
  const batch = mergeRenewBatches([
    readRenewBatch({ results: [{ id: "0", ok: true }] }),
    unknownChunk(["1", "2", "3", "4"]),
  ]);

  it("yeniden okunan durumla sınıflar, okunamayanı bilinmiyor bırakır", () => {
    const current = new Map([
      ["1", { status: "active" }],
      ["2", { status: "inactive", inactiveReason: "expired" }],
      ["3", { status: "sold" }],
      ["4", null],
    ]);
    const out = reconcileUnknown(batch, current);
    expect(out.renewed).toBe(2); // 0 + 1
    expect(out.failed).toBe(2); // 2 ve 3
    expect(out.unknown).toBe(1); // 4
    expect(out.results.find((r) => r.id === "4")).toMatchObject({
      ok: false,
      unknown: true,
      errorKey: RENEW_UNKNOWN_KEY,
    });
  });

  it("hiç okunamazsa hepsi bilinmiyor kalır", () => {
    expect(reconcileUnknown(batch, new Map()).unknown).toBe(4);
  });
});

describe("resolveErrorKey / primitiveParams", () => {
  it("katalogda olmayan anahtar genel nedene düşer", () => {
    const has = (k: string) => k === "server.product.listingLimitReached";
    expect(resolveErrorKey("server.product.listingLimitReached", has)).toBe(
      "server.product.listingLimitReached",
    );
    expect(resolveErrorKey("server.nope", has)).toBe(RENEW_FAILED_KEY);
  });

  it("yalnız string ve number parametreyi geçirir", () => {
    expect(
      primitiveParams({ a: "x", b: 2, c: { d: 1 }, e: null, f: [1] }),
    ).toEqual({ a: "x", b: 2 });
    expect(primitiveParams(undefined)).toEqual({});
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
        unknown: 0,
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
