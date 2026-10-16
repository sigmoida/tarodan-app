// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/seo", () => ({ SITE_URL: "https://tarodan.com.tr" }));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
// Radix menüsünün portal/odak mekaniği jsdom'da değil bu bileşenin işi;
// burada davranış (hangi öğeler, ne çağrılıyor) sınanır.
vi.mock("@tarodan/ui", async () => {
  const React = await import("react");
  const el = React.createElement;
  const passthrough =
    (tag: string, role?: string) =>
    ({ children }: { children?: React.ReactNode }) =>
      el(tag, { role }, children);
  return {
    Button: React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
      ({ leftIcon: _l, variant: _v, children, ...p }, ref) =>
        el("button", { ref, ...p }, children as React.ReactNode),
    ),
    IconButton: React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
      ({ variant: _v, children, ...p }, ref) =>
        el("button", { ref, ...p }, children as React.ReactNode),
    ),
    DropdownMenu: passthrough("div"),
    DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) =>
      el(React.Fragment, null, children),
    DropdownMenuContent: passthrough("div", "menu"),
    DropdownMenuItem: ({
      children,
      onSelect,
    }: {
      children?: React.ReactNode;
      onSelect?: () => void;
    }) => el("div", { role: "menuitem", onClick: onSelect }, children),
    DropdownMenuSeparator: () => el("hr"),
  };
});

import ShareMenu from "./ShareMenu";

const URL_ = "https://tarodan.com.tr/listings/42";
let container: HTMLDivElement;
let root: Root;

function stubDevice({ coarse, share }: { coarse: boolean; share?: unknown }) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: coarse && q === "(pointer: coarse)",
  }));
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
  });
}

async function render(props: Partial<Parameters<typeof ShareMenu>[0]> = {}) {
  await act(async () => {
    root.render(
      <ShareMenu url={URL_} title="Araba" text="Araba - 100 TL" {...props} />,
    );
  });
}

const items = () =>
  Array.from(container.querySelectorAll('[role="menuitem"]')).map((e) =>
    e.textContent?.trim(),
  );
const trigger = () => container.querySelector("button") as HTMLButtonElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.toast.success.mockReset();
  h.toast.error.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ShareMenu masaüstü (menü)", () => {
  beforeEach(() => stubDevice({ coarse: false, share: vi.fn() }));

  it("tetikleyici i18n etiketli; ağlar sırayla + linki kopyala", async () => {
    await render();
    expect(trigger().getAttribute("aria-label")).toBe("common.share");
    expect(trigger().getAttribute("title")).toBe("common.share");
    expect(items()).toEqual([
      "WhatsApp",
      "X",
      "Facebook",
      "Telegram",
      "common.copyLink",
    ]);
    // marka ikonları dekoratif
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBe(
      6,
    );
  });

  it("targets ile ağlar daraltılır", async () => {
    await render({ targets: ["whatsapp", "telegram"] });
    expect(items()).toEqual(["WhatsApp", "Telegram", "common.copyLink"]);
  });

  it("label verilirse metinli buton", async () => {
    await render({ label: "Listeyi paylaş" });
    expect(trigger().textContent).toBe("Listeyi paylaş");
  });

  it("ağ öğesi paylaşım linkini noopener ile yeni sekmede açar", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    await render();
    await act(async () => {
      (
        container.querySelectorAll('[role="menuitem"]')[0] as HTMLElement
      ).click();
    });
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/?text=${encodeURIComponent(`Araba - 100 TL ${URL_}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("kopyala: panoya yazar, tek 'common.copied' toast'ı", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await render();
    await act(async () => {
      (
        container.querySelectorAll('[role="menuitem"]')[4] as HTMLElement
      ).click();
    });
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(h.toast.success).toHaveBeenCalledWith("common.copied");
  });

  it("kopyalama başarısızsa 'common.copyFailed'", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
      configurable: true,
    });
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    await render();
    await act(async () => {
      (
        container.querySelectorAll('[role="menuitem"]')[4] as HTMLElement
      ).click();
    });
    expect(h.toast.error).toHaveBeenCalledWith("common.copyFailed");
    expect(h.toast.success).not.toHaveBeenCalled();
  });
});

describe("ShareMenu dokunmatik (navigator.share)", () => {
  it("tıklama doğrudan sistem paylaşımını açar, menü çizilmez", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubDevice({ coarse: true, share });
    await render();
    expect(items()).toEqual([]);
    await act(async () => trigger().click());
    expect(share).toHaveBeenCalledWith({
      title: "Araba",
      text: "Araba - 100 TL",
      url: URL_,
    });
    expect(items()).toEqual([]);
  });

  it("AbortError sessizdir: menü açılmaz, toast yok", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("x", "AbortError"));
    stubDevice({ coarse: true, share });
    await render();
    await act(async () => trigger().click());
    expect(items()).toEqual([]);
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("başka hatada menüye düşer", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("x", "NotAllowedError"));
    stubDevice({ coarse: true, share });
    await render();
    await act(async () => trigger().click());
    expect(items()).toContain("common.copyLink");
  });

  it("dokunmatik ama navigator.share yoksa menü", async () => {
    stubDevice({ coarse: true, share: undefined });
    await render();
    expect(items()).toContain("common.copyLink");
  });
});
