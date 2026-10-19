// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Form, useZodForm } from "@tarodan/ui/form";
import {
  TIMING_RULES,
  TIMING_RULE_IDS,
  type AdminTimingRuleState,
} from "@tarodan/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import {
  actionField,
  isActionLocked,
  rulesInTab,
  timingRulesSchema,
  toFormValues,
  type TimingRulesFormValues,
} from "../_lib/timing-rules";
import { TimingRuleRow } from "./TimingRuleRow";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const t = ((key: string) => key) as unknown as Parameters<
  typeof timingRulesSchema
>[0];

const STATES: AdminTimingRuleState[] = TIMING_RULE_IDS.map((id) => ({
  id,
  value: TIMING_RULES[id].default,
  source: "default",
  outOfBounds: false,
  action: TIMING_RULES[id].defaultAction,
  updatedAt: null,
}));

const LOCKED = "listingExpiryWarningDays";
const ROWS = rulesInTab("listing");

let readValues: () => TimingRulesFormValues = () => ({});
let loadStates: (states: AdminTimingRuleState[]) => void = () => {};

/**
 * Mirrors `useTimingRulesPage` + `page.tsx`: the form exists before the query
 * resolves and receives its `values` asynchronously; the rows mount only once
 * the data is there.
 */
function Harness() {
  const [data, setData] = useState<AdminTimingRuleState[] | undefined>();
  loadStates = setData;
  const states = data ?? [];
  const form = useZodForm(timingRulesSchema(t, states), {
    values: data ? toFormValues(data) : undefined,
  });
  readValues = () => form.getValues();
  if (!data) return null;
  return (
    <Form form={form} onSubmit={() => {}}>
      {ROWS.map((id) => (
        <TimingRuleRow
          key={id}
          id={id}
          state={states.find((state) => state.id === id)}
          canEdit
        />
      ))}
    </Form>
  );
}

describe("TimingRuleRow with async form values", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
    await act(async () => loadStates(STATES));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const lockedSelect = () => {
    // One hidden native <select> per row, in row order.
    const native = container.querySelectorAll("select")[ROWS.indexOf(LOCKED)];
    if (!native) throw new Error("no native select for the locked row");
    return native;
  };

  it("shows and keeps the locked single action", () => {
    expect(isActionLocked(LOCKED)).toBe(true);
    expect(readValues()[actionField(LOCKED)]).toBe("notify_seller");
    expect(lockedSelect().value).toBe("notify_seller");
    expect(timingRulesSchema(t, STATES).safeParse(readValues()).success).toBe(
      true,
    );
  });

  it("ignores the hidden select's spurious empty change", () => {
    // What Radix's bubble <select> does when the value outruns its option.
    act(() => {
      const native = lockedSelect();
      native.value = "";
      native.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(readValues()[actionField(LOCKED)]).toBe("notify_seller");
    expect(timingRulesSchema(t, STATES).safeParse(readValues()).success).toBe(
      true,
    );
  });
});
