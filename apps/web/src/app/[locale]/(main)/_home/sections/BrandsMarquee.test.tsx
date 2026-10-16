// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: React.ReactNode } & Record<
    string,
    unknown
  >) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import BrandsMarquee from "./BrandsMarquee";

describe("BrandsMarquee", () => {
  let root: Root;
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("üreticiye ad + manufacturerId ile bağlanır (nav menüsüyle aynı adres)", () => {
    act(() =>
      root.render(
        <BrandsMarquee
          items={[{ id: "m-1", name: "Hot Wheels", logoUrl: "", desc: "" }]}
        />,
      ),
    );

    const hrefs = Array.from(host.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    // Şerit kesintisiz kayması için liste iki kez çizilir.
    expect(hrefs).toEqual([
      "/listings?manufacturer=Hot%20Wheels&manufacturerId=m-1",
      "/listings?manufacturer=Hot%20Wheels&manufacturerId=m-1",
    ]);
  });

  it("öğe yoksa hiçbir şey çizmez", () => {
    act(() => root.render(<BrandsMarquee items={[]} />));
    expect(host.innerHTML).toBe("");
  });
});
