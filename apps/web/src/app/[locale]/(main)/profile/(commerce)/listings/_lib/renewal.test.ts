/** @format */

import { describe, expect, it } from "vitest";
import type { Translate } from "@/types/i18n";
import { readRenewBatch, renewalFailureLines, type RenewBatch } from "./renewal";

/** Anahtarı (ve varsa parametreleri) geri döndüren sahte t. */
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as Translate;

const batch: RenewBatch = {
  renewed: 1,
  submitted: 0,
  failed: 4,
  results: [
    { id: "a", ok: true, status: "active" },
    {
      id: "b",
      ok: false,
      errorKey: "server.product.listingLimitReached",
      errorParams: { tierName: "Free", maxListings: 5 },
    },
    { id: "c", ok: false, errorKey: "server.product.renewFailed" },
    { id: "d", ok: false, errorKey: "server.product.renewFailed" },
    { id: "e", ok: false, errorKey: "server.product.renewFailed" },
  ],
};

describe("renewal batch", () => {
  it("reads the batch with or without an envelope", () => {
    expect(readRenewBatch(batch)).toEqual(batch);
    expect(readRenewBatch({ data: batch })).toEqual(batch);
    expect(readRenewBatch(undefined)).toEqual({
      results: [],
      renewed: 0,
      submitted: 0,
      failed: 0,
    });
  });

  it("lists the failed listings with the reason rendered from the catalog key", () => {
    const lines = renewalFailureLines(batch, (id) => `Listing ${id}`, t);
    expect(lines[0]).toBe(
      'profile.expiredListings.failedItem:{"title":"Listing b","reason":"server.product.listingLimitReached:{\\"tierName\\":\\"Free\\",\\"maxListings\\":5}"}',
    );
  });

  it("writes at most three failures and never the successful ones", () => {
    const lines = renewalFailureLines(batch, (id) => id, t);
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).not.toContain('"title":"a"');
  });
});
