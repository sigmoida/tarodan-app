import * as request from "supertest";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
  getPrisma,
} from "../test-utils/db";
import {
  createUser,
  authHeader,
  type CreatedTestUser,
} from "../factories/user.factory";

/**
 * Saved searches over HTTP and a real database (critical path 13). The unit
 * spec pins the rules; this one pins what only the database can show: the
 * parallel-save race at limit - 1, the duplicate race and its unique index,
 * and the deletion of the rows with the account. The baseline free tier
 * allows 5 (`seedBaseline`).
 */
describe("Saved searches (E2E)", () => {
  let ctx: E2ETestApp;
  const http = () => request(ctx.app.getHttpServer());

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

  const save = (user: CreatedTestUser, body: Record<string, unknown>) =>
    http().post("/api/saved-searches").set(authHeader(user)).send(body);

  const saveN = async (user: CreatedTestUser, n: number) => {
    for (let i = 0; i < n; i++) {
      await save(user, { query: { search: `query ${i}` } }).expect(201);
    }
  };

  /**
   * The free membership is created lazily on the first membership read and
   * that create is not race-safe; parallel tests warm it first so they test
   * the save race only.
   */
  const warmMembership = (user: CreatedTestUser) =>
    http().get("/api/membership/me/limits").set(authHeader(user)).expect(200);

  const countOf = (userId: string) =>
    getPrisma().savedSearch.count({ where: { userId } });

  describe("authentication (default closed)", () => {
    it("refuses a guest on every route with 401", async () => {
      await http().get("/api/saved-searches").expect(401);
      await http()
        .post("/api/saved-searches")
        .send({ query: { search: "x" } })
        .expect(401);
      await http()
        .delete("/api/saved-searches/3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60")
        .expect(401);
    });
  });

  describe("the tier limit", () => {
    it("serves maxSavedSearches on /membership/me/limits", async () => {
      const user = await createUser(ctx.module);

      const res = await http()
        .get("/api/membership/me/limits")
        .set(authHeader(user))
        .expect(200);

      expect(res.body.maxSavedSearches).toBe(5);
      expect(res.body).toHaveProperty("maxTotalListings");
    });

    it("saves the fifth search and refuses the sixth with 403 SAVED_SEARCH_LIMIT", async () => {
      const user = await createUser(ctx.module);
      await saveN(user, 4);

      await save(user, { query: { search: "fifth" } }).expect(201);
      const res = await save(user, { query: { search: "sixth" } }).expect(403);

      expect(res.body).toMatchObject({
        i18nKey: "server.savedSearch.limitReached",
        errorCode: "SAVED_SEARCH_LIMIT",
        limit: 5,
      });
      expect(await countOf(user.id)).toBe(5);
    });

    it("two parallel saves at 4 of 5 leave exactly 5", async () => {
      const user = await createUser(ctx.module);
      await saveN(user, 4);

      const results = await Promise.all([
        save(user, { query: { search: "race a" } }),
        save(user, { query: { search: "race b" } }),
        save(user, { query: { search: "race c" } }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 403, 403]);
      expect(await countOf(user.id)).toBe(5);
    });

    it("after a downgrade below the count, lists every search and refuses new ones", async () => {
      const user = await createUser(ctx.module);
      await saveN(user, 3);
      await getPrisma().membershipTier.update({
        where: { type: "free" },
        data: { maxSavedSearches: 2 },
      });

      const list = await http()
        .get("/api/saved-searches")
        .set(authHeader(user))
        .expect(200);
      expect(list.body.data).toHaveLength(3);

      const res = await save(user, { query: { search: "more" } }).expect(403);
      expect(res.body.limit).toBe(2);
    });
  });

  describe("duplicates", () => {
    it("answers 409 for the same canonical query in another form", async () => {
      const user = await createUser(ctx.module);
      await save(user, {
        query: { search: "porsche", color: "red,black", tradeOnly: true },
      }).expect(201);

      const res = await save(user, {
        query: { tradeOnly: "true", color: "black,red", search: "porsche " },
      }).expect(409);

      expect(res.body).toMatchObject({
        i18nKey: "server.savedSearch.alreadySaved",
        errorCode: "SAVED_SEARCH_DUPLICATE",
      });
      expect(await countOf(user.id)).toBe(1);
    });

    it("two parallel identical saves store one row and answer one 409", async () => {
      const user = await createUser(ctx.module);
      await warmMembership(user);

      const results = await Promise.all([
        save(user, { query: { search: "same" } }),
        save(user, { query: { search: "same" } }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await countOf(user.id)).toBe(1);
    });

    it("the unique (user_id, query_hash) index refuses a second row (P2002)", async () => {
      const user = await createUser(ctx.module);
      const row = {
        userId: user.id,
        query: { search: "x" },
        queryHash: "a".repeat(64),
      };
      await getPrisma().savedSearch.create({ data: row });

      await expect(
        getPrisma().savedSearch.create({ data: row }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("lets two users save the same search", async () => {
      const a = await createUser(ctx.module);
      const b = await createUser(ctx.module);

      await save(a, { query: { search: "shared" } }).expect(201);
      await save(b, { query: { search: "shared" } }).expect(201);
    });
  });

  describe("validation and the stored form", () => {
    it("refuses an empty search or a sort only with 400 emptyQuery", async () => {
      const user = await createUser(ctx.module);

      for (const query of [{}, { sortBy: "price_asc" }, { page: 2 }]) {
        const res = await save(user, { query }).expect(400);
        expect(res.body.i18nKey).toBe("server.savedSearch.emptyQuery");
      }
    });

    it("refuses values GET /products refuses", async () => {
      const user = await createUser(ctx.module);

      await save(user, { query: { categoryId: "nope" } }).expect(400);
      await save(user, { query: { maxPrice: 10000000 } }).expect(400);
    });

    it("drops unknown keys and stores the canonical query and the default name", async () => {
      const user = await createUser(ctx.module);

      const res = await save(user, {
        query: {
          search: " ferrari ",
          page: 3,
          sellerId: user.id,
          status: "sold",
          sortBy: "price_desc",
        },
      }).expect(201);

      expect(res.body).toMatchObject({
        name: "ferrari",
        query: { search: "ferrari", sortBy: "price_desc" },
        labels: {},
      });
      const row = await getPrisma().savedSearch.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row.query).toEqual({ search: "ferrari", sortBy: "price_desc" });
    });

    it("stores null as the name when none can be derived", async () => {
      const user = await createUser(ctx.module);

      const res = await save(user, { query: { tradeOnly: true } }).expect(201);

      expect(res.body.name).toBeNull();
    });
  });

  describe("ownership", () => {
    it("lists only the caller's searches, newest first", async () => {
      const owner = await createUser(ctx.module);
      const other = await createUser(ctx.module);
      const first = await save(owner, { query: { search: "first" } }).expect(
        201,
      );
      await save(owner, { query: { search: "second" } }).expect(201);
      // Two saves can share a millisecond; make the order explicit.
      await getPrisma().savedSearch.update({
        where: { id: first.body.id },
        data: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
      });
      await save(other, { query: { search: "not mine" } }).expect(201);

      const res = await http()
        .get("/api/saved-searches?limit=100")
        .set(authHeader(owner))
        .expect(200);

      expect(res.body.data.map((s: { name: string }) => s.name)).toEqual([
        "second",
        "first",
      ]);
      expect(res.body.meta).toMatchObject({ total: 2, page: 1, limit: 100 });
    });

    it("refuses deleting another user's search with 404 and keeps it", async () => {
      const owner = await createUser(ctx.module);
      const intruder = await createUser(ctx.module);
      const saved = await save(owner, { query: { search: "mine" } }).expect(
        201,
      );

      const res = await http()
        .delete(`/api/saved-searches/${saved.body.id}`)
        .set(authHeader(intruder))
        .expect(404);

      expect(res.body.i18nKey).toBe("server.savedSearch.notFound");
      expect(await countOf(owner.id)).toBe(1);
    });

    it("deletes the caller's own search with 204", async () => {
      const owner = await createUser(ctx.module);
      const saved = await save(owner, { query: { search: "mine" } }).expect(
        201,
      );

      await http()
        .delete(`/api/saved-searches/${saved.body.id}`)
        .set(authHeader(owner))
        .expect(204);

      expect(await countOf(owner.id)).toBe(0);
    });
  });

  describe("account deletion", () => {
    it("removes the user's saved searches", async () => {
      const user = await createUser(ctx.module);
      await saveN(user, 2);

      await http().delete("/api/users/me").set(authHeader(user)).expect(200);

      expect(await countOf(user.id)).toBe(0);
    });
  });
});
