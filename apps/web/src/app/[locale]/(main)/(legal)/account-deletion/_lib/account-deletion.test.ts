import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { getMessages } from "@tarodan/i18n";
import type { LegalBlock } from "@/components/legal/LegalDocument";
import { PLATFORM_ENTITY } from "@/lib/legal/platform-entity";
import type { Translate } from "@/types/i18n";
import { accountDeletionParts } from "./account-deletion";

const blocksOf = (locale: "tr" | "en"): LegalBlock[] => {
  const t = createTranslator({ locale, messages: getMessages(locale) });
  return accountDeletionParts(t as unknown as Translate).flatMap((part) =>
    part.sections.flatMap((section) => section.blocks),
  );
};

const textOf = (blocks: LegalBlock[]): string =>
  blocks
    .map((block) => {
      if (block.type === "p" || block.type === "note") return block.text;
      if (block.type === "list")
        return block.items.map((i) => i.text).join(" ");
      if (block.type === "fields")
        return block.items.map((i) => `${i.label} ${i.value ?? ""}`).join(" ");
      return block.groups.flatMap((g) => g.items).join(" ");
    })
    .join(" ");

/**
 * Google Play hesap silme şartı: sayfa silme yollarını, silinen ve saklanan
 * veriyi ve bir iletişim kanalını göstermeli. Saklama süresi API'deki kimlik
 * arşiviyle (IDENTITY_RETENTION_YEARS = 10) aynı olmalı.
 */
describe("accountDeletionParts", () => {
  it.each(["tr", "en"] as const)(
    "%s: every section renders catalog text, not a raw key",
    (locale) => {
      const text = textOf(blocksOf(locale));
      expect(text).not.toMatch(/legal\.accountDeletion\./);
    },
  );

  it.each(["tr", "en"] as const)(
    "%s: states the 10-year identity retention",
    (locale) => {
      expect(textOf(blocksOf(locale))).toMatch(/10/);
    },
  );

  it("gives the support contact from the single legal-facts source", () => {
    const fields = blocksOf("tr").find((block) => block.type === "fields");
    expect(fields).toBeDefined();
    const values =
      fields?.type === "fields" ? fields.items.map((i) => i.value) : [];
    expect(values).toEqual([PLATFORM_ENTITY.email, PLATFORM_ENTITY.phone]);
  });
});
