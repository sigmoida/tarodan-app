import {
  PAYTR_OID_SUBJECTS,
  buildPaytrMerchantOid,
  looksLikePaytrMerchantOid,
  parsePaytrMerchantOid,
} from "@tarodan/types";
import { REFERENCE_PREFIX } from "./code-prefixes";

describe("buildPaytrMerchantOid", () => {
  it("pins the wire format: dashes dropped + T + last six digits of the clock", () => {
    expect(buildPaytrMerchantOid("GRP-DBN4NPYYTZ", 1_700_000_790_149)).toBe(
      "GRPDBN4NPYYTZT790149",
    );
    expect(buildPaytrMerchantOid("ORD-NGGCF4J4V4", 1_700_000_000_042)).toBe(
      "ORDNGGCF4J4V4T000042",
    );
  });

  it("is idempotent on an already dash-free base (the direct-form call site)", () => {
    expect(buildPaytrMerchantOid("ORDNGGCF4J4V4", 1_700_000_790_149)).toBe(
      buildPaytrMerchantOid("ORD-NGGCF4J4V4", 1_700_000_790_149),
    );
  });

  it("builds trade ids from the TRADE- prefixed number", () => {
    expect(
      buildPaytrMerchantOid("TRADE-TKS-K7X9M2QF3N", 1_700_000_123_456),
    ).toBe("TRADETKSK7X9M2QF3NT123456");
  });

  it("defaults to the current clock", () => {
    const spy = jest.spyOn(Date, "now").mockReturnValue(1_700_000_555_555);
    try {
      expect(buildPaytrMerchantOid("ORD-AAAAAAAAAA")).toBe(
        "ORDAAAAAAAAAAT555555",
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe("parsePaytrMerchantOid", () => {
  it("reads the example from the PayTR panel back to the group number", () => {
    expect(parsePaytrMerchantOid("GRPDBN4NPYYTZT790149")).toEqual({
      oid: "GRPDBN4NPYYTZT790149",
      candidates: [{ subject: "group", number: "GRP-DBN4NPYYTZ" }],
    });
  });

  it.each([
    ["order", "ORD-NGGCF4J4V4", "ORD-NGGCF4J4V4"],
    ["group", "GRP-DBN4NPYYTZ", "GRP-DBN4NPYYTZ"],
    ["trade", "TRADE-TKS-K7X9M2QF3N", "TKS-K7X9M2QF3N"],
  ])("round-trips a %s base number", (subject, base, expected) => {
    const oid = buildPaytrMerchantOid(base, 1_700_000_790_149);
    expect(parsePaytrMerchantOid(oid)?.candidates).toEqual([
      { subject, number: expected },
    ]);
  });

  it("round-trips a base number that itself contains T (strips only the trailing suffix)", () => {
    const oid = buildPaytrMerchantOid("ORD-TTTTT2345TT", 1_700_000_222_333);
    expect(parsePaytrMerchantOid(oid)?.candidates).toEqual([
      { subject: "order", number: "ORD-TTTTT2345TT" },
    ]);
  });

  it("accepts a longer fallback body (collision retry adds four characters)", () => {
    const oid = buildPaytrMerchantOid("ORD-ABCDEFGHJKMNPQ", 1_700_000_222_333);
    expect(parsePaytrMerchantOid(oid)?.candidates).toEqual([
      { subject: "order", number: "ORD-ABCDEFGHJKMNPQ" },
    ]);
  });

  it("is case/whitespace tolerant for a pasted id", () => {
    expect(parsePaytrMerchantOid("  grpdbn4npyytzt790149 \n")?.oid).toBe(
      "GRPDBN4NPYYTZT790149",
    );
  });

  it("keeps a suffix-less body that itself ends in T + 6 digits whole", () => {
    // gövde "ABCT234567" (10 karakter), ek yok: soyulunca 3 karakter kalır → geçersiz
    expect(parsePaytrMerchantOid("ORDABCT234567")?.candidates).toEqual([
      { subject: "order", number: "ORD-ABCT234567" },
    ]);
  });

  it("does not treat a normal search term as a PayTR id", () => {
    for (const term of [
      "ORD-NGGCF4J4V4",
      "GRP-DBN4NPYYTZ",
      "TKS-K7X9M2QF3N",
      "ORD",
      "ORD-",
      "ali",
      "ali@example.com",
      "PKG-K7X9M2QF3N",
      "ORDNGG",
    ]) {
      expect(parsePaytrMerchantOid(term)).toBeNull();
    }
  });

  it("is safe on arbitrary input", () => {
    for (const input of [
      "",
      "   ",
      null,
      undefined,
      42,
      {},
      [],
      "%%%",
      "ORD'; DROP TABLE payments;--",
      "GRP" + "A".repeat(500),
    ]) {
      expect(parsePaytrMerchantOid(input)).toBeNull();
    }
  });
});

describe("looksLikePaytrMerchantOid", () => {
  it("accepts every generated id, whatever the subject prefix", () => {
    for (const base of [
      "ORD-NGGCF4J4V4",
      "GRP-DBN4NPYYTZ",
      "TRADE-TKS-K7X9M2QF3N",
      "BST-K7X9M2QF3N",
      "MEM-K7X9M2QF3N",
      "5c1f0a2e-0b1d-4c3e-9a77-123456789abc",
    ]) {
      expect(
        looksLikePaytrMerchantOid(
          buildPaytrMerchantOid(base, 1_700_000_790_149),
        ),
      ).toBe(true);
    }
  });

  it("is whitespace tolerant", () => {
    expect(looksLikePaytrMerchantOid(" GRPDBN4NPYYTZT790149 ")).toBe(true);
  });

  it("rejects normal search terms and garbage", () => {
    for (const term of [
      "ORD-NGGCF4J4V4",
      "GRPDBN4NPYYTZ",
      "ali veli",
      "ali@example.com",
      "T123456",
      "",
      "  ",
      null,
      undefined,
      42,
    ]) {
      expect(looksLikePaytrMerchantOid(term)).toBe(false);
    }
  });
});

describe("PAYTR_OID_SUBJECTS", () => {
  it("stays aligned with the reference prefixes of code-prefixes.ts", () => {
    const byOid = Object.fromEntries(
      PAYTR_OID_SUBJECTS.map((s) => [s.subject, s.numberPrefix]),
    );
    expect(byOid).toEqual({
      order: REFERENCE_PREFIX.order,
      group: REFERENCE_PREFIX.checkoutGroup,
      trade: REFERENCE_PREFIX.trade,
    });
  });
});
