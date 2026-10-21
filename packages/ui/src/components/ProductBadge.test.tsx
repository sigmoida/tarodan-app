// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProductBadge, type ProductBadgeProps } from "./ProductBadge";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("ProductBadge", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (props: ProductBadgeProps) =>
    act(() => {
      root.render(<ProductBadge {...props} />);
    });

  const badge = () => container.firstElementChild as HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("boosted is the solid warning badge with its icon and label", () => {
    render({
      variant: "boosted",
      icon: <svg data-icon />,
      children: "Featured",
    });

    // The amber solid fill the sponsored look had (only the name changed).
    const classes = badge().className.split(" ");
    expect(classes).toContain("bg-warning-500");
    expect(classes).toContain("text-inverted");
    expect(classes).not.toContain("bg-warning-100");
    expect(badge().querySelector("[data-icon]")).not.toBeNull();
    expect(badge().textContent).toBe("Featured");
  });
});
