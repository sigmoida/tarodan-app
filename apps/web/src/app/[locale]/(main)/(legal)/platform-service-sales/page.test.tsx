/** @format */

import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CONSENT_DOCUMENTS } from "@tarodan/types";
import { serverTreeText } from "@/test-utils/serverTree";
import { PLATFORM_ENTITY } from "@/lib/legal/platform-entity";
import { isConsentGateExempt } from "@/lib/consentGate";

// The key comes back instead of the text, with its values, so the test reads
// which copy the page renders.
vi.mock("next-intl/server", () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${JSON.stringify(values)}` : key;
  return { getTranslations: async () => t };
});
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

import PlatformServiceSalesPage, { generateMetadata } from "./page";

describe("/platform-service-sales", () => {
  it("lives at the consent document's path, which the consent gate exempts", () => {
    const route = `/${path.basename(__dirname)}`;
    expect(CONSENT_DOCUMENTS.platform_service_sales.path).toBe(route);
    expect(isConsentGateExempt(route)).toBe(true);
  });

  it("renders the title and only the plan's draft copy with the legal identity", async () => {
    const text = await serverTreeText(await PlatformServiceSalesPage());

    expect(text).toContain("legal.platformServiceSales.title");
    expect(text).toContain("profile.boost.preInfo.title");
    expect(text).toContain(
      `profile.boost.preInfo.provider|${JSON.stringify({ company: PLATFORM_ENTITY.legalName })}`,
    );
    expect(text).toContain(PLATFORM_ENTITY.address);
    expect(text).toContain(PLATFORM_ENTITY.kep);
    expect(text).toContain("profile.boost.preInfo.start");
    expect(text).toContain("profile.boost.preInfo.noCancel");
  });

  it("has the document title and a localized canonical", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });
    expect(meta.title).toBe("legal.platformServiceSales.title");
    expect(JSON.stringify(meta.alternates)).toContain(
      "/en/platform-service-sales",
    );
  });
});
