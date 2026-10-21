import { NotFoundException } from "@nestjs/common";
import { SIGN_IN_METHOD_EVENT_TYPES, type SignInMethods } from "@tarodan/types";
import {
  AdminUserSignInMethodsService,
  toAdminSignInMethodEvent,
  type SignInMethodEventRow,
} from "./admin-user-sign-in-methods.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const AT = new Date("2026-10-21T10:00:00.000Z");

/** Values that must never reach the admin, planted in every column and key. */
const SECRETS = {
  ip: "203.0.113.7",
  ua: "Mozilla/5.0 secret-agent",
  token: "reauth-token-abcdef0123456789",
  sub: "google-sub-000111",
  email: "member@example.test",
};

function row(
  eventType: string,
  details: SignInMethodEventRow["details"],
  over: Partial<SignInMethodEventRow> = {},
): SignInMethodEventRow {
  return { id: `log-${eventType}`, eventType, createdAt: AT, details, ...over };
}

function setup(
  opts: { userExists?: boolean; rows?: unknown[]; total?: number } = {},
) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.userExists === false ? null : { id: USER_ID }),
    },
    securityLog: {
      count: jest.fn().mockResolvedValue(opts.total ?? opts.rows?.length ?? 0),
      findMany: jest.fn().mockResolvedValue(opts.rows ?? []),
    },
  };
  const methods: SignInMethods = {
    hasPassword: true,
    providers: [
      {
        provider: "google",
        email: "g@example.test",
        linkedAt: AT.toISOString(),
      },
    ],
  };
  const signInMethods = {
    getSignInMethods: jest.fn().mockResolvedValue(methods),
  };
  const service = new AdminUserSignInMethodsService(
    prisma as never,
    signInMethods as never,
  );
  return { service, prisma, signInMethods, methods };
}

