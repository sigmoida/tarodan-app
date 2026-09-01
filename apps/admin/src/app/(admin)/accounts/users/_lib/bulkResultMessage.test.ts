import { describe, expect, it } from "vitest";
import {
  bulkConfirmDescriptionKey,
  bulkResultMessage,
} from "./bulkResultMessage";

describe("bulkResultMessage", () => {
  it("kuyruklanan gönderimde 'başarılı' demez, 'kuyruğa alındı' der", () => {
    expect(bulkResultMessage("resend", 50, 0)).toEqual({
      key: "admin.users.bulkResendQueued",
      values: { ok: 50, failed: 0 },
      tone: "success",
    });
  });

  it("kısmi kuyruklamada uyarı tonu ve ayrı metin", () => {
    expect(bulkResultMessage("resend", 8, 2)).toMatchObject({
      key: "admin.users.bulkResendQueuedPartial",
      tone: "warning",
    });
  });

  it("hiçbiri uygulanamadıysa aksiyondan bağımsız hata", () => {
    expect(bulkResultMessage("resend", 0, 3).key).toBe(
      "admin.users.bulkFailedAll",
    );
    expect(bulkResultMessage("ban", 0, 3).key).toBe(
      "admin.users.bulkFailedAll",
    );
  });

  it("senkron aksiyonlar eski metni kullanır", () => {
    for (const action of ["ban", "unban", "verify"] as const) {
      expect(bulkResultMessage(action, 3, 0).key).toBe(
        "admin.users.bulkResult",
      );
    }
  });
});

describe("bulkConfirmDescriptionKey", () => {
  it("yalnız kuyruklanan yol farklı söz verir", () => {
    expect(bulkConfirmDescriptionKey("resend")).toBe(
      "admin.users.bulkResendConfirmDesc",
    );
    expect(bulkConfirmDescriptionKey("ban")).toBe(
      "admin.users.bulkConfirmDesc",
    );
  });
});
