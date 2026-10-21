// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});

import {
  button,
  click,
  field,
  mount,
  type,
  type Mounted,
} from "@/test-utils/dom";
import { BoostExtendPanel, extendDays } from "./BoostExtendPanel";

const EXTEND = "admin.marketing.boostPurchases.extend";

describe("extendDays", () => {
  it("takes whole days from 1 to 365 only", () => {
    expect(extendDays("30")).toBe(30);
    expect(extendDays("365")).toBe(365);
    for (const text of ["", "0", "366", "2.5", "-1", "abc"]) {
      expect(extendDays(text)).toBeNull();
    }
  });
});

describe("BoostExtendPanel", () => {
  const onExtend = vi.fn();
  let view: Mounted;

  beforeEach(() => {
    onExtend.mockReset();
    view = mount(<BoostExtendPanel onExtend={onExtend} isPending={false} />);
  });
  afterEach(() => view.unmount());

  it("lets the field be cleared and retyped (30 stays 30, not 130)", async () => {
    const input = field<HTMLInputElement>('input[type="number"]');
    await type(input, "");
    expect(button(EXTEND).disabled).toBe(true);
    await type(input, "30");
    await click(button(EXTEND));
    expect(onExtend).toHaveBeenCalledWith(30);
  });

  it("does not extend with days out of range", async () => {
    await type(field<HTMLInputElement>('input[type="number"]'), "400");
    expect(button(EXTEND).disabled).toBe(true);
    expect(onExtend).not.toHaveBeenCalled();
  });
});
