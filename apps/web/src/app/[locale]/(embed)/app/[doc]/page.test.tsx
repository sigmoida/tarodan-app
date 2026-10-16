/** @format */

import { describe, expect, it, vi } from "vitest";
import { serverTreeText } from "@/test-utils/serverTree";
import { EMBED_DOCS } from "@/lib/embed";

vi.mock("next-intl/server", () => {
  const t = Object.assign((key: string) => key, {
    rich: (key: string) => key,
  });
  return { getTranslations: async () => t, setRequestLocale: vi.fn() };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/components/legal/cookies/CookiePreferencesPanel", () => ({
  default: () => "cookie-preferences-panel",
}));

import EmbedDocPage, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from "./page";

const params = (locale: string, doc: string) =>
  Promise.resolve({ locale, doc });

describe("(embed)/app/[doc] sayfası", () => {
  it.each(EMBED_DOCS)("/app/%s render olur (tr ve en)", async (doc) => {
    for (const locale of ["tr", "en"]) {
      const text = await serverTreeText(
        await EmbedDocPage({ params: params(locale, doc) }),
      );
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it("bilinmeyen belge 404'tür", async () => {
    await expect(
      EmbedDocPage({ params: params("tr", "intellectual-property") }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      EmbedDocPage({ params: params("tr", "nope") }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("listede olmayan parametre üretilmez (dynamicParams kapalı)", () => {
    expect(dynamicParams).toBe(false);
  });

  it("6 belge × 2 locale statik üretilir", () => {
    const all = generateStaticParams();
    expect(all).toHaveLength(12);
    expect(all).toContainEqual({ locale: "tr", doc: "terms" });
    expect(all).toContainEqual({ locale: "en", doc: "refund-policy" });
  });

  it("/app/terms embed kipinde çizilir: UGC eki var", async () => {
    const text = await serverTreeText(
      await EmbedDocPage({ params: params("tr", "terms") }),
    );
    expect(text).toContain("legal.terms.ugcAddendumText");
  });

  it("/app/cookies tercih panelini göstermez", async () => {
    const text = await serverTreeText(
      await EmbedDocPage({ params: params("tr", "cookies") }),
    );
    expect(text).toContain("legal.cookies.page.s1Title");
    expect(text).not.toContain("cookie-preferences-panel");
  });

  it("metadata: belge başlığı (noindex layout'ta, burada tekrarlanmaz)", async () => {
    const meta = await generateMetadata({ params: params("tr", "privacy") });
    expect(meta.title).toBe("legal.privacy.metaTitle");
    expect(meta.robots).toBeUndefined();
  });
});
