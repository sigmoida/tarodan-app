// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => nav.pathname }));

import HideInEmbed from "./HideInEmbed";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (pathname: string) => {
  nav.pathname = pathname;
  act(() =>
    root.render(
      <HideInEmbed>
        <div data-testid="cookie-banner" />
      </HideInEmbed>,
    ),
  );
};

describe("HideInEmbed — çerez bandı / Ads etiketi", () => {
  it.each(["/app/terms", "/app/privacy", "/app/refund-policy"])(
    "%s altında çocukları çizmez",
    (pathname) => {
      render(pathname);
      expect(container.querySelector("[data-testid=cookie-banner]")).toBeNull();
    },
  );

  it.each(["/", "/terms", "/listings/abc", "/apple"])(
    "%s gibi normal sayfalarda çizer",
    (pathname) => {
      render(pathname);
      expect(
        container.querySelector("[data-testid=cookie-banner]"),
      ).not.toBeNull();
    },
  );
});
