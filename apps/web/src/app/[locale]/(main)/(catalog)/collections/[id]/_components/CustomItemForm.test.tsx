// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  options: undefined as undefined | { successMessage?: string },
  mutate: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "tr",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("@/hooks/useWebMutation", () => ({
  useWebMutation: (_fn: unknown, options: { successMessage?: string }) => {
    h.options = options;
    return { mutate: h.mutate, isPending: false };
  },
}));
vi.mock("@/lib/api", () => ({ collectionsApi: {}, mediaApi: {} }));
vi.mock("../_context/CollectionDetailContext", () => ({
  useCollectionDetail: () => ({
    collection: { id: "col-1" },
    invalidateCollection: vi.fn(),
  }),
}));
vi.mock("../_hooks/useCollectionFilters", () => ({
  useCollectionFilters: () => ({
    brands: [],
    scales: [],
    manufacturers: [],
    materials: [],
  }),
}));
vi.mock("../_hooks/useCarModels", () => ({
  useCarModels: () => ({ models: [], isLoading: false }),
}));

import CustomItemForm from "./CustomItemForm";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.options = undefined;
  h.mutate.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = () =>
  act(() =>
    root.render(
      <CustomItemForm
        formId="custom-item"
        onClose={vi.fn()}
        onPendingChange={vi.fn()}
      />,
    ),
  );

const setInput = (name: string, value: string) => {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  )!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const submit = async () => {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

describe("CustomItemForm", () => {
  it("toasts the one-item sentence, not the batch count suffix", () => {
    render();
    expect(h.options?.successMessage).toBe("product.addedToCollection");
  });

  it("shows a year error before submit and does not add the item", async () => {
    render();
    setInput("title", "My Camaro");
    setInput("year", "1850");
    await submit();
    expect(container.textContent).toContain('validation.minValue:{"min":1900}');
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("submits a valid item", async () => {
    render();
    setInput("title", "  My Camaro ");
    setInput("year", "1967");
    await submit();
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0][0]).toMatchObject({
      title: "My Camaro",
      year: "1967",
    });
  });
});
