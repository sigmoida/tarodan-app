import { ConsentAction, ConsentSource } from "@prisma/client";
import { CONSENT_DOCUMENTS } from "@tarodan/types";
import { toConsentRow } from "./consent-row";

describe("toConsentRow", () => {
  it("stamps the catalog version and the evidence it is given", () => {
    const row = toConsentRow(
      {
        document: "kvkk",
        source: ConsentSource.registration,
        subject: { userId: "u1" },
      },
      "203.0.113.7",
      "jest",
    );

    expect(row).toMatchObject({
      document: "kvkk",
      version: CONSENT_DOCUMENTS.kvkk.version,
      action: ConsentAction.granted,
      userId: "u1",
      visitorId: null,
      guestEmail: null,
      ipAddress: "203.0.113.7",
      userAgent: "jest",
    });
  });

  it("binds a trade consent to its cash payment, and nothing else to one", () => {
    const trade = toConsentRow(
      {
        document: "distance_sales",
        source: ConsentSource.payment,
        subject: { userId: "u1" },
        tradeCashPaymentId: "tcp-1",
      },
      null,
      null,
    );
    const cart = toConsentRow(
      {
        document: "distance_sales",
        source: ConsentSource.checkout,
        subject: { userId: "u1" },
        checkoutGroupId: "group-1",
      },
      null,
      null,
    );

    expect(trade.tradeCashPaymentId).toBe("tcp-1");
    expect(cart.tradeCashPaymentId).toBeNull();
  });

  it("lower-cases and trims the guest email", () => {
    const row = toConsentRow(
      {
        document: "distance_sales",
        source: ConsentSource.checkout,
        subject: { guestEmail: "  Guest@Example.COM " },
      },
      null,
      null,
    );
    expect(row.guestEmail).toBe("guest@example.com");
  });

  it("refuses an entry without any subject", () => {
    expect(() =>
      toConsentRow(
        { document: "terms", source: ConsentSource.registration, subject: {} },
        null,
        null,
      ),
    ).toThrow(/without a subject/);
  });

  it("refuses an unknown document key", () => {
    expect(() =>
      toConsentRow(
        {
          document: "nope" as never,
          source: ConsentSource.registration,
          subject: { userId: "u1" },
        },
        null,
        null,
      ),
    ).toThrow(/Unknown consent document/);
  });
});
