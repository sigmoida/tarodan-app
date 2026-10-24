import {
  attachFingerprint,
  buildErrorFingerprint,
  normalizeErrorMessage,
  readFingerprint,
} from "./error-fingerprint";

describe("normalizeErrorMessage", () => {
  it("collapses UUIDs and TRD invoice numbers to the same placeholder", () => {
    const a = normalizeErrorMessage(
      "ELOGO_INVOICE_EXHAUSTED id=3fa85f64-5717-4562-b3fc-2c963f66afa6 no=TRD10023",
    );
    const b = normalizeErrorMessage(
      "ELOGO_INVOICE_EXHAUSTED id=9c858901-8a57-4791-81fe-4c455b099bc9 no=TRD98877",
    );

    expect(a).toBe(b);
    expect(a).toBe("ELOGO_INVOICE_EXHAUSTED id=<uuid> no=<code>");
  });

  it("keeps distinct cron job names distinct", () => {
    const refund = normalizeErrorMessage("Cron 'refund-crons' FAILED: timeout");
    const surat = normalizeErrorMessage(
      "Cron 'sync-surat-tracking' FAILED: timeout",
    );

    expect(refund).not.toBe(surat);
    expect(refund).toContain("'refund-crons'");
    expect(surat).toContain("'sync-surat-tracking'");
  });

  it("collapses alphanumeric references so one parcel is not one issue", () => {
    const a = normalizeErrorMessage(
      "Surat tracking API request failed for PKG-WQMTZDB5TT: fetch failed",
    );
    const b = normalizeErrorMessage(
      "Surat tracking API request failed for PKG-K7X9M2QF3N: fetch failed",
    );

    expect(a).toBe(b);
    expect(a).toBe(
      "Surat tracking API request failed for <code>: fetch failed",
    );
  });

  it("collapses a GIB invoice number whatever its prefix", () => {
    expect(normalizeErrorMessage("no=TRD2026000000473 failed")).toBe(
      "no=<code> failed",
    );
  });

  it("collapses durations regardless of the exact number", () => {
    const a = normalizeErrorMessage("query took (34ms) to finish");
    const b = normalizeErrorMessage("query took (47ms) to finish");

    expect(a).toBe(b);
    expect(a).toBe("query took (<dur>) to finish");
  });

  it("strips the query string from URLs but keeps the path", () => {
    const message = normalizeErrorMessage(
      "Surat tracking API request failed for https://api.surat.com.tr/track?CariKodu=1234&Sifre=secret",
    );

    expect(message).toBe(
      "Surat tracking API request failed for https://api.surat.com.tr/track?<query>",
    );
  });

  it("strips the query string from a relative request path too", () => {
    expect(
      normalizeErrorMessage("GET /api/products?search=ali&page=2 -> 500"),
    ).toBe("GET /api/products?<query> -> 500");
  });

  it("masks emails", () => {
    expect(normalizeErrorMessage("failed to notify user@example.com")).toBe(
      "failed to notify <email>",
    );
  });

  it("masks quoted values that contain a digit but keeps plain quoted words", () => {
    expect(normalizeErrorMessage("duplicate key 'order-8821'")).toBe(
      "duplicate key '<value>'",
    );
    expect(normalizeErrorMessage("unknown status 'pending'")).toBe(
      "unknown status 'pending'",
    );
  });

  it("collapses standalone long digit runs", () => {
    const a = normalizeErrorMessage("stock mismatch for sku 100234");
    const b = normalizeErrorMessage("stock mismatch for sku 998877");

    expect(a).toBe(b);
    expect(a).toBe("stock mismatch for sku <num>");
  });

  it("caps the normalized message length", () => {
    const long = "x".repeat(500);
    const normalized = normalizeErrorMessage(long);

    expect(normalized.length).toBeLessThanOrEqual(161);
    expect(normalized.endsWith("…")).toBe(true);
  });
});

describe("buildErrorFingerprint", () => {
  it("produces distinct fingerprints for two different cron jobs", () => {
    const refund = buildErrorFingerprint({
      context: "Nest",
      message: "Cron 'refund-crons' FAILED: timeout",
    });
    const surat = buildErrorFingerprint({
      context: "Nest",
      message: "Cron 'sync-surat-tracking' FAILED: timeout",
    });

    expect(refund).not.toEqual(surat);
  });

  it("produces the same fingerprint for two ELOGO_INVOICE_EXHAUSTED events with different ids", () => {
    const first = buildErrorFingerprint({
      context: "ElogoInvoicingService",
      message:
        "ELOGO_INVOICE_EXHAUSTED id=3fa85f64-5717-4562-b3fc-2c963f66afa6 no=TRD10023",
    });
    const second = buildErrorFingerprint({
      context: "ElogoInvoicingService",
      message:
        "ELOGO_INVOICE_EXHAUSTED id=9c858901-8a57-4791-81fe-4c455b099bc9 no=TRD98877",
    });

    expect(first).toEqual(second);
  });

  it("includes the error name when a real Error was supplied", () => {
    const fingerprint = buildErrorFingerprint({
      context: "PaymentsService",
      errorName: "PrismaClientKnownRequestError",
      message: "Unique constraint failed",
    });

    expect(fingerprint).toEqual([
      "PaymentsService",
      "PrismaClientKnownRequestError",
      "Unique constraint failed",
    ]);
  });

  it("omits the error name when the logger created the error itself", () => {
    const fingerprint = buildErrorFingerprint({
      context: "OrdersService",
      message: "boom",
    });

    expect(fingerprint).toEqual(["OrdersService", "boom"]);
  });
});

describe("attachFingerprint / readFingerprint", () => {
  it("round-trips a fingerprint through an Error instance", () => {
    const error = new Error("boom");
    attachFingerprint(error, ["OrdersService", "boom"]);

    expect(readFingerprint(error)).toEqual(["OrdersService", "boom"]);
  });

  it("returns undefined when nothing was attached", () => {
    expect(readFingerprint(new Error("boom"))).toBeUndefined();
  });

  it("returns undefined for non-Error values", () => {
    expect(readFingerprint("not an error")).toBeUndefined();
  });
});
