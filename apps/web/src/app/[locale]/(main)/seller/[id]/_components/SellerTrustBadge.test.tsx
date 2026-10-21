// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerTrustView } from "@tarodan/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ locale: "tr" }));

// The real next-intl translator over the shared catalog, so the ICU copy is
// parsed exactly as in the app.
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { getMessages } = await import("@tarodan/i18n");
  return {
    ...actual,
    useLocale: () => h.locale,
    useTranslations: () =>
      actual.createTranslator({
        locale: h.locale,
        messages: getMessages(h.locale as "tr" | "en"),
      }),
  };
});

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

  it("renders nothing for a level this client does not know", () => {
    render(view({ level: "elite" as SellerTrustView["level"] }));
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
