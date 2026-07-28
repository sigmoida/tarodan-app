import { TarodanWebSocketGateway } from "./websocket.gateway";

describe("TarodanWebSocketGateway room authorization", () => {
  let gateway: TarodanWebSocketGateway;
  const mockPrisma = {
    messageThread: {
      findUnique: jest.fn().mockResolvedValue({
        id: "t1",
        participant1Id: "u1",
        participant2Id: "u2",
      }),
    },
    order: {
      findUnique: jest.fn().mockResolvedValue({
        buyerId: "buyer-1",
        sellerId: "seller-1",
      }),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new TarodanWebSocketGateway(
      {} as any, // jwtService
      {} as any, // configService
      mockPrisma as any,
      {} as any, // securityService
    );
  });

  const makeClient = (userId: string) => {
    const rooms = new Set<string>();
    return {
      userId,
      rooms,
      join: jest.fn((room: string) => rooms.add(room)),
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
    };
  };

  it("lets a participant join the thread room", async () => {
    const client = makeClient("u1");
    const res = await gateway.handleJoinThread(client as any, {
      threadId: "t1",
    });
    expect(client.join).toHaveBeenCalledWith("thread:t1");
    expect(client.emit).not.toHaveBeenCalledWith("error", expect.anything());
    expect(res).toEqual({ event: "joined:thread", data: { threadId: "t1" } });
  });

  it("rejects a non-participant: no join, emits error", async () => {
    const client = makeClient("intruder");
    const res = await gateway.handleJoinThread(client as any, {
      threadId: "t1",
    });
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith("error", {
      message: "Bu konuya erişim yetkiniz yok",
    });
    expect(res).toEqual({ event: "error", data: { threadId: "t1" } });
  });

  it("only emits typing state after the socket joined the authorized room", () => {
    const client = makeClient("u1");

    expect(
      gateway.handleTypingStart(client as any, { threadId: "t1" }),
    ).toEqual({ event: "error", data: { threadId: "t1" } });
    expect(client.to).not.toHaveBeenCalled();

    client.rooms.add("thread:t1");
    gateway.handleTypingStart(client as any, { threadId: "t1" });
    expect(client.to).toHaveBeenCalledWith("thread:t1");
  });

  it.each(["buyer-1", "seller-1"])(
    "lets order party %s subscribe to the order room",
    async (userId) => {
      const client = makeClient(userId);

      await expect(
        gateway.handleOrderSubscribe(client as any, { orderId: "order-1" }),
      ).resolves.toEqual({
        event: "order:subscribed",
        data: { orderId: "order-1" },
      });
      expect(client.join).toHaveBeenCalledWith("order:order-1");
    },
  );

  it("rejects a user who is not an order party", async () => {
    const client = makeClient("intruder");

    await expect(
      gateway.handleOrderSubscribe(client as any, { orderId: "order-1" }),
    ).resolves.toEqual({
      event: "error",
      data: { orderId: "order-1" },
    });
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith("error", {
      message: "Bu siparişe erişim yetkiniz yok",
    });
  });
});

describe("TarodanWebSocketGateway connection authentication", () => {
  const activeUser = {
    id: "user-1",
    email: "user@example.com",
    displayName: "User",
    isBanned: false,
    deletedAt: null,
    adminUser: null,
  };
  const jwtService = { verifyAsync: jest.fn() };
  const configService = {
    getOrThrow: jest.fn((key: string) => key),
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(activeUser),
    },
  };
  const security = {
    validateAdminSession: jest.fn(),
  };
  let gateway: TarodanWebSocketGateway;

  const makeClient = () => ({
    id: "socket-1",
    handshake: { auth: { token: "token" }, headers: {} },
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(activeUser);
    gateway = new TarodanWebSocketGateway(
      jwtService as any,
      configService as any,
      prisma as any,
      security as any,
    );
  });

  it("authenticates an access token against current database state", async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "user-1",
      type: "access",
    });
    const client = makeClient();

    await gateway.handleConnection(client as any);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: expect.objectContaining({
        id: true,
        isBanned: true,
        deletedAt: true,
      }),
    });
    expect(client.join).toHaveBeenCalledWith("user:user-1");
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("rejects refresh tokens", async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "user-1",
      type: "refresh",
    });
    const client = makeClient();

    await gateway.handleConnection(client as any);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it.each([
    ["banned", { ...activeUser, isBanned: true }],
    ["deleted", { ...activeUser, deletedAt: new Date() }],
  ])("rejects a %s user even with a valid token", async (_label, user) => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "user-1",
      type: "access",
    });
    prisma.user.findUnique.mockResolvedValue(user);
    const client = makeClient();

    await gateway.handleConnection(client as any);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it("accepts an active admin token only when its DB session is active", async () => {
    jwtService.verifyAsync.mockImplementation(
      async (_token: string, options: { secret: string }) => {
        if (options.secret === "JWT_SECRET") throw new Error("wrong realm");
        return {
          sub: "user-1",
          type: "access",
          isAdmin: true,
          sessionToken: "admin-session",
        };
      },
    );
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      adminUser: { id: "admin-1", isActive: true, role: "admin" },
    });
    security.validateAdminSession.mockResolvedValue("admin-1");
    const client = makeClient();

    await gateway.handleConnection(client as any);

    expect(security.validateAdminSession).toHaveBeenCalledWith("admin-session");
    expect(gateway.handleAdminSubscribe(client as any)).toEqual({
      event: "admin:subscribed",
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("rejects an admin token without an active DB session", async () => {
    jwtService.verifyAsync.mockImplementation(
      async (_token: string, options: { secret: string }) => {
        if (options.secret === "JWT_SECRET") throw new Error("wrong realm");
        return {
          sub: "user-1",
          type: "access",
          isAdmin: true,
          sessionToken: "expired-session",
        };
      },
    );
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      adminUser: { id: "admin-1", isActive: true, role: "admin" },
    });
    security.validateAdminSession.mockResolvedValue(null);
    const client = makeClient();

    await gateway.handleConnection(client as any);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalled();
  });
});
