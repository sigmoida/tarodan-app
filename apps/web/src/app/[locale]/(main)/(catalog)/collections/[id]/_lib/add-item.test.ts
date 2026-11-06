/** @format */

import { describe, expect, it } from "vitest";
import type { Translate } from "@/types/i18n";
import { customItemSchema, EMPTY_CUSTOM_ITEM } from "./add-item";

// Echo the key and its values, so the test sees which message was chosen.
const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key) as unknown as Translate;
const schema = customItemSchema(t);

const errorsOf = (over: Partial<typeof EMPTY_CUSTOM_ITEM>) => {
  const result = schema.safeParse({
    ...EMPTY_CUSTOM_ITEM,
    title: "Camaro",
    ...over,
  });
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), i.message]),
      );
};

describe("customItemSchema", () => {
  it("accepts a title alone and an empty year", () => {
    expect(errorsOf({})).toEqual({});
  });

  it("requires a title that is not only spaces", () => {
    expect(errorsOf({ title: "   " })).toEqual({
      title: "validation.required",
    });
  });

  it("limits the title to 200 and the description to 1000 characters", () => {
    expect(errorsOf({ title: "a".repeat(200) })).toEqual({});
    expect(errorsOf({ title: "a".repeat(201) })).toEqual({
      title: 'validation.maxLength:{"max":200}',
    });
    expect(errorsOf({ description: "a".repeat(1000) })).toEqual({});
    expect(errorsOf({ description: "a".repeat(1001) })).toEqual({
      description: 'validation.maxLength:{"max":1000}',
    });
  });

  it("takes a whole year in 1900..2100", () => {
    expect(errorsOf({ year: "1900" })).toEqual({});
    expect(errorsOf({ year: "2100" })).toEqual({});
    expect(errorsOf({ year: "1899" })).toEqual({
      year: 'validation.minValue:{"min":1900}',
    });
    expect(errorsOf({ year: "2101" })).toEqual({
      year: 'validation.maxValue:{"max":2100}',
    });
    expect(errorsOf({ year: "2020.5" })).toEqual({
      year: "validation.enterValidValue",
    });
    expect(errorsOf({ year: "abc" })).toEqual({
      year: "validation.enterValidValue",
    });
  });
});
