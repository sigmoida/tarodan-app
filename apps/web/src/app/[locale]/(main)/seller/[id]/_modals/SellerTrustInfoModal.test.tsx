// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import SellerTrustInfoModal from "./SellerTrustInfoModal";

let container: HTMLDivElement;
let root: Root;

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

describe("SellerTrustInfoModal", () => {
  it.each([
    [
      "tr",
      'En az 5 tamamlanmış işlemi ve 3 farklı alıcısı olmayan satıcılar "Yeni satıcı" olarak görünür.',
    ],
    [
      "en",
      'Sellers without at least 5 completed transactions with 3 different buyers are shown as "New seller".',
    ],
  ])("names both new-seller minimums (%s)", (locale, expected) => {
    h.locale = locale;
    act(() => {
      root.render(<SellerTrustInfoModal isOpen onClose={() => {}} />);
    });
    expect(document.body.textContent).toContain(expected);
  });
});
