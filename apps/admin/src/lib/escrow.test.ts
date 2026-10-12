import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { cancellationTypeLabel } from "./escrow";

type T = ReturnType<typeof useTranslations<never>>;
// Real i18n isn't under test here — return the key so assertions can still
// distinguish branches without wiring next-intl.
const t = ((key: string) => key) as T;

describe("cancellationTypeLabel", () => {
  it("returns null for a falsy type", () => {
    expect(cancellationTypeLabel(null, t)).toBeNull();
    expect(cancellationTypeLabel(undefined, t)).toBeNull();
    expect(cancellationTypeLabel("", t)).toBeNull();
  });

  it("returns distinct copy for iptal vs iade", () => {
    const iptal = cancellationTypeLabel("iptal", t);
    const iade = cancellationTypeLabel("iade", t);
    expect(iptal).not.toBeNull();
    expect(iade).not.toBeNull();
    expect(iptal?.label).not.toBe(iade?.label);
  });

  it("passes an unrecognized type through as the label with empty detail", () => {
    expect(cancellationTypeLabel("something_else", t)).toEqual({
      label: "something_else",
      detail: "",
    });
  });
});
