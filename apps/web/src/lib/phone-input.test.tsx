// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FormProvider, useForm } from "react-hook-form";
import { FormPhone } from "@tarodan/ui/form";

/**
 * The shared phone control, driven the way the profile form drives it.
 *
 * `phone.test.ts` covers the formatter; these cover the part a formatter test
 * cannot see — what the field does to a value the user is EDITING. The
 * formatter answers "" for anything that is not a Turkish mobile, and writing
 * that answer back used to erase a saved number the moment a keystroke landed
 * in front of it.
 */

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

function Harness({ initial }: { initial: string }) {
  const form = useForm({ defaultValues: { phone: initial } });
  return (
    <FormProvider {...form}>
      <FormPhone name="phone" label="Telefon" />
    </FormProvider>
  );
}

function field(): HTMLInputElement {
  return container.querySelector("input") as HTMLInputElement;
}

/** Types `next` into the input the way a browser does (native setter + input). */
function setValue(el: HTMLInputElement, next: string, caret = next.length) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(el, next);
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function typeAll(el: HTMLInputElement, chars: string): string[] {
  const seen: string[] = [];
  for (const c of chars) {
    act(() => setValue(el, el.value + c));
    seen.push(el.value);
  }
  return seen;
}

describe("PhoneInput typing", () => {
  it("accepts digits one keystroke at a time", () => {
    act(() => root.render(<Harness initial="" />));
    const seen = typeAll(field(), "5321234567");
    expect(seen[0]).toBe("5");
    expect(seen.at(-1)).toBe("532 123 45 67");
  });

  it("normalizes a pasted 0-prefixed number", () => {
    act(() => root.render(<Harness initial="" />));
    act(() => setValue(field(), "0532 123 45 67"));
    expect(field().value).toBe("532 123 45 67");
  });

  it("renders a stored value in the mask", () => {
    act(() => root.render(<Harness initial="+905321234567" />));
    expect(field().value).toBe("532 123 45 67");
  });
});

describe("PhoneInput editing a saved number", () => {
  /**
   * A complete number fills the mask exactly (13 characters), so a `maxLength`
   * equal to it made the browser swallow every keystroke on a saved number —
   * including one meant to fix a digit in the middle. The field read as broken
   * until you deleted something. jsdom does not enforce `maxLength` when a test
   * assigns `value`, so the behaviour itself is unreachable from here; what is
   * checkable, and what would regress, is the attribute being back.
   */
  it("does not cap the input's length in the browser", () => {
    act(() => root.render(<Harness initial="+905321234567" />));
    expect(field().hasAttribute("maxlength")).toBe(false);
  });

  it("rejects a leading digit that cannot start a mobile, keeping the number", () => {
    act(() => root.render(<Harness initial="+905321234567" />));
    act(() => setValue(field(), "9532 123 45 67", 1));
    expect(field().value).toBe("532 123 45 67");
  });

  it("still allows clearing the field outright", () => {
    act(() => root.render(<Harness initial="+905321234567" />));
    act(() => setValue(field(), "", 0));
    expect(field().value).toBe("");
  });

  it("applies an edit that keeps the number valid, pushing out the last digit", () => {
    act(() => root.render(<Harness initial="+905321234567" />));
    act(() => setValue(field(), "532 1923 45 67", 6));
    expect(field().value).toBe("532 192 34 56");
  });

  it("leaves no stray character when an eleventh digit is absorbed", () => {
    act(() => root.render(<Harness initial="+905321234567" />));
    act(() => setValue(field(), "532 123 45 678", 14));
    expect(field().value).toBe("532 123 45 67");
  });
});
