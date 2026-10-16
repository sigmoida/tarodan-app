import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_ENTITY } from "./platform-entity";

const PLACEHOLDER = /X{2,}/i;

describe("PLATFORM_ENTITY contact facts", () => {
  it("carries a real phone number and e-mail, never a placeholder", () => {
    expect(PLATFORM_ENTITY.phone).toMatch(/^0 \d{3} \d{3} \d{2} \d{2}$/);
    expect(PLATFORM_ENTITY.phone).not.toMatch(PLACEHOLDER);
    expect(PLATFORM_ENTITY.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});

describe("cookie policy contact section", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/legal/cookies/CookiesDocument.tsx"),
    "utf8",
  );

  it("reads the contact details from the single legal-facts source", () => {
    // Yer tutucu telefon (0850 XXX XX XX) yayında kalmıştı; ikinci bir kopya
    // yerine künye dosyasına bağlıdır.
    expect(source).toContain("{PLATFORM_ENTITY.phone}");
    expect(source).toContain("{PLATFORM_ENTITY.email}");
    expect(source).not.toMatch(/0850/);
    expect(source).not.toMatch(PLACEHOLDER);
  });
});
