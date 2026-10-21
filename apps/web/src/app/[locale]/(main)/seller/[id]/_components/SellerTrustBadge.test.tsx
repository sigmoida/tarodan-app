// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerTrustView } from "@tarodan/types";
import en from "../../../../../../../../../packages/i18n/src/catalog/en.json";
import tr from "../../../../../../../../../packages/i18n/src/catalog/tr.json";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ locale: "tr" }));

vi.mock("next-intl", () => ({
  useLocale: () => h.locale,
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const catalog = (h.locale === "tr" ? tr : en) as Record<string, unknown>;
    let node: unknown = catalog;
    for (const part of key.split(".")) {
      node = (node as Record<string, unknown> | undefined)?.[part];
    }
    let text = typeof node === "string" ? node : key;
    for (const [k, v] of Object.entries(values ?? {})) {
      text = text.replace(`{${k}}`, String(v));
    }
    return text;
  },
}));

import SellerTrustBadge from "./SellerTrustBadge";

const view = (over: Partial<SellerTrustView>): SellerTrustView => ({
  rating: 3.74,
  level: "fair",
  formulaVersion: 1,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

function render(trust: SellerTrustView | null | undefined) {
  act(() => {
    root.render(<SellerTrustBadge trust={trust} />);
  });
}

beforeEach(() => {
  h.locale = "tr";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("SellerTrustBadge", () => {
  it("shows the rating with a comma and the level in tr", () => {
    render(view({}));
    expect(container.textContent).toBe("Güven skoru 3,74/5 · Orta");
  });

  it("shows the rating with a dot and the level in en", () => {
    h.locale = "en";
    render(view({}));
    expect(container.textContent).toBe("Trust score 3.74/5 · Fair");
  });

  it("always shows two decimals", () => {
    render(view({ rating: 4, level: "trusted" }));
    expect(container.textContent).toBe("Güven skoru 4,00/5 · Güvenilir");
  });

  it("shows the new-seller state", () => {
    render(view({ rating: null, level: "new" }));
    expect(container.textContent).toBe("Güven skoru: Yeni satıcı");
  });

  it("renders nothing when trust is null or absent", () => {
    render(null);
    expect(container.innerHTML).toBe("");
    render(undefined);
    expect(container.innerHTML).toBe("");
  });

  it("opens the calculation info on press", () => {
    render(view({}));
    expect(document.body.textContent).not.toContain(
      "Güven skoru nasıl hesaplanır?",
    );
    act(() => {
      container.querySelector("button")!.click();
    });
    expect(document.body.textContent).toContain(
      "Güven skoru nasıl hesaplanır?",
    );
    expect(document.body.textContent).toContain(
      "En az 5 tamamlanmış işlemi olmayan",
    );
  });
});
