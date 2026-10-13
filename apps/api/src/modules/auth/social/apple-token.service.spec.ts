import appleSignin from "apple-signin-auth";
import {
  APPLE_INVALID_CLIENT_MAX_ATTEMPTS,
  APPLE_TOKEN_REVOKE_MAX_ATTEMPTS,
  AppleTokenService,
  classifyAppleRevokeFailure,
} from "./apple-token.service";
import { PermanentOutboxError } from "../../outbox/outbox-errors";
import { AppleTokenCipher } from "./apple-token-cipher";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import { OUTBOX_APPLE_TOKEN_REVOKE } from "../../outbox/outbox.types";
import { isEncryptedSecret } from "../../../common/security/secret-cipher";

jest.mock("apple-signin-auth");

/**
 * App Store 5.1.1(v) — Sign in with Apple hesap silmede token iptali.
 *
 * Kurallar: kod girişin client id'siyle refresh token'a çevrilir ve ŞİFRELİ
 * saklanır; hesap silme iptali outbox'a yazar; iptal handler'ı idempotenttir,
 * Apple hatasında fırlatır (yeniden deneme), yapılandırma yoksa no-op + iz.
 * Giriş ve silme bu servis yüzünden hiçbir koşulda düşmez.
 */
describe("AppleTokenService", () => {
  const clientSecret = appleSignin.getClientSecret as jest.Mock;
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  /** Apple ucunun yanıtı: durum + (varsa) JSON gövde. */
  const appleReplies = (status: number, body?: Record<string, unknown>) =>
    fetchMock.mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      text: async () => (body ? JSON.stringify(body) : ""),
    });

  /** Son Apple isteğinin yolu ve form parametreleri. */
  const lastAppleRequest = () => {
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    return {
      url: String(url),
      params: Object.fromEntries(new URLSearchParams(init.body)),
      init,
    };
  };

  beforeAll(() => {
    global.fetch = fetchMock as never;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  const fullConfig: Record<string, string> = {
    APPLE_TEAM_ID: "TEAM123456",
    APPLE_KEY_ID: "KEY1234567",
    APPLE_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
    APPLE_TOKEN_ENCRYPTION_KEY: "k".repeat(40),
  };

  const makeService = (
    config: Record<string, string> = fullConfig,
    opts: {
      /** Kilitlenen kullanıcı satırı; null = satır yok. */
      user?: { deleted_at: Date | null } | null;
      /** Kullanıcının canlı (iptali istenmemiş) token satırı. */
      liveRow?: { id: string } | null;
    } = {},
  ) => {
    const configService = { get: (key: string) => config[key] };
    const cipher = new AppleTokenCipher(configService as never);
    const user = opts.user === undefined ? { deleted_at: null } : opts.user;
    const prisma: Record<string, any> = {
      $queryRaw: jest.fn().mockResolvedValue(user ? [user] : []),
      appleSignInToken: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(opts.liveRow ?? null),
        create: jest.fn().mockResolvedValue({ id: "new-row" }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    // persistToken'ın işlemi: tx = aynı taklit.
    prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const registry = new OutboxHandlerRegistry();
    const service = new AppleTokenService(
      prisma as never,
      configService as never,
      cipher,
      outbox as never,
      registry,
    );
    return { service, prisma, outbox, registry, cipher };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    clientSecret.mockReturnValue("client-secret-jwt");
  });

  describe("storeFromAuthorizationCode", () => {
    const input = {
      userId: "u1",
      appleUserId: "apple-sub-1",
      clientId: "com.tarodan.app.staging",
      authorizationCode: "code-1",
    };

    /** Apple token yanıtındaki id_token (imzasız test JWT'si). */
    const idToken = (claims: Record<string, unknown>) =>
      [
        "e30",
        Buffer.from(JSON.stringify(claims)).toString("base64url"),
        "sig",
      ].join(".");
    const exchangeOk = (
      claims: Record<string, unknown> = {
        sub: "apple-sub-1",
        aud: "com.tarodan.app.staging",
      },
    ) =>
      appleReplies(200, {
        refresh_token: "rt-secret",
        id_token: idToken(claims),
      });

    it("exchanges the code with the sign-in client id and stores the token encrypted", async () => {
      exchangeOk();
      const { service, prisma, cipher } = makeService();

      await service.storeFromAuthorizationCode(input);

      expect(clientSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          clientID: "com.tarodan.app.staging",
          teamID: "TEAM123456",
          keyIdentifier: "KEY1234567",
          // Tek satır env'deki `\n` gerçek satır sonuna çevrilir.
          privateKey:
            "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
        }),
      );
      const request = lastAppleRequest();
      expect(request.url).toBe("https://appleid.apple.com/auth/token");
      expect(request.params).toEqual({
        client_id: "com.tarodan.app.staging",
        client_secret: "client-secret-jwt",
        code: "code-1",
        grant_type: "authorization_code",
      });
      // Apple çağrısı süre sınırlı (AbortController).
      expect(request.init.signal).toBeDefined();
      const call = prisma.appleSignInToken.create.mock.calls[0][0];
      expect(call.data).toEqual({
        userId: "u1",
        clientId: "com.tarodan.app.staging",
        refreshTokenEncrypted: expect.any(String),
      });
      const stored = call.data.refreshTokenEncrypted as string;
      expect(stored).not.toContain("rt-secret");
      expect(isEncryptedSecret(stored)).toBe(true);
      expect(cipher.decrypt(stored)).toBe("rt-secret");
    });

    it("a new login replaces the user's LIVE row only", async () => {
      exchangeOk();
      const { service, prisma } = makeService(fullConfig, {
        liveRow: { id: "live-1" },
      });

      await service.storeFromAuthorizationCode(input);

      expect(prisma.appleSignInToken.findFirst).toHaveBeenCalledWith({
        where: {
          userId: "u1",
          clientId: "com.tarodan.app.staging",
          revokeRequestedAt: null,
        },
        select: { id: true },
      });
      expect(prisma.appleSignInToken.update).toHaveBeenCalledWith({
        where: { id: "live-1" },
        data: expect.objectContaining({
          refreshTokenEncrypted: expect.any(String),
          revokedAt: null,
          lastRevokeError: null,
        }),
      });
      expect(prisma.appleSignInToken.create).not.toHaveBeenCalled();
    });

    it("locks the user row before writing (serialised with account deletion)", async () => {
      exchangeOk();
      const { service, prisma } = makeService();

      await service.storeFromAuthorizationCode(input);

      const sql = (prisma.$queryRaw.mock.calls[0][0] as string[]).join("?");
      expect(sql).toMatch(/FROM "users" WHERE "id" = \? FOR UPDATE/);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.appleSignInToken.create.mock.invocationCallOrder[0],
      );
    });

    // Silmeyle eşzamanlı biten giriş: silinmiş kullanıcıya iptal edilmeyecek
    // token yazılmamalı.
    it("user already deleted: token written as revoke-requested and revoke queued", async () => {
      exchangeOk();
      const { service, prisma, outbox } = makeService(fullConfig, {
        user: { deleted_at: new Date() },
        liveRow: { id: "live-1" },
      });

      await service.storeFromAuthorizationCode(input);

      expect(prisma.appleSignInToken.update).not.toHaveBeenCalled();
      expect(prisma.appleSignInToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "u1",
          revokeRequestedAt: expect.any(Date),
        }),
        select: { id: true },
      });
      expect(outbox.enqueue).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          payload: { appleSignInTokenId: "new-row" },
          dedupeKey: "apple-token-revoke:new-row",
        }),
      );
    });

    // Kod kimliğe bağlı olmalı: başka bir Apple hesabının ya da uygulamanın
    // kodu bu kullanıcıya yazılmaz.
    it.each([
      [
        "another Apple account",
        { sub: "someone-else", aud: "com.tarodan.app.staging" },
      ],
      ["another client id", { sub: "apple-sub-1", aud: "com.other.app" }],
    ])("code belonging to %s is not stored", async (_label, claims) => {
      exchangeOk(claims);
      const { service, prisma } = makeService();

      await service.storeFromAuthorizationCode(input);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.appleSignInToken.create).not.toHaveBeenCalled();
    });

    it("token response without an id_token is not stored", async () => {
      appleReplies(200, { refresh_token: "rt-secret" });
      const { service, prisma } = makeService();

      await service.storeFromAuthorizationCode(input);

      expect(prisma.appleSignInToken.create).not.toHaveBeenCalled();
    });

    it("Apple error response: nothing stored, login not affected", async () => {
      appleReplies(400, { error: "invalid_grant" });
      const { service, prisma } = makeService();

      await expect(
        service.storeFromAuthorizationCode(input),
      ).resolves.toBeUndefined();
      expect(prisma.appleSignInToken.create).not.toHaveBeenCalled();
    });

    it("5xx is not an exchange, even with a body", async () => {
      appleReplies(500, { refresh_token: "rt-secret" });
      const { service, prisma } = makeService();

      await service.storeFromAuthorizationCode(input);

      expect(prisma.appleSignInToken.create).not.toHaveBeenCalled();
    });

    it("network failure or timeout never throws", async () => {
      fetchMock.mockRejectedValue(new Error("This operation was aborted"));
      const { service } = makeService();

      await expect(
        service.storeFromAuthorizationCode(input),
      ).resolves.toBeUndefined();
    });

    it("no Apple key in env → no-op (no Apple call, no write)", async () => {
      const { service, prisma } = makeService({
        APPLE_TOKEN_ENCRYPTION_KEY: "k".repeat(40),
      });

      await service.storeFromAuthorizationCode(input);

      expect(service.isEnabled()).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.appleSignInToken.create).not.toHaveBeenCalled();
    });
  });

  describe("requestRevocation (account deletion transaction)", () => {
    const makeTx = (ids: string[]) => ({
      $queryRaw: jest.fn().mockResolvedValue([{ id: "u1" }]),
      appleSignInToken: {
        findMany: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
        updateMany: jest.fn().mockResolvedValue({ count: ids.length }),
      },
    });

    it("stamps the user's live tokens and enqueues one revoke per token", async () => {
      const { service, outbox } = makeService();
      const tx = makeTx(["t1", "t2"]);

      const count = await service.requestRevocation(tx as never, "u1");

      expect(count).toBe(2);
      // Kullanıcı satırı kilidi token okumasından önce (persistToken ile sıra).
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.appleSignInToken.findMany.mock.invocationCallOrder[0],
      );
      expect(tx.appleSignInToken.findMany).toHaveBeenCalledWith({
        where: {
          userId: "u1",
          refreshTokenEncrypted: { not: null },
          revokedAt: null,
          revokeRequestedAt: null,
        },
        select: { id: true },
      });
      expect(tx.appleSignInToken.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["t1", "t2"] } },
        data: { revokeRequestedAt: expect.any(Date) },
      });
      expect(outbox.enqueue).toHaveBeenCalledWith(tx, {
        type: OUTBOX_APPLE_TOKEN_REVOKE,
        payload: { appleSignInTokenId: "t1" },
        dedupeKey: "apple-token-revoke:t1",
        // Apple kesintisi / env düzeltmesi için ~1 günlük deneme penceresi.
        maxAttempts: APPLE_TOKEN_REVOKE_MAX_ATTEMPTS,
      });
      expect(outbox.enqueue).toHaveBeenCalledTimes(2);
    });

    it("payload carries only the row id, never the token", async () => {
      const { service, outbox } = makeService();

      await service.requestRevocation(makeTx(["t1"]) as never, "u1");

      expect(Object.keys(outbox.enqueue.mock.calls[0][1].payload)).toEqual([
        "appleSignInTokenId",
      ]);
    });

    it("no Apple token → nothing enqueued", async () => {
      const { service, outbox } = makeService();
      const tx = makeTx([]);

      await expect(service.requestRevocation(tx as never, "u1")).resolves.toBe(
        0,
      );
      expect(tx.appleSignInToken.updateMany).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("revoke (outbox handler)", () => {
    const row = (
      cipher: AppleTokenCipher,
      extra: Record<string, unknown> = {},
    ) => ({
      id: "t1",
      userId: "u1",
      clientId: "com.tarodan.app",
      refreshTokenEncrypted: cipher.encrypt("rt-secret"),
      revokedAt: null,
      ...extra,
    });

    it("registers the handler under its outbox type", () => {
      const { service, registry } = makeService();
      service.onModuleInit();
      expect(registry.get(OUTBOX_APPLE_TOKEN_REVOKE)).toBeDefined();
    });

    it("revokes with the stored client id, then forgets the token", async () => {
      appleReplies(200);
      const { service, prisma, cipher } = makeService();
      prisma.appleSignInToken.findUnique.mockResolvedValue(row(cipher));

      await service.revoke("t1");

      const request = lastAppleRequest();
      expect(request.url).toBe("https://appleid.apple.com/auth/revoke");
      expect(request.params).toEqual({
        client_id: "com.tarodan.app",
        client_secret: "client-secret-jwt",
        token: "rt-secret",
        token_type_hint: "refresh_token",
      });
      expect(prisma.appleSignInToken.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: {
          revokedAt: expect.any(Date),
          refreshTokenEncrypted: null,
          lastRevokeError: null,
        },
      });
    });

    it("idempotent: an already revoked row makes no Apple call", async () => {
      const { service, prisma, cipher } = makeService();
      prisma.appleSignInToken.findUnique.mockResolvedValue(
        row(cipher, { revokedAt: new Date(), refreshTokenEncrypted: null }),
      );

      await service.revoke("t1");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.appleSignInToken.update).not.toHaveBeenCalled();
    });

    // Kütüphane boş gövdeli 5xx'i "" döndürüp başarı gibi gösteriyordu: token
    // iptal edilmeden siliniyor, iş bir daha denenmiyordu.
    it("5xx with an empty body is NOT success: token kept, thrown for retry", async () => {
      appleReplies(503);
      const { service, prisma, cipher } = makeService();
      prisma.appleSignInToken.findUnique.mockResolvedValue(row(cipher));

      await expect(service.revoke("t1")).rejects.toThrow(/apple:503/);
      expect(prisma.appleSignInToken.update).toHaveBeenCalledTimes(1);
      expect(prisma.appleSignInToken.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { lastRevokeError: "apple:503:no_error_code" },
      });
    });

    // invalid_grant "zaten iptal" DEĞİL (o 200 döner): Apple bunu yanlış client
    // id / geçersiz token için de verir. Token silinmez, iş DLQ'ya gider ki
    // düzeltmeden sonra yeniden kuyruğa alınabilsin.
    it.each([
      "invalid_grant",
      "unauthorized_client",
      "unsupported_client",
    ])(
      "%s: permanent → dead-lettered at once, token kept",
      async (code) => {
        appleReplies(400, { error: code });
        const { service, prisma, cipher } = makeService();
        prisma.appleSignInToken.findUnique.mockResolvedValue(row(cipher));

        const error = await service.revoke("t1").catch((e: unknown) => e);

        expect(error).toBeInstanceOf(PermanentOutboxError);
        expect((error as Error).message).toContain(code);
        // Yalnız teşhis yazılır; revokedAt / şifreli token'a dokunulmaz.
        expect(prisma.appleSignInToken.update).toHaveBeenCalledTimes(1);
        expect(prisma.appleSignInToken.update).toHaveBeenCalledWith({
          where: { id: "t1" },
          data: { lastRevokeError: `apple:400:${code}` },
        });
      },
    );

    // Yeni bağlanan Apple anahtarı yayılırken geçici invalid_client dönebilir:
    // birkaç deneme sonra kalıcı sayılır.
    it("invalid_client: retried below the attempt limit, token kept", async () => {
      appleReplies(400, { error: "invalid_client" });
      const { service, prisma, cipher } = makeService();
      prisma.appleSignInToken.findUnique.mockResolvedValue(row(cipher));

      const error = await service
        .revoke("t1", APPLE_INVALID_CLIENT_MAX_ATTEMPTS - 1)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(PermanentOutboxError);
      expect(prisma.appleSignInToken.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { lastRevokeError: "apple:400:invalid_client" },
      });
    });

    it("invalid_client: permanent on the last allowed attempt", async () => {
      appleReplies(400, { error: "invalid_client" });
      const { service, prisma, cipher } = makeService();
      prisma.appleSignInToken.findUnique.mockResolvedValue(row(cipher));

      await expect(
        service.revoke("t1", APPLE_INVALID_CLIENT_MAX_ATTEMPTS),
      ).rejects.toBeInstanceOf(PermanentOutboxError);
    });

    it("outbox handler passes the 1-based attempt (attempts + 1) to revoke", async () => {
      appleReplies(400, { error: "invalid_client" });
      const { service, prisma, cipher, registry } = makeService();
      prisma.appleSignInToken.findUnique.mockResolvedValue(row(cipher));
      service.onModuleInit();
      const handler = registry.get(OUTBOX_APPLE_TOKEN_REVOKE)!;
      const payload = { appleSignInTokenId: "t1" };

      await expect(
        handler(payload, { attempts: 0 } as never),
      ).rejects.not.toBeInstanceOf(PermanentOutboxError);
      await expect(
        handler(payload, {
          attempts: APPLE_INVALID_CLIENT_MAX_ATTEMPTS - 1,
        } as never),
      ).rejects.toBeInstanceOf(PermanentOutboxError);
    });

    it("429 / unknown code: transient → plain error, retried", async () => {
      appleReplies(429);
      const { service, prisma, cipher } = makeService();
      prisma.appleSignInToken.findUnique.mockResolvedValue(row(cipher));

      const error = await service.revoke("t1").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(PermanentOutboxError);
    });

    it("token unreadable with the current key (rotated): permanent, no Apple call", async () => {
      const { service, prisma } = makeService();
      const other = makeService({
        ...fullConfig,
        APPLE_TOKEN_ENCRYPTION_KEY: "x".repeat(40),
      });
      prisma.appleSignInToken.findUnique.mockResolvedValue(row(other.cipher));

      await expect(service.revoke("t1")).rejects.toBeInstanceOf(
        PermanentOutboxError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("network failure: recorded and thrown", async () => {
      fetchMock.mockRejectedValue(new Error("ETIMEDOUT"));
      const { service, prisma, cipher } = makeService();
      prisma.appleSignInToken.findUnique.mockResolvedValue(row(cipher));

      await expect(service.revoke("t1")).rejects.toThrow("ETIMEDOUT");
      expect(prisma.appleSignInToken.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { lastRevokeError: "ETIMEDOUT" },
      });
    });

    // İşi "tamamlandı" saymak env sonradan düzelse de iptali hiç denemezdi.
    it("missing Apple config: thrown (retried / dead-lettered) with a trace on the row", async () => {
      const configured = makeService();
      const encrypted = configured.cipher.encrypt("rt-secret");
      const { service, prisma } = makeService({
        APPLE_TOKEN_ENCRYPTION_KEY: "k".repeat(40),
      });
      prisma.appleSignInToken.findUnique.mockResolvedValue({
        id: "t1",
        userId: "u1",
        clientId: "com.tarodan.app",
        refreshTokenEncrypted: encrypted,
        revokedAt: null,
      });

      await expect(service.revoke("t1")).rejects.toThrow(/not configured/);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.appleSignInToken.update).toHaveBeenCalledTimes(1);
      expect(prisma.appleSignInToken.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { lastRevokeError: "not_configured" },
      });
    });

    it("unknown row: no-op", async () => {
      const { service, prisma } = makeService();
      prisma.appleSignInToken.findUnique.mockResolvedValue(null);

      await expect(service.revoke("missing")).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("classifyAppleRevokeFailure", () => {
    it("invalid_client is transient until the attempt limit", () => {
      expect(classifyAppleRevokeFailure("invalid_client")).toBe("transient");
      expect(
        classifyAppleRevokeFailure(
          "invalid_client",
          APPLE_INVALID_CLIENT_MAX_ATTEMPTS - 1,
        ),
      ).toBe("transient");
      expect(
        classifyAppleRevokeFailure(
          "invalid_client",
          APPLE_INVALID_CLIENT_MAX_ATTEMPTS,
        ),
      ).toBe("permanent");
    });

    it.each([
      ["invalid_grant", "permanent"],
      ["invalid_request", "permanent"],
      ["temporarily_unavailable", "transient"],
      [null, "transient"],
    ] as const)("%p → %s", (code, outcome) => {
      expect(classifyAppleRevokeFailure(code)).toBe(outcome);
    });
  });
});
