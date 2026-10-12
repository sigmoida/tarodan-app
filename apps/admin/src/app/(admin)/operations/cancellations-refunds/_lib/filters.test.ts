import { describe, expect, it } from "vitest";
import { ADMIN_CANCELLATION_ADMIN_REASON_FILTERS } from "@tarodan/types";
import { adminReasonFilterField, cancellationFilterFields } from "./filters";

const t = ((key: string) => key) as unknown as Parameters<
  typeof cancellationFilterFields
>[0];

describe("admin-cancellation filter", () => {
  it("offers all / every admin cancellation / each catalog reason, matching the API's accepted values", () => {
    const field = adminReasonFilterField(t);
    if (field.type !== "select") throw new Error("expected a select field");
    const values = field.options.map((option) => option.value);
    // "all" is the no-filter default and is never sent to the API.
    expect(values[0]).toBe("all");
    expect(field.defaultValue).toBe("all");
    expect(values.slice(1)).toEqual([
      ...ADMIN_CANCELLATION_ADMIN_REASON_FILTERS,
    ]);
  });
});
