import appleSignin from "apple-signin-auth";
import { AppleTokenService } from "./apple-token.service";
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

  const makeService = (config: Record<string, string> = fullConfig) => {
    const configService = { get: (key: string) => config[key] };
    const cipher = new AppleTokenCipher(configService as never);
    const prisma = {
      appleSignInToken: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
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
      clientId: "com.tarodan.app.staging",
      authorizationCode: "code-1",
    };

    it("exchanges the code with the sign-in client id and stores the token encrypted", async () => {
      appleReplies(200, { refresh_token: "rt-secret" });
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
      const call = prisma.appleSignInToken.upsert.mock.calls[0][0];
      expect(call.where).toEqual({
        userId_clientId: { userId: "u1", clientId: "com.tarodan.app.staging" },
      });
      const stored = call.create.refreshTokenEncrypted as string;
      expect(stored).not.toContain("rt-secret");
      expect(isEncryptedSecret(stored)).toBe(true);
      expect(cipher.decrypt(stored)).toBe("rt-secret");
      expect(call.update).toEqual(
        expect.objectContaining({ revokedAt: null, lastRevokeError: null }),
      );
    });

    it("Apple error response: nothing stored, login not affected", async () => {
      appleReplies(400, { error: "invalid_grant" });
      const { service, prisma } = makeService();

      await expect(
        service.storeFromAuthorizationCode(input),
      ).resolves.toBeUndefined();
      expect(prisma.appleSignInToken.upsert).not.toHaveBeenCalled();
    });

    it("5xx is not an exchange, even with a body", async () => {
      appleReplies(500, { refresh_token: "rt-secret" });
      const { service, prisma } = makeService();

      await service.storeFromAuthorizationCode(input);

      expect(prisma.appleSignInToken.upsert).not.toHaveBeenCalled();
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
      expect(prisma.appleSignInToken.upsert).not.toHaveBeenCalled();
    });
  });

  describe("requestRevocation (account deletion transaction)", () => {
    const makeTx = (ids: string[]) => ({
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

    it("missing Apple config: no-op with a trace on the row", async () => {
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

      await expect(service.revoke("t1")).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
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
});
