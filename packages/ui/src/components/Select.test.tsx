// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Select, type SelectOption } from "./Select";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const A: SelectOption = { value: "a", label: "A" };
const ALL: SelectOption = { value: "", label: "All" };

describe("Select", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onChange: ReturnType<typeof vi.fn>;

  // Inside a <form>, Radix renders a hidden native "bubble" <select>.
  const render = (value: string, options: SelectOption[]) =>
    act(() => {
      root.render(
        <form>
          <Select value={value} options={options} onChange={onChange} />
        </form>,
      );
    });

  const emitted = () =>
    onChange.mock.calls.map(
      ([event]) => (event as { target: { value: string } }).target.value,
    );

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onChange = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("does not emit an empty value when the value arrives before its option registers", () => {
    // Async form data: the value and its option arrive in the same render.
    // Radix sets the hidden native <select> to the new value before the
    // native <option> exists, reads back "" and calls onValueChange("").
    render("", []);
    render("a", [A]);

    expect(emitted()).not.toContain("");
  });

  it("does not emit an empty value for a select that also has an empty option", () => {
    render("", [ALL]);
    render("a", [ALL, A]);

    expect(emitted()).not.toContain("");
  });

  it("still emits the empty option's real value", () => {
    render("a", [ALL, A]);
    const native = container.querySelector("select");
    if (!native) throw new Error("no native select");

    // What Radix receives when the empty option is chosen: its sentinel.
    act(() => {
      native.value = "__empty__";
      native.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(emitted()).toEqual([""]);
  });
});
