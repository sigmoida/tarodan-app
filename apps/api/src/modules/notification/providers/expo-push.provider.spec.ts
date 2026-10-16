import { ExpoPushProvider } from "./expo-push.provider";
import {
  EXPO_RECEIPT_CHECK_DELAY_MS,
  PUSH_RECEIPT_JOB,
  classifyExpoPushError,
  pushChannelFor,
} from "../helpers/push-delivery";

const T1 = "ExponentPushToken[one]";
const T2 = "ExponentPushToken[two]";

/**
 * B1: bilet + makbuz işleme. Eskiden makbuz hiç okunmuyordu; ana yol bilet
 * düzeyindeki `DeviceNotRegistered`'ı da işlemiyordu.
 */
describe("ExpoPushProvider — bilet ve makbuz", () => {
  const makeProvider = (withQueue = true) => {
    const prisma = {
      pushToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ token: T1 }, { token: T2 }]),
      },
      notificationLog: { count: jest.fn().mockResolvedValue(4) },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const provider = new ExpoPushProvider(
      { get: jest.fn().mockReturnValue("") } as never,
      prisma as never,
      (withQueue ? queue : undefined) as never,
    );
    return { provider, prisma, queue };
  };

  const mockFetch = (data: unknown, ok = true) => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => ({ data }),
      text: async () => "err",
    });
    (global as { fetch?: unknown }).fetch = fetchMock;
    return fetchMock;
  };

  afterEach(() => jest.restoreAllMocks());

  it("bilet DeviceNotRegistered → token hemen pasifleşir; başarılı bilet makbuza planlanır", async () => {
    const { provider, prisma, queue } = makeProvider();
    mockFetch([
      { status: "ok", id: "ticket-1" },
      {
        status: "error",
        message: "not registered",
        details: { error: "DeviceNotRegistered" },
      },
    ]);

    const outcome = await provider.sendMessages([
      { to: T1, title: "a", body: "b" },
      { to: T2, title: "a", body: "b" },
    ]);

    expect(outcome).toMatchObject({ sent: 1, failed: 1, deactivated: 1 });
    expect(prisma.pushToken.updateMany).toHaveBeenCalledWith({
      where: { token: { in: [T2] }, isActive: true },
      data: { isActive: false },
    });
    expect(queue.add).toHaveBeenCalledWith(
      PUSH_RECEIPT_JOB,
      { tickets: [{ id: "ticket-1", token: T1 }] },
      expect.objectContaining({ delay: EXPO_RECEIPT_CHECK_DELAY_MS }),
    );
  });

  it("istek süre sınırlıdır (AbortSignal) ve kanal/rozet yüke girer", async () => {
    const { provider } = makeProvider();
    const fetchMock = mockFetch([{ status: "ok", id: "t" }]);

    await provider.sendMessages([
      { to: T1, title: "a", body: "b", channelId: "orders", badge: 2 },
    ]);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeDefined();
    expect(JSON.parse(init.body)[0]).toMatchObject({
      channelId: "orders",
      badge: 2,
    });
  });

  it("HTTP hatasında fırlatır (worker yeniden dener)", async () => {
    const { provider } = makeProvider();
    mockFetch(null, false);

    await expect(
      provider.sendMessages([{ to: T1, title: "a", body: "b" }]),
    ).rejects.toThrow(/Expo Push API error: 500/);
  });

  it("kimlik bilgisi hatası ayrı (error) mesajla loglanır", async () => {
    const { provider } = makeProvider();
    const errorSpy = jest
      .spyOn(
        (provider as unknown as { logger: { error: () => void } }).logger,
        "error",
      )
      .mockImplementation(() => undefined);
    mockFetch([
      {
        status: "error",
        message: "bad creds",
        details: { error: "InvalidCredentials" },
      },
    ]);

    await provider.sendMessages([{ to: T1, title: "a", body: "b" }]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[push-credentials]"),
    );
  });

  it("makbuz DeviceNotRegistered → token pasif; MessageTooBig ayrı alarm", async () => {
    const { provider, prisma } = makeProvider();
    const errorSpy = jest
      .spyOn(
        (provider as unknown as { logger: { error: () => void } }).logger,
        "error",
      )
      .mockImplementation(() => undefined);
    mockFetch({
      r1: { status: "ok" },
      r2: { status: "error", details: { error: "DeviceNotRegistered" } },
      r3: { status: "error", details: { error: "MessageTooBig" } },
    });

    const outcome = await provider.checkReceipts([
      { id: "r1", token: T1 },
      { id: "r2", token: T2 },
      { id: "r3", token: T1 },
    ]);

    expect(outcome).toMatchObject({ checked: 3, ok: 1, failed: 2 });
    expect(prisma.pushToken.updateMany).toHaveBeenCalledWith({
      where: { token: { in: [T2] }, isActive: true },
      data: { isActive: false },
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[push-message-too-big]"),
    );
  });

  it("sendToUser: tüm cihazlara TEK istek, rozet okunmamış zil sayısı", async () => {
    const { provider } = makeProvider();
    const fetchMock = mockFetch([
      { status: "ok", id: "a" },
      { status: "ok", id: "b" },
    ]);

    const results = await provider.sendToUser(
      "u1",
      "t",
      "b",
      { type: "x" },
      {
        channelId: "trades",
        badge: "unread",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ badge: 4, channelId: "trades" });
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("kuyruk yoksa (kısmi kurulum) gönderim yine yapılır", async () => {
    const { provider } = makeProvider(false);
    mockFetch([{ status: "ok", id: "a" }]);

    await expect(
      provider.sendMessages([{ to: T1, title: "a", body: "b" }]),
    ).resolves.toMatchObject({ sent: 1 });
  });
});

describe("push-delivery yardımcıları", () => {
  it.each([
    ["new_message", "messages"],
    ["trade_completed", "trades"],
    ["trade_dispute_opened", "trades"],
    ["payment_received", "orders"],
    ["order_shipped", "orders"],
    ["refund_approved", "orders"],
    ["product_sold", "orders"],
    ["offer_received", "default"],
    ["admin_broadcast", "default"],
    [undefined, "default"],
  ])("%s → %s kanalı", (type, channel) => {
    expect(pushChannelFor(type)).toBe(channel);
  });

  it.each([
    ["DeviceNotRegistered", "device_not_registered"],
    ["InvalidCredentials", "credentials"],
    ["MismatchSenderId", "credentials"],
    ["MessageTooBig", "message_too_big"],
    ["MessageRateExceeded", "rate_limited"],
    ["Whatever", "other"],
  ])("%s → %s", (code, kind) => {
    expect(classifyExpoPushError(code)).toBe(kind);
  });
});
