// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BankAccountSummary } from "./BankAccountSummary";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next-intl", () => ({
  useFormatter: () => ({
    dateTime: (d: Date, o: unknown) =>
      `fmt:${d.toISOString()}:${JSON.stringify(o)}`,
  }),
  useTranslations: () => (key: string, values?: { date?: string }) =>
    values?.date ? `${key}|${values.date}` : key,
}));

const IBAN = "TR330006100519786457841326";

let host: HTMLDivElement;
let root: Root;

const renderSummary = (updatedAt?: string | null) =>
  act(() => {
    root.render(
      <BankAccountSummary
        accountHolder="Ali Veli"
        iban={IBAN}
        updatedAt={updatedAt}
      />,
    );
  });

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("BankAccountSummary", () => {
  it("maskeli IBAN, hesap sahibi ve Kayıtlı rozetini gösterir", () => {
    renderSummary();
    const text = host.textContent ?? "";
    expect(text).toContain("TR33 **** 1326");
    expect(text).not.toContain(IBAN);
    expect(text).toContain("Ali Veli");
    expect(text).toContain("bankAccount.savedBadge");
  });

  it("updatedAt varsa son güncelleme satırını gösterir", () => {
    renderSummary("2026-10-14T10:00:00.000Z");
    expect(host.textContent).toContain(
      "bankAccount.lastUpdated|fmt:2026-10-14T10:00:00.000Z",
    );
  });

  it("updatedAt yoksa son güncelleme satırı çıkmaz", () => {
    renderSummary(null);
    expect(host.textContent).not.toContain("bankAccount.lastUpdated");
  });
});
