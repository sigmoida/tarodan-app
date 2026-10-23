// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@tarodan/i18n";
import { Form, useZodForm } from "@tarodan/ui/form";
import { listingFieldMessages } from "../schema";
import { createEmptySaleData } from "../sale-data";
import DiscountCard, { type SaleData } from "./DiscountCard";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const messages = getMessages("tr");
const REFUSED = listingFieldMessages("tr").amountFormatRefused;
const LIMIT = "limit error";
const schema = z.object({ price: z.string() });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function Harness({
  price,
  saleData,
  salePriceError,
}: {
  price: string;
  saleData: SaleData;
  salePriceError: string | null;
}) {
  const form = useZodForm(schema, { defaultValues: { price } });
  return (
    <Form form={form} onSubmit={() => undefined}>
      <DiscountCard
        saleData={saleData}
        setSaleData={vi.fn()}
        showDiscountSection
        setShowDiscountSection={vi.fn()}
        salePriceError={salePriceError}
      />
    </Form>
  );
}

async function render(
  sale: Partial<SaleData>,
  { price = "1250,50", salePriceError = null as string | null } = {},
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(
      <NextIntlClientProvider locale="tr" messages={messages}>
        <Harness
          price={price}
          saleData={{ ...createEmptySaleData(), ...sale }}
          salePriceError={salePriceError}
        />
      </NextIntlClientProvider>,
    );
  });
  return container!;
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

/** The two amount inputs, in screen order: original price, sale price. */
const amountInputs = (root: HTMLElement) =>
  Array.from(
    root.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]'),
  );

describe("DiscountCard amount fields", () => {
  it("are decimal text fields, not number fields", async () => {
    const view = await render({});
    const inputs = amountInputs(view);
    expect(inputs).toHaveLength(2);
    for (const input of inputs) expect(input.type).toBe("text");
  });

  it("refuses a grouped sale price at once, before blur", async () => {
    const view = await render({ salePrice: "1.000" });
    expect(count(view.textContent!, REFUSED)).toBe(1);
    // No discount summary for text that is not an amount.
    expect(view.textContent).not.toMatch(/%\d+ indirim/);
  });

  it("refuses a grouped original price on its own field", async () => {
    const view = await render({ originalPrice: "1.250,50" });
    expect(count(view.textContent!, REFUSED)).toBe(1);
  });

  it("shows the refusal, not the limit error, for refused sale text", async () => {
    const view = await render(
      { salePrice: "1.000" },
      { salePriceError: LIMIT },
    );
    expect(view.textContent).toContain(REFUSED);
    expect(view.textContent).not.toContain(LIMIT);
  });

  it("holds the limit error back until the sale field is left", async () => {
    const view = await render({ salePrice: "200" }, { salePriceError: LIMIT });
    expect(view.textContent).not.toContain(LIMIT);
    await act(async () => {
      amountInputs(view)[1].dispatchEvent(
        new FocusEvent("focusout", { bubbles: true }),
      );
    });
    expect(view.textContent).toContain(LIMIT);
  });

  it("reads comma amounts for the discount summary", async () => {
    // 1 - 999,90 / 1250,50 = 20 %; read with Number() the comma text is NaN.
    const view = await render({
      originalPrice: "1250,50",
      salePrice: "999,90",
    });
    expect(view.textContent).toMatch(/%20 indirim/);
    expect(view.textContent).not.toContain(REFUSED);
  });
});
