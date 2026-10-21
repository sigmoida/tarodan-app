import { ConflictException, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthPasswordService } from "./auth-password.service";

type UserRow = { passwordHash: string | null; deletedAt: Date | null };

/**
 * A database stand-in whose `$transaction` runs one callback at a time, as
 * the `SELECT ... FOR UPDATE` row lock makes Postgres do for the same user.
 */
function createFakeDb(initial: UserRow | null) {
  const state = { user: initial, securityLogs: [] as unknown[] };
  let queue: Promise<unknown> = Promise.resolve();
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      findUnique: jest.fn(async () => (state.user ? { ...state.user } : null)),
      update: jest.fn(async ({ data }: { data: Partial<UserRow> }) => {
        state.user = { ...(state.user as UserRow), ...data };
      }),
    },
    securityLog: {
      create: jest.fn(async ({ data }: { data: unknown }) => {
        state.securityLogs.push(data);
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => {
      const run = queue.then(() => fn(tx));
      queue = run.catch(() => undefined);
      return run;
    }),
  };
  return { state, tx, prisma };
}

describe("AuthPasswordService.setPassword", () => {
  const notifications = {
    sendAccountSecurityNotice: jest.fn().mockResolvedValue(undefined),
  };
  const security = { revokeAllUserTokens: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  const serviceFor = (db: ReturnType<typeof createFakeDb>) =>
    new AuthPasswordService(
      db.prisma as never,
      notifications as never,
      security as never,
    );

  it("sets a bcrypt hash under the row lock, logs password_set and sends the notice", async () => {
    const db = createFakeDb({ passwordHash: null, deletedAt: null });

    await serviceFor(db).setPassword("u1", "New-Pass-1");

    expect(db.tx.$queryRaw).toHaveBeenCalledTimes(1);
    const lockSql = (db.tx.$queryRaw.mock.calls[0][0] as string[]).join("?");
    expect(lockSql).toContain("FOR UPDATE");
    // The lock is on this user's row and is taken before "no password yet?"
    // is read: read-then-lock would let two calls both see no password.
    expect(db.tx.$queryRaw.mock.calls[0].slice(1)).toEqual(["u1"]);
    expect(db.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.tx.user.findUnique.mock.invocationCallOrder[0],
    );
    expect(
      await bcrypt.compare("New-Pass-1", db.state.user!.passwordHash!),
    ).toBe(true);
    // Exact stored row: the admin user history reads eventType and flow.
    expect(db.state.securityLogs).toEqual([
      {
        eventType: "password_set",
        severity: "low",
        userId: "u1",
        // Outside a request context the client info is null.
        ipAddress: null,
        userAgent: null,
        details: { flow: "password_set" },
      },
    ]);
    expect(JSON.stringify(db.state.securityLogs)).not.toContain("New-Pass-1");
    expect(notifications.sendAccountSecurityNotice).toHaveBeenCalledWith(
      "u1",
      "passwordSet",
    );
  });

  it("keeps the other sessions", async () => {
    const db = createFakeDb({ passwordHash: null, deletedAt: null });

    await serviceFor(db).setPassword("u1", "New-Pass-1");

    expect(security.revokeAllUserTokens).not.toHaveBeenCalled();
  });

  it("answers 409 passwordAlreadySet and writes nothing when a password exists", async () => {
    const db = createFakeDb({ passwordHash: "$2b$12$old", deletedAt: null });

    await expect(
      serviceFor(db).setPassword("u1", "New-Pass-1"),
    ).rejects.toMatchObject({
      response: {
        i18nKey: "server.auth.passwordAlreadySet",
        errorCode: "PASSWORD_ALREADY_SET",
      },
    });
    expect(db.tx.user.update).not.toHaveBeenCalled();
    expect(db.state.securityLogs).toHaveLength(0);
    expect(notifications.sendAccountSecurityNotice).not.toHaveBeenCalled();
  });

  it("sets the password once for two concurrent calls", async () => {
    const db = createFakeDb({ passwordHash: null, deletedAt: null });
    const service = serviceFor(db);

    const results = await Promise.allSettled([
      service.setPassword("u1", "First-Pass-1"),
      service.setPassword("u1", "Second-Pass-1"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
    expect(db.tx.user.update).toHaveBeenCalledTimes(1);
    expect(notifications.sendAccountSecurityNotice).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for a deleted account", async () => {
    const db = createFakeDb({ passwordHash: null, deletedAt: new Date() });

    await expect(
      serviceFor(db).setPassword("u1", "New-Pass-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.tx.user.update).not.toHaveBeenCalled();
  });
});
