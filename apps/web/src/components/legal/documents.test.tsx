/** @format */

import { afterEach, describe, expect, it, vi } from "vitest";
import { serverTreeText } from "@/test-utils/serverTree";
import { EMBED_DOCS } from "@/lib/embed";
import {
  CONSENT_DOCUMENTS,
  currentConsentVersion,
  isDraftConsentVersion,
  type PaymentsInstallmentsConfig,
} from "@tarodan/types";

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
// The installment switch as the server reads it (`GET /payments/config`).
const payments = vi.hoisted(() => ({
  config: { enabled: false, minAmount: 0 } as PaymentsInstallmentsConfig,
}));
vi.mock("@/lib/server/payments-config", () => ({
  getInstallmentsConfig: async () => payments.config,
}));
// Kanca kullanan istemci adası: ağaç çözümünde yalnız yer tutucu.
vi.mock("@/components/legal/cookies/CookiePreferencesPanel", () => ({
  default: () => "cookie-preferences-panel",
}));

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

describe("Kullanım Koşulları — Apple 1.2 kullanıcı içeriği eki yalnız embed'de", () => {
  it("embed: sıfır tolerans / bildir-engelle eki koşullarla birlikte çizilir", async () => {
    const text = await serverTreeText(
      await LegalDocContent({ doc: "terms", embed: true }),
    );
    expect(text).toContain("legal.termsTitle");
    expect(text).toContain("legal.terms.ugcAddendumTitle");
    expect(text).toContain("legal.terms.ugcAddendumHeading");
    expect(text).toContain("legal.terms.ugcAddendumText");
  });

  it("web /terms: versiyonlu metin değişmez, ek YOK", async () => {
    const text = await serverTreeText(await LegalDocContent({ doc: "terms" }));
    expect(text).toContain("legal.termsTitle");
    expect(text).not.toContain("legal.terms.ugcAddendumTitle");
    expect(text).not.toContain("legal.terms.ugcAddendumText");
  });

  it("ek diğer belgelerde yoktur", async () => {
    const text = await serverTreeText(
      await LegalDocContent({ doc: "privacy", embed: true }),
    );
    expect(text).toContain("legal.privacyTitle");
    expect(text).not.toContain("legal.terms.ugcAddendumText");
  });
});

describe("Çerez politikası — tercih paneli yalnız web'de", () => {
  it("web: panel çizilir", async () => {
    const text = await serverTreeText(
      await LegalDocContent({ doc: "cookies" }),
    );
    expect(text).toContain("cookie-preferences-panel");
    expect(text).toContain("legal.cookies.page.s2Title");
  });

  it("embed: yalnız politika metni, panel ve başlığı yok", async () => {
    const text = await serverTreeText(
      await LegalDocContent({ doc: "cookies", embed: true }),
    );
    expect(text).toContain("legal.cookies.page.s1Title");
    expect(text).not.toContain("cookie-preferences-panel");
    expect(text).not.toContain("legal.cookies.page.s2Title");
  });
});

describe("Distance sales contract: the installment clause (AS-L1)", () => {
  const CLAUSE_KEYS = [
    "legal.distanceSales.installmentTermsField",
    "legal.distanceSales.installmentPaymentTerms",
    "legal.distanceSales.installmentRefundTerms",
  ];

  afterEach(() => {
    payments.config = { enabled: false, minAmount: 0 };
  });

  it.each([false, true])(
    "web and the mobile WebView (embed=%s) carry the pre-information field, the payment terms and the refund terms while installments are on",
    async (embed) => {
      payments.config = { enabled: true, minAmount: 500 };
      const text = await serverTreeText(
        await LegalDocContent({ doc: "distance-sales", embed }),
      );
      for (const key of CLAUSE_KEYS) expect(text).toContain(key);
    },
  );

  it.each([false, true])(
    "web and the mobile WebView (embed=%s) show the text before the clause while installments are off",
    async (embed) => {
      const text = await serverTreeText(
        await LegalDocContent({ doc: "distance-sales", embed }),
      );
      for (const key of CLAUSE_KEYS) expect(text).not.toContain(key);
      // The rest of the text is unchanged.
      expect(text).toContain("legal.distanceSales.odenecekToplamTutar");
      expect(text).toContain(
        "legal.distanceSales.teslimAnindaKargoPaketiHasarliysaAlici",
      );
    },
  );

  it("the recorded version follows the same switch: the base text off, the draft clause on", () => {
    expect(
      currentConsentVersion("distance_sales", { installmentsEnabled: false }),
    ).toBe(CONSENT_DOCUMENTS.distance_sales.version);
    const installment = currentConsentVersion("distance_sales", {
      installmentsEnabled: true,
    });
    expect(installment).toBe(
      CONSENT_DOCUMENTS.distance_sales.installmentVersion,
    );
    expect(isDraftConsentVersion(installment)).toBe(true);
    expect(installment > CONSENT_DOCUMENTS.distance_sales.version).toBe(true);
  });
});
