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
  const label = () =>
    container.querySelector("button")!.getAttribute("aria-label");

  it("shows only the number with a comma in tr", () => {
    render(view({}));
    expect(container.textContent).toBe("3,74");
    expect(label()).toBe(
      "Güven skoru 3,74/5, Orta. Güven skoru nasıl hesaplanır?",
    );
  });

  it("shows only the number with a dot in en", () => {
    h.locale = "en";
    render(view({}));
    expect(container.textContent).toBe("3.74");
    expect(label()).toBe(
      "Trust score 3.74 out of 5, Fair. How is the trust score calculated?",
    );
  });

  it("always shows two decimals", () => {
    render(view({ rating: 4, level: "trusted" }));
    expect(container.textContent).toBe("4,00");
  });

  it("shows only the new-seller label for a new seller", () => {
    render(view({ rating: null, level: "new" }));
    expect(container.textContent).toBe("Yeni satıcı");
    expect(label()).toBe(
      "Güven skoru: Yeni satıcı. Güven skoru nasıl hesaplanır?",
    );
  });

  it("shows the new-seller label when the rating is null at any level", () => {
    render(view({ rating: null }));
    expect(container.textContent).toBe("Yeni satıcı");
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
      "En az 5 tamamlanmış işlemi ve 3 farklı alıcısı olmayan",
    );
  });
});
