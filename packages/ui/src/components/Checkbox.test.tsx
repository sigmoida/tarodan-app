// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Checkbox, type CheckboxProps } from "./Checkbox";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Checkbox", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (props: CheckboxProps) =>
    act(() => {
      root.render(<Checkbox {...props} />);
    });

  const label = () => container.querySelector("label") as HTMLLabelElement;
  const input = () =>
    container.querySelector('input[type="checkbox"]') as HTMLInputElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("centres the box on the label by default (unchanged for every caller)", () => {
    render({ id: "c", label: "Accept", onChange: vi.fn() });

    expect(label().className).toContain("items-center");
    expect(label().className).not.toContain("items-start");
    // The input stays a direct child of the label: no wrapper by default.
    expect(input().parentElement).toBe(label());
  });

  it('puts the box on the first line of a long label with align="start"', () => {
    render({
      id: "c",
      label: "A consent statement that wraps to several lines",
      align: "start",
      onChange: vi.fn(),
    });

    expect(label().className).toContain("items-start");
    expect(label().className).not.toContain("items-center");
    // The box sits in a slot one text-sm line high, centred inside it.
    const slot = input().parentElement as HTMLElement;
    expect(slot).not.toBe(label());
    expect(slot.className).toContain("h-5");
    expect(slot.className).toContain("items-center");
  });

  it("still toggles from the label and keeps the label tied to the input", () => {
    const onChange = vi.fn();
    render({ id: "consent", label: "Accept", align: "start", onChange });

    expect(label().htmlFor).toBe("consent");
    expect(input().id).toBe("consent");
    act(() => {
      (label().querySelector("span:last-child") as HTMLElement).click();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input().checked).toBe(true);
  });

  it("renders a bare input without a label, whatever the alignment", () => {
    render({ id: "c", align: "start", onChange: vi.fn() });

    expect(container.querySelector("label")).toBeNull();
    expect(input().parentElement).toBe(container);
  });
});