describe("AdminUserSignInMethodsService", () => {
  describe("getSignInMethods", () => {
    it("answers the auth read model unchanged (one implementation)", async () => {
      const { service, signInMethods, methods } = setup();
      await expect(service.getSignInMethods(USER_ID)).resolves.toBe(methods);
      expect(signInMethods.getSignInMethods).toHaveBeenCalledWith(USER_ID);
    });

    it("passes the 404 of an unknown user through", async () => {
      const { service, signInMethods } = setup();
      signInMethods.getSignInMethods.mockRejectedValue(new NotFoundException());
      await expect(service.getSignInMethods(USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("listEvents query", () => {
    it("reads only the user's sign-in method events, newest first, with no IP, UA or e-mail column", async () => {
      const { service, prisma } = setup();
      await service.listEvents(USER_ID, {});
      const args = prisma.securityLog.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        userId: USER_ID,
        eventType: { in: [...SIGN_IN_METHOD_EVENT_TYPES] },
      });
      expect(args.select).toEqual({
        id: true,
        eventType: true,
        createdAt: true,
        details: true,
      });
      expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
      expect(prisma.securityLog.count).toHaveBeenCalledWith({
        where: args.where,
      });
    });

    it("lists every sign-in method event and nothing else", () => {
      expect([...SIGN_IN_METHOD_EVENT_TYPES].sort()).toEqual(
        [
          "password_set",
          "reauth_failed",
          "reauth_locked",
          "social_link_reset",
          "social_linked",
          "social_linked_auto",
          "social_unlinked",
        ].sort(),
      );
    });

    it("pages with the admin list defaults and cap", async () => {
      const { service, prisma } = setup({ total: 45 });
      const first = await service.listEvents(USER_ID, {});
      expect(prisma.securityLog.findMany.mock.calls[0][0]).toMatchObject({
        skip: 0,
        take: 20,
      });
      expect(first.meta).toEqual({
        total: 45,
        page: 1,
        limit: 20,
        totalPages: 3,
      });

      await service.listEvents(USER_ID, { page: 3, limit: 10 });
      expect(prisma.securityLog.findMany.mock.calls[1][0]).toMatchObject({
        skip: 20,
        take: 10,
      });

      await service.listEvents(USER_ID, { page: 1, limit: 10_000 });
      expect(prisma.securityLog.findMany.mock.calls[2][0]).toMatchObject({
        take: 500,
      });
    });

    it("keeps the database order (newest first)", async () => {
      const rows = [
        row(
          "social_unlinked",
          { provider: "google", source: "manual" },
          {
            id: "newest",
            createdAt: new Date("2026-10-21T12:00:00.000Z"),
          },
        ),
        row(
          "social_linked",
          { provider: "google", source: "manual" },
          {
            id: "older",
            createdAt: new Date("2026-10-20T12:00:00.000Z"),
          },
        ),
      ];
      const { service } = setup({ rows });
      const result = await service.listEvents(USER_ID, {});
      expect(result.data.map((e) => e.id)).toEqual(["newest", "older"]);
      expect(result.data.map((e) => e.occurredAt)).toEqual([
        "2026-10-21T12:00:00.000Z",
        "2026-10-20T12:00:00.000Z",
      ]);
    });

    it("answers 404 for an unknown user and reads no log", async () => {
      const { service, prisma } = setup({ userExists: false });
      await expect(service.listEvents(USER_ID, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.securityLog.findMany).not.toHaveBeenCalled();
      expect(prisma.securityLog.count).not.toHaveBeenCalled();
    });
  });
});

describe("toAdminSignInMethodEvent (allow-list)", () => {
  it.each([
    [
      "password_set",
      { flow: "password_set" },
      { provider: null, source: null, method: null, flow: "password_set" },
    ],
    [
      "reauth_failed",
      { method: "password", flow: "reauth" },
      { provider: null, source: null, method: "password", flow: "reauth" },
    ],
    [
      "reauth_locked",
      { method: "apple", flow: "reauth" },
      { provider: null, source: null, method: "apple", flow: "reauth" },
    ],
    [
      "social_linked",
      { provider: "google", flow: "provider_link", source: "manual" },
      {
        provider: "google",
        source: "manual",
        method: null,
        flow: "provider_link",
      },
    ],
    [
      "social_linked_auto",
      {
        provider: "apple",
        flow: "social_login",
        mode: "link",
        source: "login",
        linked: true,
      },
      {
        provider: "apple",
        source: "login",
        method: null,
        flow: "social_login",
      },
    ],
    [
      "social_link_reset",
      {
        provider: "google",
        flow: "social_login",
        mode: "take_over",
        source: "login",
        linked: true,
      },
      {
        provider: "google",
        source: "login",
        method: null,
        flow: "social_login",
      },
    ],
    [
      "social_unlinked",
      { provider: "apple", flow: "provider_unlink", source: "manual" },
      {
        provider: "apple",
        source: "manual",
        method: null,
        flow: "provider_unlink",
      },
    ],
  ])("%s maps the fields its writer stores", (eventType, details, expected) => {
    expect(toAdminSignInMethodEvent(row(eventType, details))).toEqual({
      id: `log-${eventType}`,
      eventType,
      occurredAt: AT.toISOString(),
      ...expected,
    });
  });

  it("never returns an IP, a user agent, a token, a provider subject or an e-mail", () => {
    const planted = {
      ...row("social_linked", {
        provider: "google",
        source: "manual",
        flow: "provider_link",
        ipAddress: SECRETS.ip,
        userAgent: SECRETS.ua,
        reauthToken: SECRETS.token,
        token: SECRETS.token,
        idToken: SECRETS.token,
        providerUserId: SECRETS.sub,
        email: SECRETS.email,
        nested: { ip: SECRETS.ip },
      }),
      // Columns a broader query would have loaded.
      ipAddress: SECRETS.ip,
      userAgent: SECRETS.ua,
      email: SECRETS.email,
    } as SignInMethodEventRow;
    const event = toAdminSignInMethodEvent(planted);
    expect(Object.keys(event ?? {}).sort()).toEqual(
      [
        "eventType",
        "flow",
        "id",
        "method",
        "occurredAt",
        "provider",
        "source",
      ].sort(),
    );
    const json = JSON.stringify(event);
    for (const secret of Object.values(SECRETS)) {
      expect(json).not.toContain(secret);
    }
  });

  it("drops a value outside its known set (no free-form passthrough)", () => {
    expect(
      toAdminSignInMethodEvent(
        row("reauth_failed", {
          provider: "facebook",
          source: SECRETS.token,
          method: SECRETS.email,
          flow: SECRETS.ip,
        }),
      ),
    ).toMatchObject({ provider: null, source: null, method: null, flow: null });
    expect(
      toAdminSignInMethodEvent(
        row("social_linked", { provider: 42, source: ["manual"] }),
      ),
    ).toMatchObject({ provider: null, source: null });
  });

  it.each([null, "a string", 7, ["provider", "google"]])(
    "treats non-object details (%p) as empty",
    (details) => {
      expect(
        toAdminSignInMethodEvent(row("password_set", details)),
      ).toMatchObject({
        provider: null,
        source: null,
        method: null,
        flow: null,
      });
    },
  );

  it("returns null for an event type outside the sign-in method events", () => {
    expect(
      toAdminSignInMethodEvent(row("failed_login", { email: SECRETS.email })),
    ).toBeNull();
  });
});
