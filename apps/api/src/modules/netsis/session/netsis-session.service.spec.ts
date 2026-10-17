import { ServiceUnavailableException } from "@nestjs/common";
import type { NetsisConfig } from "../../../config/netsis";
import type { CacheService } from "../../cache/cache.service";
import { NetsisRequestException } from "../http/netsis-error";
import type { NetsisRequest, NetsisTransport } from "../http/netsis-transport";
import {
  netsisTokenCacheTtlSeconds,
  NetsisSessionService,
  readNetsisTokenResponse,
} from "./netsis-session.service";

/**
 * Bellek içi Redis yerine geçen sahte: `CacheService`'in oturumun kullandığı
 * yüzeyi (get/set/del/setIfAbsent) ve TTL'i kaydeder. Birden fazla oturum
 * örneği aynı nesneyi paylaşınca "birden fazla süreç" senaryosu olur.
 */
class FakeSharedCache {
  readonly store = new Map<string, unknown>();
  readonly ttls = new Map<string, number>();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }
  async set(key: string, value: unknown, options?: { ttl?: number }) {
    this.store.set(key, JSON.parse(JSON.stringify(value)));
    if (options?.ttl !== undefined) this.ttls.set(key, options.ttl);
  }
  async del(key: string) {
    this.store.delete(key);
  }
  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.store.has(key)) return false;
    this.store.set(key, "1");
    this.ttls.set(key, ttlSeconds);
    return true;
  }
}

/** Yoklama beklemesini makro-göreve indirir; testler gerçek süre beklemez. */
class TestSession extends NetsisSessionService {
  protected override sleep(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }
}

const CONFIG: NetsisConfig = {
  enabled: true,
  mode: "live",
  baseUrl: "https://netsis.test",
  username: "NETSIS",
  password: "user-secret",
  dbName: "TARODAN2026",
  dbUser: "TEMELSET",
  dbPassword: "db-secret",
  dbType: "vtMSSQL",
  branchCode: "0",
  timeoutMs: 15_000,
  tokenSafetySeconds: 60,
};

