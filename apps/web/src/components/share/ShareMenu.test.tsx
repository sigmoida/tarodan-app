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
  // Content'in `onCloseAutoFocus` prop'u: Radix menü kapanınca çağırır.
  closeAutoFocus: undefined as undefined | (() => void),
}));

vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
// Radix'in portal/odak mekaniği jsdom'da değil bu bileşenin işi. Mock,
// kontrollü `open` / `onOpenChange` sözleşmesini yansıtır: tetikleyiciye
// pointerdown Radix gibi `onOpenChange(!open)` çağırır, içerik yalnız açıkken
// çizilir.
vi.mock("@tarodan/ui", async () => {
  const React = await import("react");
  const el = React.createElement;
  const Ctx = React.createContext<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }>({ open: false, onOpenChange: () => undefined });
  return {
    Button: React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
      ({ leftIcon: _l, variant: _v, children, ...p }, ref) =>
        el("button", { ref, ...p }, children as React.ReactNode),
    ),
    IconButton: React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
      ({ variant: _v, children, ...p }, ref) =>
        el("button", { ref, ...p }, children as React.ReactNode),
    ),
    DropdownMenu: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children?: React.ReactNode;
    }) => el(Ctx.Provider, { value: { open, onOpenChange } }, children),
    DropdownMenuTrigger: ({ children }: { children: React.ReactElement }) => {
      const { open, onOpenChange } = React.useContext(Ctx);
      return React.cloneElement(children, {
        onPointerDown: () => onOpenChange(!open),
      } as Record<string, unknown>);
    },
    DropdownMenuContent: ({
      children,
      onCloseAutoFocus,
    }: {
      children?: React.ReactNode;
      onCloseAutoFocus?: () => void;
    }) => {
      const { open } = React.useContext(Ctx);
      h.closeAutoFocus = onCloseAutoFocus;
      return open ? el("div", { role: "menu" }, children) : null;
    },
    DropdownMenuItem: ({
      children,
      onSelect,
    }: {
      children?: React.ReactNode;
      onSelect?: () => void;
    }) => {
      const { onOpenChange } = React.useContext(Ctx);
      return el(
        "div",
        {
          role: "menuitem",
          onClick: () => {
            onSelect?.();
            onOpenChange(false);
          },
        },
        children,
      );
    },
    DropdownMenuSeparator: () => el("hr"),
  };
});

import ShareMenu from "./ShareMenu";

const PATH = "/listings/42";
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
      <ShareMenu path={PATH} title="Araba" text="Araba - 100 TL" {...props} />,
    );
  });
}

const menu = () => container.querySelector('[role="menu"]');
const items = () =>
  Array.from(container.querySelectorAll('[role="menuitem"]')).map((e) =>
    e.textContent?.trim(),
  );
const item = (i: number) =>
  container.querySelectorAll('[role="menuitem"]')[i] as HTMLElement;
const trigger = () => container.querySelector("button") as HTMLButtonElement;

/** Gerçek bir dokunuş/tıklama: pointerdown (Radix açar) sonra click. */
async function press() {
  await act(async () => {
    trigger().dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
  });
  await act(async () => trigger().click());
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  h.closeAutoFocus = undefined;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ShareMenu masaüstü (menü)", () => {
  beforeEach(() => stubDevice({ coarse: false, share: vi.fn() }));

  it("ikon tetikleyici i18n etiketli; menü kapalı başlar", async () => {
    await render();
    expect(trigger().getAttribute("aria-label")).toBe("common.share");
    expect(trigger().getAttribute("title")).toBe("common.share");
    expect(menu()).toBeNull();
  });

  it("tetikleyiciye basınca ağlar sırayla + linki kopyala açılır", async () => {
    await render();
    await press();
    expect(items()).toEqual([
      "WhatsApp",
      "X",
      "Facebook",
      "Telegram",
      "common.copyLink",
    ]);
    // trigger + 4 marka + link ikonu; hepsi dekoratif
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBe(
      6,
    );
  });

  it("targets ile ağlar daraltılır", async () => {
    await render({ targets: ["whatsapp", "telegram"] });
    await press();
    expect(items()).toEqual(["WhatsApp", "Telegram", "common.copyLink"]);
  });

  it("label: görünen metin erişilebilir ad, aria-label/title yok", async () => {
    await render({ label: "Listeyi paylaş" });
    expect(trigger().textContent).toBe("Listeyi paylaş");
    expect(trigger().hasAttribute("aria-label")).toBe(false);
    expect(trigger().hasAttribute("title")).toBe(false);
  });

  it("ağ öğesi, tıklama anındaki origin ile noopener yeni sekme açar", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    await render();
    await press();
    await act(async () => item(0).click());
    const url = `${window.location.origin}${PATH}`;
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/?text=${encodeURIComponent(`Araba - 100 TL ${url}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
    expect(menu()).toBeNull();
  });

  it("kopyala: menü kapandıktan sonra (onCloseAutoFocus) panoya yazar", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await render();
    await press();
    const closeAutoFocus = h.closeAutoFocus!;
    await act(async () => item(4).click());
    expect(writeText).not.toHaveBeenCalled(); // menü kapanana dek bekler
    await act(async () => closeAutoFocus());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${PATH}`);
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
    await press();
    const closeAutoFocus = h.closeAutoFocus!;
    await act(async () => item(4).click());
    await act(async () => closeAutoFocus());
    expect(h.toast.error).toHaveBeenCalledWith("common.copyFailed");
    expect(h.toast.success).not.toHaveBeenCalled();
  });
});

describe("ShareMenu dokunmatik (navigator.share)", () => {
  it("dokunuş menüyü açmaz, doğrudan sistem paylaşımını çağırır", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubDevice({ coarse: true, share });
    await render();
    await press();
    expect(share).toHaveBeenCalledWith({
      title: "Araba",
      text: "Araba - 100 TL",
      url: `${window.location.origin}${PATH}`,
    });
    expect(menu()).toBeNull();
  });

  it("AbortError ve InvalidStateError sessiz: menü açılmaz", async () => {
    for (const name of ["AbortError", "InvalidStateError"]) {
      const share = vi.fn().mockRejectedValue(new DOMException("x", name));
      stubDevice({ coarse: true, share });
      await render();
      await press();
      expect(share).toHaveBeenCalledTimes(1);
      expect(menu()).toBeNull();
    }
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("NotAllowedError'da menü AÇILIR (open state)", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("x", "NotAllowedError"));
    stubDevice({ coarse: true, share });
    await render();
    await press();
    expect(menu()).not.toBeNull();
    expect(items()).toContain("common.copyLink");
  });

  it("uçuştaki paylaşım varken ikinci tıklama yok sayılır", async () => {
    let resolve!: () => void;
    const share = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    stubDevice({ coarse: true, share });
    await render();
    await act(async () => trigger().click());
    await act(async () => trigger().click());
    expect(share).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    await act(async () => trigger().click());
    expect(share).toHaveBeenCalledTimes(2);
  });

  it("dokunmatik ama navigator.share yoksa menü açılır", async () => {
    stubDevice({ coarse: true, share: undefined });
    await render();
    await press();
    expect(items()).toContain("common.copyLink");
  });
});
