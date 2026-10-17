// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TableBadge, TABLE_BADGE_SIZE } from "./TableBadge";
import { STATUS_TONE } from "@/lib/status-tone";

vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class NoopResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

let container: HTMLDivElement;
let root: Root;
let clipped = false;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  // TruncatedText "kırpıldı" der: scrollWidth > clientWidth.
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
    () => (clipped ? 200 : 50),
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => 100,
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  clipped = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const render = (node: ReactElement) => {
  act(() => root.render(node));
  return container.innerHTML;
};

describe("TableBadge", () => {
  it("always renders the sm badge size", () => {
    expect(TABLE_BADGE_SIZE).toBe("sm");
    const out = render(<TableBadge variant="success">Yayında</TableBadge>);
    expect(out).toContain("text-xs");
    expect(out).toContain("px-2");
    expect(out).not.toContain("text-sm");
    expect(out).toContain("Yayında");
  });

  it("colours by the given state variant", () => {
    expect(render(<TableBadge variant="danger">x</TableBadge>)).toContain(
      "bg-danger-100",
    );
    expect(render(<TableBadge variant="outline">x</TableBadge>)).toContain(
      "border-border",
    );
  });

  it("config mode uses Badge's lookup for label + variant", () => {
    const config = {
      live: { label: "Yayında", variant: STATUS_TONE.live },
    } as const;
    const out = render(<TableBadge status="live" config={config} />);
    expect(out).toContain("Yayında");
    expect(out).toContain("bg-success-100");
    // Unknown status → Badge's fallback (outline + the raw status).
    const unknown = render(<TableBadge status="zzz" config={config} />);
    expect(unknown).toContain("zzz");
    expect(unknown).toContain("border-border");
  });

  it("a deliberate tooltip is always on the badge", () => {
    render(
      <TableBadge variant="warning" tooltip="Tam cümle">
        Kısa
      </TableBadge>,
    );
    expect(container.firstElementChild?.getAttribute("title")).toBe(
      "Tam cümle",
    );
  });

  it("label tooltip only when the label is actually clipped", () => {
    render(<TableBadge variant="warning">Uzun bir etiket</TableBadge>);
    expect(container.querySelector(".truncate")?.getAttribute("title")).toBe(
      null,
    );
    clipped = true;
    render(<TableBadge variant="success">Uzun bir etiket!</TableBadge>);
    const label = container.querySelector(".truncate");
    expect(label?.getAttribute("title")).toBe("Uzun bir etiket!");
    // Clipped text is keyboard-reachable (TruncatedText's focus popover).
    expect(label?.getAttribute("tabindex")).toBe("0");
  });
});

describe("STATUS_TONE", () => {
  it("is the one status → colour rule", () => {
    expect(STATUS_TONE).toEqual({
      live: "success",
      pending: "default",
      ended: "warning",
      failed: "danger",
      inactive: "outline",
    });
  });
});
