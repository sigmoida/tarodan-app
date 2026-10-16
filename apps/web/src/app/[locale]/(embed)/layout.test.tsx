/** @format */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));

import EmbedLayout, { metadata } from "./layout";

describe("(embed) düzeni", () => {
  it("yalnız safe-area boşluklu bir <main> çizer, çocuğu sarar", async () => {
    const el = (await EmbedLayout({
      children: "içerik",
      params: Promise.resolve({ locale: "tr" }),
    })) as ReactElement<{ className: string; children: string }>;
    expect(el.type).toBe("main");
    expect(el.props.children).toBe("içerik");
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(el.props.className).toContain(`env(safe-area-inset-${side})`);
    }
  });

  it("indekslenmez", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("vitrin kromunu / kapılarını / sağlayıcıları import etmez", () => {
    const source = readFileSync(path.join(__dirname, "layout.tsx"), "utf8");
    const imports = source
      .split("\n")
      .filter((line) => line.startsWith("import "))
      .join("\n");
    for (const banned of [
      "Header",
      "Footer",
      "TopAdsBar",
      "RequiredStepsGate",
      "BusinessMembershipGuard",
      "SellerAddressPrompt",
      "RealtimeProvider",
      "Breadcrumb",
    ]) {
      expect(imports).not.toContain(banned);
    }
  });
});
