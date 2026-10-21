// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getMessages } from "@tarodan/i18n";
import { Form, useZodForm } from "@tarodan/ui/form";
import { baseListingFields, listingFieldMessages } from "../schema";
import { ListingFormApiProvider, type ListingFormApi } from "../api-context";
import { buildListingUpdatePayload } from "../../edit/build-update-payload";
import { emptyEditValues } from "../../edit/schema";
import { createEmptySaleData } from "../sale-data";
import PricingCard from "./PricingCard";

vi.mock("next/image", () => ({
  default: () => null,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const messages = getMessages("tr");
const msg = listingFieldMessages("tr");
const base = baseListingFields(msg);
// The pricing fields of the shared schema, as the card binds them.
const schema = z.object({
  price: base.price,
  quantity: base.quantity,
  shippingPackageTier: base.shippingPackageTier,
});
type Values = z.infer<typeof schema>;

const API: ListingFormApi = {
  get: async () => ({ tiers: [] }) as never,
  uploadProductImage: async () => {
    throw new Error("not used");
  },
  rotateProductImage: async () => {
    throw new Error("not used");
  },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function Harness({
  onSubmit,
  price,
}: {
  onSubmit: (v: Values) => void;
  price: string;
}) {
  const form = useZodForm(schema, {
    defaultValues: { price, quantity: "1", shippingPackageTier: "small" },
  });
  return (
    <Form form={form} onSubmit={onSubmit}>
      <PricingCard
        locale="tr"
        commissionPreview={null}
        commissionPreviewLoading={false}
        commissionPreviewEnabled={false}
        quantityPlaceholder="1"
        quantityHelper=""
      />
    </Form>
  );
}

async function submitWith(price: string) {
  const onSubmit = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root = createRoot(container!);
    root.render(
      <NextIntlClientProvider locale="tr" messages={messages}>
        <QueryClientProvider client={client}>
          <ListingFormApiProvider api={API}>
            <Harness onSubmit={onSubmit} price={price} />
          </ListingFormApiProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
  });
  await act(async () => {
    container!.querySelector("form")!.requestSubmit();
  });
  // RHF validates asynchronously; let the resolver settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { onSubmit, container: container! };
}

describe("PricingCard price field", () => {
  it("is a decimal text field, not a number field", async () => {
    const { container } = await submitWith("1000");
    const input = container.querySelector<HTMLInputElement>(
      'input[name="price"]',
    )!;
    // A number field hands "1.000" over as 1 before the schema sees it.
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("decimal");
  });

  it('refuses "1.000" with the shared copy and does not submit', async () => {
    const { onSubmit, container } = await submitWith("1.000");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.textContent).toContain(msg.amountFormatRefused);
  });

  it.each([
    ["1000", 1000],
    ["1250,50", 1250.5],
    ["1250.50", 1250.5],
  ])("submits %j and saves it as %j", async (price, amount) => {
    const { onSubmit } = await submitWith(price);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0][0] as Values;
    const payload = buildListingUpdatePayload(
      { ...emptyEditValues, ...values },
      createEmptySaleData(),
    );
    expect(payload.price).toBe(amount);
  });

  it("keeps the minimum price rule for zero", async () => {
    const { onSubmit, container } = await submitWith("0");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.textContent).toContain(msg.validPrice);
  });
});
