// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useZodForm } from "../../lib/use-zod-form";
import { Form, FormInput } from "./Form";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const schema = z.object({
  name: z.string().min(1, "name required"),
  rows: z.array(z.object({ price: z.string().min(1, "price required") })),
});

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const form = useZodForm(schema, {
    defaultValues: { name: "", rows: [{ price: "" }] },
  });
  return (
    <Form form={form} onSubmit={onSubmit}>
      <FormInput name="name" />
      <FormInput name="rows.0.price" />
    </Form>
  );
}

describe("FormInput", () => {
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

  it("shows the error of a top-level and of an array field", async () => {
    const onSubmit = vi.fn();
    act(() => root.render(<Harness onSubmit={onSubmit} />));
    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.textContent).toContain("name required");
    // "rows.0.price" is a path into the nested errors object, not a key.
    expect(container.textContent).toContain("price required");
  });
});
