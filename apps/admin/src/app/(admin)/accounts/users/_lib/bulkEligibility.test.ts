import { describe, expect, it } from "vitest";
import { actionsForStatus, eligibleIds, isEligible } from "./bulkEligibility";

describe("bulkEligibility", () => {
  it("silinmiş hesap hiçbir aksiyona uygun değil", () => {
    expect(actionsForStatus("deleted")).toEqual([]);
  });

  it("aktivasyon aksiyonları yalnız bekleyen hesapta", () => {
    expect(actionsForStatus("pending_activation")).toEqual([
      "resend",
      "verify",
      "ban",
    ]);
    expect(isEligible("resend", "active")).toBe(false);
    expect(isEligible("verify", "banned")).toBe(false);
  });

  it("engelli hesapta yalnız engel kaldırma", () => {
    expect(actionsForStatus("banned")).toEqual(["unban"]);
    expect(actionsForStatus("active")).toEqual(["ban"]);
  });

  it("karışık seçimde her aksiyon kendi uygun satırlarını alır", () => {
    const rows = [
      { id: "a", accountStatus: "active" as const },
      { id: "p", accountStatus: "pending_activation" as const },
      { id: "b", accountStatus: "banned" as const },
      { id: "d", accountStatus: "deleted" as const },
    ];
    expect(eligibleIds("ban", rows)).toEqual(["a", "p"]);
    expect(eligibleIds("unban", rows)).toEqual(["b"]);
    expect(eligibleIds("resend", rows)).toEqual(["p"]);
    expect(eligibleIds("verify", rows)).toEqual(["p"]);
  });
});
