import { describe, expect, it } from "vitest";
import { REDACTED } from "./redact";
import { scrubSentryEvent, scrubSentryTransaction } from "./sentry-scrub";

describe("scrubSentryEvent", () => {
  it("drops cookies whole: the session cookies are bearer tokens", () => {
    const out = scrubSentryEvent({
      request: { cookies: { web_at: "jwt", web_rt: "jwt", NEXT_LOCALE: "tr" } },
    });
    expect(out.request?.cookies).toBe(REDACTED);
  });

  it("masks credential headers and keeps the others", () => {
    const out = scrubSentryEvent({
      request: {
        headers: {
          authorization: "Bearer jwt",
          cookie: "web_at=jwt",
          "user-agent": "UA",
        },
      },
    });
    expect(out.request?.headers).toEqual({
      authorization: REDACTED,
      cookie: REDACTED,
      "user-agent": "UA",
    });
  });

  it("redacts the request body, also when it is a JSON string", () => {
    const fromObject = scrubSentryEvent({
      request: { data: { password: "p", email: "a@b.co", listingId: "l1" } },
    });
    expect(fromObject.request?.data).toEqual({
      password: REDACTED,
      email: REDACTED,
      listingId: "l1",
    });

    const fromString = scrubSentryEvent({
      request: { data: JSON.stringify({ phone: "+905321234567", id: "x" }) },
    });
    expect(JSON.parse(fromString.request?.data as string)).toEqual({
      phone: REDACTED,
      id: "x",
    });
  });

  it("masks credentials in the request URL and query string", () => {
    const out = scrubSentryEvent({
      request: {
        url: "https://tarodan.test/verify-email?token=t1",
        query_string: "token=t1&page=2",
      },
    });
    expect(out.request?.url).toBe(
      `https://tarodan.test/verify-email?token=${REDACTED}`,
    );
    expect(out.request?.query_string).toBe(`token=${REDACTED}&page=2`);
  });

  it("masks credentials in the record and pair forms of the query string", () => {
    const pairs = scrubSentryEvent({
      request: {
        query_string: [
          ["token", "t1"],
          ["code", "c1"],
          ["page", "2"],
        ],
      },
    });
    expect(pairs.request?.query_string).toEqual([
      ["token", REDACTED],
      ["code", REDACTED],
      ["page", "2"],
    ]);

    const record = scrubSentryEvent({
      request: { query_string: { state: "s1", page: "2" } },
    });
    expect(record.request?.query_string).toEqual({
      state: REDACTED,
      page: "2",
    });
  });

  it("keeps only the user id", () => {
    const out = scrubSentryEvent({
      user: { id: "u1", email: "a@b.co", ip_address: "1.2.3.4" } as {
        id: string;
      },
    });
    expect(out.user).toEqual({ id: "u1" });
  });

  it("redacts extra, contexts, tags, breadcrumbs and exception messages", () => {
    const out = scrubSentryEvent({
      message: "failed for ali@example.com",
      extra: { iban: "TR330006100519786457841326", orderId: "o1" },
      contexts: {
        payment: { cardNumber: "4111111111111111", paymentId: "p1" },
      },
      tags: { phone: "+905321234567", app: "web" },
      breadcrumbs: [
        {
          message: "GET /gateway/auth/reset?token=t1",
          data: { url: "/gateway/auth/reset?token=t1", status_code: 400 },
        },
      ],
      exception: { values: [{ value: "IBAN TR330006100519786457841326 bad" }] },
    });
    expect(out.message).toBe(`failed for ${REDACTED}`);
    expect(out.extra).toEqual({ iban: REDACTED, orderId: "o1" });
    expect(out.contexts).toEqual({
      payment: { cardNumber: REDACTED, paymentId: "p1" },
    });
    expect(out.tags).toEqual({ phone: REDACTED, app: "web" });
    expect(out.breadcrumbs?.[0]).toEqual({
      message: `GET /gateway/auth/reset?token=${REDACTED}`,
      data: { url: `/gateway/auth/reset?token=${REDACTED}`, status_code: 400 },
    });
    expect(out.exception?.values?.[0]?.value).toBe(`IBAN ${REDACTED} bad`);
  });

  it("keeps the trace ids intact so the event stays linked to its trace", () => {
    // 13+ consecutive digits that pass Luhn: the card pass would cut them.
    const traceId = "4111111111111111aaaaaaaaaaaaaaaa";
    const out = scrubSentryEvent({
      contexts: {
        trace: {
          trace_id: traceId,
          span_id: "4111111111111111",
          data: { "http.url": "/verify?token=t1" },
        },
      },
    });
    expect(out.contexts?.trace).toEqual({
      trace_id: traceId,
      span_id: "4111111111111111",
      data: { "http.url": `/verify?token=${REDACTED}` },
    });
  });

  it("does not mutate the original event", () => {
    const event = { request: { cookies: { web_at: "jwt" } } };
    scrubSentryEvent(event);
    expect(event.request.cookies).toEqual({ web_at: "jwt" });
  });
});

describe("scrubSentryTransaction", () => {
  it("masks credentials in the transaction name and span URLs", () => {
    const out = scrubSentryTransaction({
      transaction: "/reset-password?token=t1",
      spans: [
        {
          description: "GET https://api.test/auth/verify?token=t1",
          data: { "url.full": "https://api.test/auth/verify?token=t1" },
        },
      ],
    });
    expect(out.transaction).toBe(`/reset-password?token=${REDACTED}`);
    expect(out.spans?.[0]).toEqual({
      description: `GET https://api.test/auth/verify?token=${REDACTED}`,
      data: { "url.full": `https://api.test/auth/verify?token=${REDACTED}` },
    });
  });
});
