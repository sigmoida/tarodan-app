import {
  merchantOidHistoryOf,
  nextMerchantOidHistory,
  paymentOids,
} from "./payment-oids";

describe("merchantOidHistoryOf", () => {
  it("reads the non-empty string entries in stored order", () => {
    expect(
      merchantOidHistoryOf({ merchantOidHistory: ["A", "", 3, "B"] }),
    ).toEqual(["A", "B"]);
  });

  it("is empty for missing, non-object or malformed metadata", () => {
    expect(merchantOidHistoryOf(null)).toEqual([]);
    expect(merchantOidHistoryOf("x")).toEqual([]);
    expect(merchantOidHistoryOf({})).toEqual([]);
    expect(merchantOidHistoryOf({ merchantOidHistory: "A" })).toEqual([]);
  });
});

describe("paymentOids", () => {
  it("returns the current oid first, then the history", () => {
    expect(
      paymentOids({
        providerConversationId: "C",
        metadata: { merchantOidHistory: ["A", "B"] },
      }),
    ).toEqual(["C", "A", "B"]);
  });

  it("skips an absent current oid", () => {
    expect(
      paymentOids({
        providerConversationId: null,
        metadata: { merchantOidHistory: ["A"] },
      }),
    ).toEqual(["A"]);
  });
});

describe("nextMerchantOidHistory", () => {
  it("appends the previous oid once", () => {
    expect(
      nextMerchantOidHistory({ merchantOidHistory: ["A"] }, "B", "C"),
    ).toEqual(["A", "B"]);
    expect(
      nextMerchantOidHistory({ merchantOidHistory: ["A", "B"] }, "B", "C"),
    ).toEqual(["A", "B"]);
  });

  it("never records the new oid itself or an empty previous oid", () => {
    expect(nextMerchantOidHistory({}, "C", "C")).toEqual([]);
    expect(nextMerchantOidHistory({}, null, "C")).toEqual([]);
    expect(nextMerchantOidHistory(undefined, undefined, "C")).toEqual([]);
  });

  it("does not mutate the stored history", () => {
    const meta = { merchantOidHistory: ["A"] };
    nextMerchantOidHistory(meta, "B", "C");
    expect(meta.merchantOidHistory).toEqual(["A"]);
  });
});