describe("NetsisSessionService", () => {
  let cache: FakeSharedCache;
  let send: jest.Mock<Promise<unknown>, [NetsisRequest]>;
  let tokenCounter: number;

  const makeSession = (config: Partial<NetsisConfig> = {}) =>
    new TestSession(
      { send } as unknown as NetsisTransport,
      cache as unknown as CacheService,
      { ...CONFIG, ...config },
    );
  const tokenRequests = () =>
    send.mock.calls.filter(([request]) => request.path === "token");

  beforeEach(() => {
    cache = new FakeSharedCache();
    tokenCounter = 0;
    send = jest.fn(async (request: NetsisRequest) => {
      if (request.path === "token") {
        tokenCounter += 1;
        return {
          access_token: `token-${tokenCounter}`,
          token_type: "bearer",
          expires_in: 1200,
        };
      }
      return null;
    });
  });

  it("logs in with the documented form body and caches with the safety margin", async () => {
    await expect(makeSession().getAccessToken()).resolves.toBe("token-1");

    expect(tokenRequests()).toHaveLength(1);
    expect(send).toHaveBeenCalledWith({
      method: "POST",
      path: "token",
      form: {
        grant_type: "password",
        username: "NETSIS",
        password: "user-secret",
        dbname: "TARODAN2026",
        dbuser: "TEMELSET",
        dbpassword: "db-secret",
        dbtype: "vtMSSQL",
        branchcode: "0",
      },
    });
    expect(cache.store.get("netsis:token")).toEqual({
      accessToken: "token-1",
    });
    expect(cache.ttls.get("netsis:token")).toBe(1200 - 60);
    // Kilit bırakıldı.
    expect(cache.store.has("netsis:token:lock")).toBe(false);
  });

  it("never writes credentials to the cache", async () => {
    await makeSession().getAccessToken();
    const dump = JSON.stringify([...cache.store.values()]);
    expect(dump).not.toContain("user-secret");
    expect(dump).not.toContain("db-secret");
  });

  it("reuses a token another process already cached (no login)", async () => {
    cache.store.set("netsis:token", { accessToken: "shared" });

    await expect(makeSession().getAccessToken()).resolves.toBe("shared");
    expect(tokenRequests()).toHaveLength(0);
  });

  it("collapses concurrent callers in one process into a single login", async () => {
    const session = makeSession();
    const tokens = await Promise.all([
      session.getAccessToken(),
      session.getAccessToken(),
      session.getAccessToken(),
    ]);

    expect(tokens).toEqual(["token-1", "token-1", "token-1"]);
    expect(tokenRequests()).toHaveLength(1);
  });

  it("lets only the lock holder log in when several processes race", async () => {
    let releaseLogin: () => void = () => undefined;
    send.mockImplementation(async (request: NetsisRequest) => {
      if (request.path !== "token") return null;
      tokenCounter += 1;
      await new Promise<void>((resolve) => {
        releaseLogin = resolve;
      });
      return { access_token: `token-${tokenCounter}`, expires_in: 1200 };
    });
    const web = makeSession();
    const worker = makeSession();

    const first = web.getAccessToken();
    // web kilidi aldı ve login'de bekliyor; worker kilidi alamayıp yokluyor.
    await new Promise((resolve) => setImmediate(resolve));
    const second = worker.getAccessToken();
    await new Promise((resolve) => setImmediate(resolve));
    releaseLogin();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "token-1",
      "token-1",
    ]);
    expect(tokenRequests()).toHaveLength(1);
  });

  it("takes over after the lock holder vanishes, re-checking the cache first", async () => {
    // Başka bir süreç kilidi tutuyor, sonra token'ı yazıp kilidi bırakıyor.
    cache.store.set("netsis:token:lock", "1");
    const session = makeSession();
    const pending = session.getAccessToken();
    await new Promise((resolve) => setImmediate(resolve));
    cache.store.set("netsis:token", { accessToken: "from-other-process" });
    cache.store.delete("netsis:token:lock");

    await expect(pending).resolves.toBe("from-other-process");
    expect(tokenRequests()).toHaveLength(0);
  });

  it("gives up with a localized 503 when the lock is never released", async () => {
    cache.store.set("netsis:token:lock", "1");
    const session = makeSession({ timeoutMs: 1 });
    const realNow = Date.now;
    let now = realNow();
    jest.spyOn(Date, "now").mockImplementation(() => (now += 1000));

    try {
      const error = await session.getAccessToken().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        i18nKey: "server.netsis.sessionBusy",
      });
      expect(tokenRequests()).toHaveLength(0);
    } finally {
      jest.restoreAllMocks();
    }
  });

  describe("withSession", () => {
    const unauthorized = () =>
      new NetsisRequestException("auth", 401, "expired");

    it("re-authenticates once on 401 and retries with the fresh token", async () => {
      cache.store.set("netsis:token", { accessToken: "stale" });
      const call = jest
        .fn<Promise<string>, [string]>()
        .mockRejectedValueOnce(unauthorized())
        .mockResolvedValueOnce("ok");

      await expect(makeSession().withSession(call)).resolves.toBe("ok");
      expect(call.mock.calls.map(([token]) => token)).toEqual([
        "stale",
        "token-1",
      ]);
      expect(tokenRequests()).toHaveLength(1);
    });

    it("rethrows when the retry is also rejected (no login loop)", async () => {
      const call = jest.fn(async () => {
        throw unauthorized();
      });

      await expect(makeSession().withSession(call)).rejects.toMatchObject({
        upstreamStatus: 401,
      });
      expect(call).toHaveBeenCalledTimes(2);
      expect(tokenRequests()).toHaveLength(2);
    });

    it("does not retry inside a transaction (the transaction is bound to the session)", async () => {
      const call = jest.fn(async () => {
        throw unauthorized();
      });

      await expect(
        makeSession().withSession(call, { retryOnUnauthorized: false }),
      ).rejects.toMatchObject({ upstreamStatus: 401 });
      expect(call).toHaveBeenCalledTimes(1);
    });

    it("does not re-authenticate on other failures (403 included)", async () => {
      const call = jest.fn(async () => {
        throw new NetsisRequestException("auth", 403, "no permission");
      });

      await expect(makeSession().withSession(call)).rejects.toMatchObject({
        upstreamStatus: 403,
      });
      expect(call).toHaveBeenCalledTimes(1);
    });

    it("leaves a token another process already refreshed in place", async () => {
      cache.store.set("netsis:token", { accessToken: "fresh-elsewhere" });
      await makeSession().invalidate("stale");
      expect(cache.store.get("netsis:token")).toEqual({
        accessToken: "fresh-elsewhere",
      });
    });
  });

  describe("revoke", () => {
    it("drops the shared token and calls revoke with it", async () => {
      cache.store.set("netsis:token", { accessToken: "shared" });

      await makeSession().revoke();

      expect(cache.store.has("netsis:token")).toBe(false);
      expect(send).toHaveBeenCalledWith({
        method: "GET",
        path: "revoke",
        bearerToken: "shared",
      });
    });

    it("is a no-op without a session and swallows a failed revoke", async () => {
      await makeSession().revoke();
      expect(send).not.toHaveBeenCalled();

      cache.store.set("netsis:token", { accessToken: "shared" });
      send.mockRejectedValueOnce(
        new NetsisRequestException("network", null, "down"),
      );
      await expect(makeSession().revoke()).resolves.toBeUndefined();
      expect(cache.store.has("netsis:token")).toBe(false);
    });
  });

  it("refuses to log in without credentials", async () => {
    await expect(
      makeSession({ password: "" }).getAccessToken(),
    ).rejects.toMatchObject({ kind: "configuration" });
    expect(send).not.toHaveBeenCalled();
    expect(cache.store.has("netsis:token:lock")).toBe(false);
  });
});

describe("netsisTokenCacheTtlSeconds", () => {
  it.each([
    [1200, 60, 1140],
    [3600, 0, 3600],
    [90, 60, 30],
    [60, 60, 30],
    [30, 60, 15],
    [1, 60, 1],
    [null, 60, 540],
    [Number.NaN, 60, 540],
    [-5, 60, 540],
  ])("expires_in %p, safety %p → %p", (expiresIn, safety, expected) => {
    expect(netsisTokenCacheTtlSeconds(expiresIn, safety)).toBe(expected);
  });
});

describe("readNetsisTokenResponse", () => {
  it("reads the OAuth shape, numeric or string expires_in", () => {
    expect(
      readNetsisTokenResponse({ access_token: "a", expires_in: 1200 }),
    ).toEqual({ accessToken: "a", expiresIn: 1200 });
    expect(
      readNetsisTokenResponse({ access_token: "a", expires_in: "1200" }),
    ).toEqual({ accessToken: "a", expiresIn: 1200 });
    expect(readNetsisTokenResponse({ access_token: "a" })).toEqual({
      accessToken: "a",
      expiresIn: null,
    });
  });

  it("treats a response without a token as an auth failure", () => {
    expect(() => readNetsisTokenResponse({ error: "x" })).toThrow(
      NetsisRequestException,
    );
    expect(() => readNetsisTokenResponse("nope")).toThrow(
      NetsisRequestException,
    );
  });
});
