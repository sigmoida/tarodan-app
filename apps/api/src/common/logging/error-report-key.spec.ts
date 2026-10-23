import { extractIdentifiers } from "./error-identifiers";
import {
  attachReportKey,
  buildErrorReportKey,
  errorMessageShape,
  takeReportKey,
} from "./error-report-key";

/**
 * The repeat-report key decides which Sentry events are "the same failure of
 * the same entity" and may be throttled. Too coarse hides a new failure; too
 * fine lets a cron burn the quota again. The messages below are the real
 * production repeaters (TARODAN-API-13, -Z, -10, -2, -12, -1R).
 */
describe("buildErrorReportKey", () => {
  const key = (message: string, context = "CronTracker", errorName?: string) =>
    buildErrorReportKey({ context, errorName, message });

  const suratRun = (durationMs: number, consecutive: number, pkg: string) =>
    `Cron 'sync-surat-tracking' FAILED (${durationMs}ms): 1 cron adımı başarısız: ` +
    `order-tracking-records: 1 kayıt senkronlanamadı: ${pkg} (network: Surat tracking ` +
    `API request failed for ${pkg}: fetch failed (eşik aşıldı: ${consecutive} ardışık ` +
    `hata, ilk hata 2026-10-16T21:00:10.994Z))`;

  it("gives the same parcel failing again in a later run the same key", () => {
    expect(key(suratRun(1204, 7, "PKG-WQMTZDB5TT"))).toBe(
      key(suratRun(388, 31, "PKG-WQMTZDB5TT")),
    );
  });

  it("gives another parcel failing the same way its own key", () => {
    expect(key(suratRun(1204, 7, "PKG-WQMTZDB5TT"))).not.toBe(
      key(suratRun(1204, 7, "PKG-K7X9M2QF3N")),
    );
  });

  it("gives a run summary that starts listing one more parcel a new key", () => {
    const one =
      "order-tracking-records: 1 kayıt senkronlanamadı: PKG-WQMTZDB5TT";
    const two =
      "order-tracking-records: 2 kayıt senkronlanamadı: PKG-WQMTZDB5TT, PKG-K7X9M2QF3N";
    expect(key(one)).not.toBe(key(two));
  });

  it("does not key by a one-time value in a query string", () => {
    expect(
      key("OAuth callback failed at /api/auth/callback?code=4f9a1c&state=x"),
    ).toBe(
      key("OAuth callback failed at /api/auth/callback?code=77be02&state=y"),
    );
  });

  it("treats an amount after a word ending in 'id' as a number, not an entity", () => {
    expect(key("Order paid: 1250 but ledger missing")).toBe(
      key("Order paid: 980 but ledger missing"),
    );
  });

  it("ignores the order in which a summary lists the same entities", () => {
    expect(key("failed: PKG-WQMTZDB5TT, PKG-K7X9M2QF3N")).toBe(
      key("failed: PKG-K7X9M2QF3N, PKG-WQMTZDB5TT"),
    );
  });

  it("keeps two exhausted invoices apart and one invoice stable", () => {
    const exhausted = (id: string, no: string) =>
      `ELOGO_INVOICE_EXHAUSTED id=${id} type=buyer_shipping source=3fbe59ae-3fbd-41a6-a446-40614c3df98f ` +
      `no=${no}: XSLT tasarım hatası. (id: 948894, uuid: 6723E696-91EC-460F-88BC-D72853282FB2)`;
    const a = exhausted(
      "8941508c-8033-4ab2-8c21-00fa1015a6e2",
      "TRD2026000000455",
    );
    const b = exhausted(
      "a0e387a3-496a-4958-a1e9-1a073f0bb56c",
      "TRD2026000000392",
    );

    expect(key(a, "InvoiceDeliveryService")).toBe(
      key(a, "InvoiceDeliveryService"),
    );
    expect(key(a, "InvoiceDeliveryService")).not.toBe(
      key(b, "InvoiceDeliveryService"),
    );
  });

  it("keeps a per-refund failure per refund", () => {
    const finalize = (id: string) =>
      `Failed to finalize refund ${id}: Bad Request Exception`;
    expect(key(finalize("3fa85f64-5717-4562-b3fc-2c963f66afa6"))).not.toBe(
      key(finalize("9c858901-8a57-4791-81fe-4c455b099bc9")),
    );
  });

  it("treats a counter-only change of an alarm as the same alarm", () => {
    expect(
      key(
        "ORDERS_STUCK_SHIPPED count=1 — 10 günden uzun süre kargoda",
        "OrderScheduler",
      ),
    ).toBe(
      key(
        "ORDERS_STUCK_SHIPPED count=2 — 10 günden uzun süre kargoda",
        "OrderScheduler",
      ),
    );
  });

  it("separates the same text from another context or error class", () => {
    const message = "Unique constraint failed";
    expect(key(message, "OrdersService")).not.toBe(
      key(message, "PaymentsService"),
    );
    expect(
      key(message, "OrdersService", "PrismaClientKnownRequestError"),
    ).not.toBe(key(message, "OrdersService"));
  });

  it("is an opaque hash that carries no message text (it is stored in Redis)", () => {
    const k = key("failed to notify user@example.com about ORD-K7X9M2QF3N");
    expect(k).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("errorMessageShape", () => {
  it("collapses numbers but not the identifiers' own digits", () => {
    expect(errorMessageShape("1 kayıt (12ms) PKG-WQMTZDB5TT")).toBe(
      "# kayıt (#ms) <id>",
    );
  });

  it("masks e-mails and URL query strings", () => {
    expect(
      errorMessageShape(
        "mail to user@example.com failed at https://api.example.com/track?CariKodu=1&Sifre=x",
      ),
    ).toBe("mail to <email> failed at https://api.example.com/track?<query>");
  });

  it("masks the query of a relative request path too (same rule as the fingerprint)", () => {
    expect(errorMessageShape("GET /api/products?search=tamiya -> 500")).toBe(
      "GET /api/products?<query> -> #",
    );
  });
});

describe("extractIdentifiers", () => {
  it("finds every identifier form a log line uses", () => {
    expect(
      extractIdentifiers(
        "order ORD-K7X9M2QF3N pkg PKG-WQMTZDB5TT payout PYTK7X9M2QF3N invoice " +
          "TRD2026000000473 internal SPR-202607-000001 user B010001 " +
          "row 3fa85f64-5717-4562-b3fc-2c963f66afa6 orderId=abc-1 no=42",
      ),
    ).toEqual(
      [
        "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "42",
        "B010001",
        "ORD-K7X9M2QF3N",
        "PKG-WQMTZDB5TT",
        "PYTK7X9M2QF3N",
        "SPR-202607-000001",
        "TRD2026000000473",
        "abc-1",
      ].sort(),
    );
  });

  it("takes camelCase and snake_case keys, not words that end in id/no/ref/code", () => {
    expect(
      extractIdentifiers(
        "invoiceNo=INV7 order_id: o-9 refundRef=r1 errorCode=E42 paid: 1250 Android: 14 Invalid: x",
      ),
    ).toEqual(["E42", "INV7", "o-9", "r1"]);
  });

  it("does not take plain words that start like a prefix for identifiers", () => {
    expect(
      extractIdentifiers("MEMBERSHIP renewal and PYTHON worker failed"),
    ).toEqual([]);
  });
});

describe("attachReportKey / takeReportKey", () => {
  it("round-trips the key on an Error", () => {
    const error = new Error("boom");
    attachReportKey(error, "abc");
    expect(takeReportKey(error)).toBe("abc");
  });

  it("hands the key out once: a later capture of the same error is unkeyed", () => {
    const error = new Error("boom");
    attachReportKey(error, "abc");
    takeReportKey(error);
    expect(takeReportKey(error)).toBeUndefined();
  });

  it("returns undefined for unkeyed errors and non-errors", () => {
    expect(takeReportKey(new Error("boom"))).toBeUndefined();
    expect(takeReportKey("boom")).toBeUndefined();
  });
});
