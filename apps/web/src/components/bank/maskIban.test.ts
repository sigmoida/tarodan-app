/** @format */

import { describe, expect, it } from "vitest";
import { maskIban } from "@tarodan/ui";

describe("maskIban", () => {
  it("ilk 4 ve son 4 haneyi açık bırakır, 4'lü gruplar", () => {
    expect(maskIban("TR330006100519786457841326")).toBe(
      "TR33 **** **** **** **** **13 26",
    );
  });

  it("boşluklu ve küçük harfli girdiyi normalize eder", () => {
    expect(maskIban("tr33 0006 1005 1978 6457 8413 26")).toBe(
      "TR33 **** **** **** **** **13 26",
    );
  });

  it("8 haneye kadar olan girdiyi maskelemeden gruplar", () => {
    expect(maskIban("TR330006")).toBe("TR33 0006");
  });
});
