import { describe, expect, it } from "vitest";
import { withSelectedReference } from "./selected-option";

describe("withSelectedReference", () => {
  it("shows the saved value before the catalog options arrive", () => {
    expect(
      withSelectedReference([], {
        id: "brand-1",
        name: "McLaren",
        slug: "mclaren",
      }),
    ).toEqual([{ id: "brand-1", name: "McLaren", slug: "mclaren" }]);
  });

  it("does not duplicate a saved value already present in the catalog", () => {
    const options = [{ id: "brand-1", name: "McLaren", slug: "mclaren" }];
    expect(
      withSelectedReference(options, {
        id: "brand-1",
        name: "Old label",
        slug: "old-slug",
      }),
    ).toBe(options);
  });

  it("does not invent an option without an id and label", () => {
    expect(withSelectedReference([], { id: "brand-1" })).toEqual([]);
  });
});
