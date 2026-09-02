import { describe, expect, it } from "vitest";
import { actionsFor, eligibleIds } from "./bulkEligibility";

const row = (
  id: string,
  accountStatus: "active" | "pending_activation" | "banned" | "deleted",
  lastLoginAt: string | null = null,
) => ({ id, accountStatus, lastLoginAt });

describe("bulkEligibility", () => {
  it("silinmiş hesap hiçbir aksiyona uygun değil", () => {
    expect(actionsFor(row("d", "deleted"))).toEqual([]);
  });

  it("aktivasyon aksiyonları yalnız bekleyen hesapta", () => {
    expect(actionsFor(row("p", "pending_activation"))).toEqual([
      "resend",
      "verify",
      "ban",
      "delete",
    ]);
    expect(actionsFor(row("a", "active", "2026-01-01"))).toEqual(["ban"]);
  });

  it("engelli hesapta engel kaldırma; giriş yapmamışsa silme de", () => {
    expect(actionsFor(row("b", "banned", "2026-01-01"))).toEqual(["unban"]);
    expect(actionsFor(row("b", "banned"))).toEqual(["unban", "delete"]);
  });

  it("silme yalnız hiç giriş yapmamış hesapta", () => {
    const rows = [
      row("never", "active"),
      row("logged", "active", "2026-05-01"),
      row("pending", "pending_activation"),
      row("gone", "deleted"),
    ];
    expect(eligibleIds("delete", rows)).toEqual(["never", "pending"]);
  });

  it("karışık seçimde her aksiyon kendi uygun satırlarını alır", () => {
    const rows = [
      row("a", "active", "2026-05-01"),
      row("p", "pending_activation"),
      row("b", "banned"),
    ];
    expect(eligibleIds("ban", rows)).toEqual(["a", "p"]);
    expect(eligibleIds("unban", rows)).toEqual(["b"]);
    expect(eligibleIds("resend", rows)).toEqual(["p"]);
  });
});
