import * as request from "supertest";
import {
  REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING,
  REAUTH_TOKEN_HEADER,
} from "@tarodan/types";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import {
  createUser,
  authHeader,
  type CreatedTestUser,
} from "../factories/user.factory";
import { NotificationService } from "../../src/modules/notification/notification.service";

/**
 * The setting-gated step-up over HTTP (sign-in methods plan, T8b):
 * `DELETE /users/me` and `POST /auth/email/request-change` take
 * `@RequireReauth({ required: "setting" })`. A token that is sent is always
 * checked; a request without one passes only while
 * `auth_require_reauth_for_sensitive_actions` is off (mobile 1.0.5 sends
 * none). Everything is real (Postgres, Redis token store, guards); only the
 * e-mail change mail is stubbed.
 *
 * Written in the T8b test review; NOT RUN yet (needs `test:e2e:setup`).
 */
describe("Setting-gated step-up on sensitive actions (E2E)", () => {
  let ctx: E2ETestApp;
  let notification: NotificationService;

  beforeAll(async () => {
    ctx = await createE2ETestApp();
    notification = ctx.module.get(NotificationService, { strict: false });
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await truncateAll();
    await seedBaseline();
    jest
      .spyOn(notification, "sendEmailChangeCode")
      .mockResolvedValue({ success: true } as never);
  });

  const http = () => request(ctx.app.getHttpServer());

  const setRequirement = (on: boolean) =>
    getPrisma().platformSetting.upsert({
      where: { settingKey: REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING },
      update: { settingValue: on ? "true" : "false" },
      create: {
        settingKey: REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING,
        settingValue: on ? "true" : "false",
        settingType: "boolean",
      },
    });

  async function reauth(user: CreatedTestUser): Promise<string> {
    const res = await http()
      .post("/api/auth/reauth")
      .set(authHeader(user))
      .send({ password: user.password })
      .expect(200);
    return res.body.reauthToken;
  }

  const expectReauthRequired = (res: request.Response) => {
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe("REAUTH_REQUIRED");
  };

  const isDeleted = async (user: CreatedTestUser) =>
    (
      await getPrisma().user.findUnique({
        where: { id: user.id },
        select: { deletedAt: true },
      })
    )?.deletedAt != null;

  const emailChangeRequested = async (user: CreatedTestUser) =>
    (await getPrisma().emailChangeToken.count({
      where: { userId: user.id },
    })) > 0;

  describe("DELETE /api/users/me", () => {
    const deleteMe = (user: CreatedTestUser) =>
      http().delete("/api/users/me").set(authHeader(user));

    describe("setting off (the default)", () => {
      it("deletes the account without a token (mobile 1.0.5)", async () => {
        const user = await createUser(ctx.module);

        await deleteMe(user).expect(200);
        expect(await isDeleted(user)).toBe(true);
      });

      it("refuses another user's token in the header with 403, never 401", async () => {
        const owner = await createUser(ctx.module);
        const victim = await createUser(ctx.module);
        const ownersToken = await reauth(owner);

        expectReauthRequired(
          await deleteMe(victim).set(REAUTH_TOKEN_HEADER, ownersToken),
        );
        expect(await isDeleted(victim)).toBe(false);
      });

      it("refuses a wrong body token even with a live header token (no fallback)", async () => {
        const user = await createUser(ctx.module);
        const token = await reauth(user);

        expectReauthRequired(
          await deleteMe(user)
            .set(REAUTH_TOKEN_HEADER, token)
            .send({ reauthToken: "not-a-live-token" }),
        );
        expect(await isDeleted(user)).toBe(false);
      });
    });

    describe("setting on", () => {
      beforeEach(() => setRequirement(true));

      it("refuses a request without a token", async () => {
        const user = await createUser(ctx.module);

        expectReauthRequired(await deleteMe(user));
        expect(await isDeleted(user)).toBe(false);
      });

      it("deletes the account with the user's own token in X-Reauth-Token", async () => {
        const user = await createUser(ctx.module);
        const token = await reauth(user);

        await deleteMe(user).set(REAUTH_TOKEN_HEADER, token).expect(200);
        expect(await isDeleted(user)).toBe(true);
      });

      it("refuses another user's token", async () => {
        const owner = await createUser(ctx.module);
        const victim = await createUser(ctx.module);
        const ownersToken = await reauth(owner);

        expectReauthRequired(
          await deleteMe(victim).set(REAUTH_TOKEN_HEADER, ownersToken),
        );
        expect(await isDeleted(victim)).toBe(false);
      });
    });

    it("applies a switch of the setting to the next request (read uncached)", async () => {
      const first = await createUser(ctx.module);
      const second = await createUser(ctx.module);

      await setRequirement(false);
      await deleteMe(first).expect(200);

      await setRequirement(true);
      expectReauthRequired(await deleteMe(second));
      expect(await isDeleted(second)).toBe(false);
    });
  });

  describe("POST /api/auth/email/request-change", () => {
    const requestChange = (user: CreatedTestUser, body: object = {}) =>
      http()
        .post("/api/auth/email/request-change")
        .set(authHeader(user))
        .send({ newEmail: `new-${user.id}@example.com`, ...body });

    describe("setting off (the default)", () => {
      it("sends the code without a token (mobile 1.0.5)", async () => {
        const user = await createUser(ctx.module);

        await requestChange(user).expect(201);
        expect(await emailChangeRequested(user)).toBe(true);
      });

      it("refuses another user's token in the body", async () => {
        const owner = await createUser(ctx.module);
        const victim = await createUser(ctx.module);
        const ownersToken = await reauth(owner);

        expectReauthRequired(
          await requestChange(victim, { reauthToken: ownersToken }),
        );
        expect(await emailChangeRequested(victim)).toBe(false);
      });
    });

    describe("setting on", () => {
      beforeEach(() => setRequirement(true));

      it("refuses a request without a token", async () => {
        const user = await createUser(ctx.module);

        expectReauthRequired(await requestChange(user));
        expect(await emailChangeRequested(user)).toBe(false);
      });

      it("sends the code with the user's own token in the body", async () => {
        const user = await createUser(ctx.module);
        const token = await reauth(user);

        await requestChange(user, { reauthToken: token }).expect(201);
        expect(await emailChangeRequested(user)).toBe(true);
      });

      it("sends the code with the user's own token in X-Reauth-Token", async () => {
        const user = await createUser(ctx.module);
        const token = await reauth(user);

        await requestChange(user).set(REAUTH_TOKEN_HEADER, token).expect(201);
        expect(await emailChangeRequested(user)).toBe(true);
      });

      it("refuses another user's token", async () => {
        const owner = await createUser(ctx.module);
        const victim = await createUser(ctx.module);
        const ownersToken = await reauth(owner);

        expectReauthRequired(
          await requestChange(victim, { reauthToken: ownersToken }),
        );
        expect(await emailChangeRequested(victim)).toBe(false);
      });

      it("leaves POST /auth/email/verify-change without a step-up (the code is the proof)", async () => {
        const user = await createUser(ctx.module);

        const res = await http()
          .post("/api/auth/email/verify-change")
          .set(authHeader(user))
          .send({ code: "000000" });
        expect(res.body.errorCode).not.toBe("REAUTH_REQUIRED");
        expect(res.status).not.toBe(401);
      });
    });
  });
});
