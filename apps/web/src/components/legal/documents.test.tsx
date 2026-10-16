/** @format */

import { describe, expect, it, vi } from "vitest";
import { serverTreeText } from "@/test-utils/serverTree";
import { EMBED_DOCS } from "@/lib/embed";

/**
 * Çeviri yerine anahtarın kendisi döner: hangi belgenin / hangi ekin çizildiği
 * anahtardan okunur. `t.rich` çerez sayfası için gerekli.
 */
vi.mock("next-intl/server", () => {
  const t = Object.assign((key: string) => key, {
    rich: (key: string) => key,
  });
  return { getTranslations: async () => t };
});
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
// Kanca kullanan istemci adası: ağaç çözümünde yalnız yer tutucu.
vi.mock(
  "@/app/[locale]/(main)/(legal)/cookies/_components/CookiePreferencesPanel",
  () => ({ default: () => "cookie-preferences-panel" }),
);

import { LEGAL_DOCS, LegalDocContent, legalDocMeta } from "./documents";

/** Her belgenin başlığını/içeriğini taşıyan ayırt edici bir anahtar. */
const MARKER: Record<(typeof EMBED_DOCS)[number], string> = {
  terms: "legal.termsTitle",
  privacy: "legal.privacyTitle",
  "distance-sales": "legal.distanceSalesTitle",
  cookies: "legal.cookiesTitle",
  "seller-agreement": "legal.sellerAgreement.pageTitle",
  "refund-policy": "legal.refundPolicyTitle",
};

describe("LEGAL_DOCS", () => {
  it("embed listesindeki her belgenin kaydı vardır", () => {
    expect(Object.keys(LEGAL_DOCS).sort()).toEqual([...EMBED_DOCS].sort());
  });

  it.each(EMBED_DOCS)(
    "%s render olur ve kendi başlığını taşır",
    async (doc) => {
      const text = await serverTreeText(await LegalDocContent({ doc }));
      expect(text).toContain(MARKER[doc]);
    },
  );

  it.each(EMBED_DOCS)("%s için meta başlık ve açıklama üretir", async (doc) => {
    const meta = await legalDocMeta(doc, "tr");
    expect(meta.title).toBeTruthy();
    expect(meta.description).toBeTruthy();
  });

  it("belgeler birbirinin içeriğini taşımaz", async () => {
    const text = await serverTreeText(
      await LegalDocContent({ doc: "privacy" }),
    );
    expect(text).not.toContain(MARKER.terms);
    expect(text).not.toContain(MARKER.cookies);
  });
});

describe("Kullanım Koşulları — Apple 1.2 kullanıcı içeriği eki", () => {
  it("sıfır tolerans / bildir-engelle eki koşullarla birlikte çizilir", async () => {
    const text = await serverTreeText(await LegalDocContent({ doc: "terms" }));
    expect(text).toContain("legal.terms.ugcAddendumTitle");
    expect(text).toContain("legal.terms.ugcAddendumHeading");
    expect(text).toContain("legal.terms.ugcAddendumText");
  });

  it("ek yalnız koşullarda vardır", async () => {
    const text = await serverTreeText(
      await LegalDocContent({ doc: "privacy" }),
    );
    expect(text).not.toContain("legal.terms.ugcAddendumText");
  });
});
