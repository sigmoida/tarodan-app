import { paytrOidViewOf } from "./payment-paytr-oid";

describe("paytrOidViewOf", () => {
  it("returns the current oid and previous attempts newest first", () => {
    expect(
      paytrOidViewOf({
        providerConversationId: "GRPAAAAAAAAAAT000003",
        metadata: {
          merchantOidHistory: ["GRPAAAAAAAAAAT000001", "GRPAAAAAAAAAAT000002"],
        },
      }),
    ).toEqual({
      paytrOid: "GRPAAAAAAAAAAT000003",
      paytrOidHistory: ["GRPAAAAAAAAAAT000002", "GRPAAAAAAAAAAT000001"],
    });
  });

  it("drops the current oid and duplicates from the history", () => {
    expect(
      paytrOidViewOf({
        providerConversationId: "A",
        metadata: { merchantOidHistory: ["B", "A", "B"] },
      }),
    ).toEqual({ paytrOid: "A", paytrOidHistory: ["B"] });
  });

  it("is empty for a payment without an attempt, a missing payment or odd metadata", () => {
    const empty = { paytrOid: null, paytrOidHistory: [] };
    expect(paytrOidViewOf(null)).toEqual(empty);
    expect(
      paytrOidViewOf({ providerConversationId: null, metadata: null }),
    ).toEqual(empty);
    expect(
      paytrOidViewOf({
        providerConversationId: "",
        metadata: { merchantOidHistory: "not-an-array" },
      }),
    ).toEqual(empty);
  });
});
