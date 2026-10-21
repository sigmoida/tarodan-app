// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buttonVariants } from "./Button";
import { IconButton, type IconButtonProps } from "./IconButton";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("IconButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (props: Partial<IconButtonProps>) =>
    act(() => {
      root.render(
        <IconButton aria-label="Feature" {...props}>
          <svg />
        </IconButton>,
      );
    });

  const button = () => container.querySelector("button") as HTMLButtonElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("warning has the colours of the warning Button", () => {
    render({ variant: "warning" });

    const classes = button().className.split(" ");
    const buttonClasses = buttonVariants({ variant: "warning" }).split(" ");
    for (const cls of [
      "bg-warning-500",
      "text-inverted",
      "hover:bg-warning-600",
      "focus-visible:ring-warning-500",
    ]) {
      expect(classes).toContain(cls);
      // One look for the text and the icon-only form of the same action.
      expect(buttonClasses).toContain(cls);
    }
  });

  it("keeps the ghost default and the accessible name", () => {
    render({});

    expect(button().className).toContain("text-muted");
    expect(button().className).not.toContain("bg-warning-500");
    expect(button().getAttribute("aria-label")).toBe("Feature");
    expect(button().type).toBe("button");
  });
});
