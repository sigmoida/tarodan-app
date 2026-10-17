// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="img">{alt}</span>,
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

  it("bağlantı üretici adını VE kimliğini taşır", () => {
    act(() =>
      root.render(
        <BrandsMarquee
          items={[{ id: "m-1", name: "Mini GT", logoUrl: "", desc: "" }]}
        />,
      ),
    );

    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    // Sonsuz kayan şerit listeyi iki kez basar.
    expect(hrefs).toEqual([
      "/listings?manufacturer=Mini%20GT&manufacturerId=m-1",
      "/listings?manufacturer=Mini%20GT&manufacturerId=m-1",
    ]);
  });

  it("liste boşsa hiçbir şey çizmez", () => {
    act(() => root.render(<BrandsMarquee items={[]} />));
    expect(container.innerHTML).toBe("");
  });
});
