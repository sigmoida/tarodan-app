import * as request from "supertest";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import { truncateAll, seedBaseline, disconnectPrisma } from "../test-utils/db";
import { createUser, authHeader } from "../factories/user.factory";

describe("Media (E2E)", () => {
  let ctx: E2ETestApp;

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
  });

  describe("Auth gates", () => {
    it("rejects unauthenticated upload (401)", async () => {
      await request(ctx.app.getHttpServer())
        .post("/api/media/upload")
        .expect(401);
    });

    it("rejects unauthenticated delete (401)", async () => {
      await request(ctx.app.getHttpServer())
        .delete("/api/media/file/test-key")
        .expect(401);
    });
  });

  describe("DELETE /api/media/file/* — File deletion (stub)", () => {
    it("authenticated user delete request is accepted (not 401)", async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .delete("/api/media/file/test-file-key")
        .set(authHeader(user));

      // Key maps to no uploaded file → ownership/existence guard rejects; storage
      // stub may 200. The point: request is authenticated, so never 401.
      expect([200, 400, 403, 404]).toContain(res.status);
    });
  });
});
