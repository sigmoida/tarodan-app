import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JsonBlock } from "./JsonBlock";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const REDACTED = "admin.system.logs.details.redacted";
const BIN = "45467112";

const shown = (value: unknown) =>
  renderToStaticMarkup(<JsonBlock value={value} />);

describe("JsonBlock", () => {
  it("masks a top-level and a nested installment BIN, keeps the rest", () => {
    const top = shown({ bin: BIN, paymentId: "pay-1" });
    const nested = shown({
      paymentId: "pay-1",
      installment: { count: 3, bin: BIN },
    });

    for (const html of [top, nested]) {
      expect(html).not.toContain(BIN);
      expect(html).toContain(REDACTED);
      expect(html).toContain("pay-1");
    }
    expect(nested).toContain("&quot;count&quot;: 3");
  });

  it("masks every BIN key spelling, whatever the case", () => {
    for (const key of [
      "BIN",
      "bin6",
      "bin8",
      "binNumber",
      "bin_number",
      "cardBin",
      "installmentBin",
      "iin",
    ]) {
      const html = shown({ [key]: BIN });
      expect(html, key).not.toContain(BIN);
      expect(html, key).toContain(REDACTED);
    }
  });

  it("keeps keys that only contain the letters readable", () => {
    expect(shown({ binary: "ok", cabin: "ok" })).not.toContain(REDACTED);
  });
});
