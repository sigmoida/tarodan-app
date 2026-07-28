import { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { StripSensitiveFieldsInterceptor } from "./strip-sensitive-fields.interceptor";

/**
 * StripSensitiveFieldsInterceptor — defense-in-depth (#71). Removes passwordHash
 * from any response shape (top-level, nested, arrays) while leaving Decimal money
 * values, Dates, Buffers and other class instances untouched.
 */
describe("StripSensitiveFieldsInterceptor", () => {
  const run = async (payload: unknown): Promise<unknown> => {
    const interceptor = new StripSensitiveFieldsInterceptor();
    const ctx = {} as ExecutionContext;
    const next: CallHandler = { handle: () => of(payload) };
    return lastValueFrom(interceptor.intercept(ctx, next));
  };

  it("strips passwordHash at the top level", async () => {
    const out: any = await run({ id: "1", email: "a@b.c", passwordHash: "x" });
    expect(out.passwordHash).toBeUndefined();
    expect(out.email).toBe("a@b.c");
  });

  it("strips passwordHash from nested objects", async () => {
    const out: any = await run({
      order: { id: "o1", user: { id: "u1", passwordHash: "secret" } },
    });
    expect(out.order.user.passwordHash).toBeUndefined();
    expect(out.order.user.id).toBe("u1");
  });

  it("strips persisted auth, verification and provider token material", async () => {
    const out: any = await run({
      tokenHash: "refresh-hash",
      codeHash: "otp-hash",
      sessionToken: "admin-session",
      unsubscribeToken: "newsletter-secret",
      utoken: "paytr-user-token",
      ctoken: "paytr-card-token",
      refreshTokens: [{ tokenHash: "nested" }],
      twoFactorSecret: { secret: "totp-seed" },
      accessToken: "client-access-token",
      refreshToken: "client-refresh-token",
      backupCodes: ["one-time-code"],
    });

    expect(out).toEqual({
      accessToken: "client-access-token",
      refreshToken: "client-refresh-token",
      backupCodes: ["one-time-code"],
    });
  });

  it("strips passwordHash from every element of an array", async () => {
    const out: any = await run([
      { id: "1", passwordHash: "a" },
      { id: "2", passwordHash: "b" },
    ]);
    expect(out[0].passwordHash).toBeUndefined();
    expect(out[1].passwordHash).toBeUndefined();
    expect(out.map((u: any) => u.id)).toEqual(["1", "2"]);
  });

  it("leaves class instances (Decimal-like) untouched", async () => {
    // Simulate Prisma Decimal: a class instance, NOT a plain object.
    class Decimal {
      constructor(public readonly value: string) {}
      toString() {
        return this.value;
      }
    }
    const price = new Decimal("199.90");
    const out: any = await run({ id: "p1", price, passwordHash: "x" });
    expect(out.passwordHash).toBeUndefined();
    expect(out.price).toBe(price); // same instance, not plain-ified
    expect(out.price.toString()).toBe("199.90");
  });

  it("leaves Date and Buffer values intact", async () => {
    const when = new Date("2026-01-01T00:00:00.000Z");
    const buf = Buffer.from([1, 2, 3]);
    const out: any = await run({ when, buf, passwordHash: "x" });
    expect(out.when).toBe(when);
    expect(Buffer.isBuffer(out.buf)).toBe(true);
    expect(out.passwordHash).toBeUndefined();
  });

  it("passes primitives and null through unchanged", async () => {
    expect(await run("hello")).toBe("hello");
    expect(await run(42)).toBe(42);
    expect(await run(null)).toBeNull();
  });

  it("does not blow up on circular references", async () => {
    const a: any = { id: "1", passwordHash: "x" };
    a.self = a;
    const out: any = await run(a);
    expect(out.passwordHash).toBeUndefined();
    expect(out.self).toBe(out);
  });
});
