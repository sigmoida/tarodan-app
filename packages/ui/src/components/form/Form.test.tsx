// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useZodForm } from "../../lib/use-zod-form";
import { Form, FormInput } from "./Form";
import { FormCheckbox } from "./FormCheckbox";
import { FormTextarea } from "./FormTextarea";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const schema = z.object({
  name: z.string().min(1, "name required"),
  rows: z.array(
    z.object({
      price: z.string().min(1, "price required"),
      note: z.string().min(1, "note required"),
      agreed: z.literal(true, {
        errorMap: () => ({ message: "agree required" }),
      }),
    }),
  ),
});

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const form = useZodForm(schema, {
    defaultValues: {
      name: "",
      rows: [{ price: "", note: "", agreed: false as unknown as true }],
    },
  });
  return (
    <Form form={form} onSubmit={onSubmit}>
      <FormInput name="name" />
      <FormInput name="rows.0.price" />
      <FormTextarea name="rows.0.note" label="Note" />
      <FormCheckbox name="rows.0.agreed" label="Agree" />
    </Form>
  );
}

describe("form fields by name", () => {
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
    expect(container.textContent).toContain("note required");
    expect(container.textContent).toContain("agree required");
  });
});
