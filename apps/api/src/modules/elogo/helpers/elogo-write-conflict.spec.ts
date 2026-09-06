import { Prisma } from "@prisma/client";
import {
  isWriteConflictError,
  retryOnWriteConflict,
} from "./elogo-write-conflict";

/**
 * Sentry TARODAN-API-G/H: komisyon + hizmet bedeli aynı anda kesilirken
 * `elogoDocSequence.upsert` "Transaction failed due to a write conflict or a
 * deadlock" (P2034) ile düşüyor, hata yutuluyor ve belge 10 dakikalık
 * backfill'e kalıyordu. Çakışma yeniden denenmeli, başka hatalar denenmemeli.
 */
describe("eLogo write-conflict retry", () => {
  const p2034 = () =>
    new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict or a deadlock. Please retry your transaction",
      { code: "P2034", clientVersion: "test" },
    );

  it("P2034 ve serialization mesajları yazma çakışması sayılır", () => {
    expect(isWriteConflictError(p2034())).toBe(true);
    expect(isWriteConflictError({ code: "P2034" })).toBe(true);
    expect(isWriteConflictError(new Error("could not serialize access"))).toBe(
      true,
    );
    expect(isWriteConflictError(new Error("VKN gecersiz"))).toBe(false);
    expect(isWriteConflictError(undefined)).toBe(false);
  });

  it("çakışan transaction kısa beklemeyle yeniden denenir ve sonunda başarır", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await retryOnWriteConflict(
      async () => {
        calls++;
        if (calls < 3) throw p2034();
        return "TRD2026000000001";
      },
      { sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(result).toBe("TRD2026000000001");
    expect(calls).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
  });

  it("deneme bütçesi bitince son çakışma hatası fırlar", async () => {
    let calls = 0;
    await expect(
      retryOnWriteConflict(
        async () => {
          calls++;
          throw p2034();
        },
        { attempts: 3, sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ code: "P2034" });
    expect(calls).toBe(3);
  });

  it("çakışma olmayan hata hiç yeniden denenmez", async () => {
    let calls = 0;
    await expect(
      retryOnWriteConflict(
        async () => {
          calls++;
          throw new Error("SOAP Fault: server");
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toThrow("SOAP Fault");
    expect(calls).toBe(1);
  });
});
