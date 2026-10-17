import { describe, expect, it } from "vitest";
import type { ConsentDocumentStatus } from "@tarodan/types";
import { consentStatusTone } from "./consentStatus";

const status = (
  over: Partial<ConsentDocumentStatus> = {},
): ConsentDocumentStatus => ({
  document: "terms",
  currentVersion: "2026-08-05",
  requiredForAccount: true,
  pending: false,
  latest: {
    version: "2026-08-05",
    action: "granted",
    source: "registration",
    createdAt: "2026-09-01T00:00:00.000Z",
  },
  ...over,
});

describe("consentStatusTone", () => {
  it("yeniden onay bekleyen zorunlu belge 'pending'dir (eski sürüm onaylı olsa da)", () => {
    expect(
      consentStatusTone(
        status({
          pending: true,
          latest: { ...status().latest!, version: "2020-01-01" },
        }),
      ),
    ).toBe("pending");
  });

  it("güncel onay 'granted'dir", () => {
    expect(consentStatusTone(status())).toBe("granted");
  });

  it("geri çekilmiş pazarlama izni 'withdrawn'dur", () => {
    expect(
      consentStatusTone(
        status({
          document: "marketing",
          requiredForAccount: false,
          latest: { ...status().latest!, action: "withdrawn" },
        }),
      ),
    ).toBe("withdrawn");
  });

  it("kaydı olmayan isteğe bağlı belge 'none'dır", () => {
    expect(
      consentStatusTone(
        status({
          document: "marketing",
          requiredForAccount: false,
          latest: null,
        }),
      ),
    ).toBe("none");
  });
});
