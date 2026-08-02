import { describe, it, expect, vi, afterEach } from "vitest";
import { ConsoleSink } from "./console-sink";
import type { LogEntry } from "./types";

/**
 * Konsol çıktısı iki kitleye hizmet eder ve ikisi aynı anda memnun edilemez:
 * makine (log toplayıcı → satır başına saf JSON) ve insan (konteyner loglarını
 * gözle tarayan operatör). Bugün toplayıcı yok, tek okuyucu insan — bu yüzden
 * biçim `NODE_ENV`'e değil kendi anahtarına (LOG_FORMAT) bağlıdır ve varsayılan
 * okunur biçimdir. Toplayıcı eklendiği gün tek env ile JSON'a dönülür.
 */
describe("ConsoleSink", () => {
  afterEach(() => vi.restoreAllMocks());

  const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
    level: "info",
    message: "sipariş oluşturuldu",
    name: "api:OrderService",
    timestamp: Date.UTC(2026, 7, 2, 10, 5, 3),
    ...over,
  });

  it("json biçiminde satır başına saf JSON yazar (parse edilebilir)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new ConsoleSink({ format: "json" }).log(entry({ context: { a: 1 } }));

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(() => JSON.parse(line)).not.toThrow();
    expect(JSON.parse(line)).toMatchObject({
      level: "info",
      name: "api:OrderService",
      context: { a: 1 },
    });
  });

  it("pretty biçimi tek satırda saat + seviye + bağlam adı + mesaj verir", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new ConsoleSink({ format: "pretty" }).log(entry());

    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain("INFO");
    expect(line).toContain("[api:OrderService]");
    expect(line).toContain("sipariş oluşturuldu");
    // Saat damgası HH:MM:SS — gözle taramada olayları sıralamak için.
    expect(line).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("pretty biçimde bağlam yalnız doluysa eklenir", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const sink = new ConsoleSink({ format: "pretty" });

    sink.log(entry({ context: {} }));
    expect(spy.mock.calls[0].length).toBe(1);

    sink.log(entry({ context: { orderId: "ord_1" } }));
    expect(spy.mock.calls[1][1]).toEqual({ orderId: "ord_1" });
  });

  it("pretty biçim requestId'yi satıra KISA gömer, obje olarak basmaz", () => {
    // Korelasyon kimliği neredeyse her istek satırında var; 36 karakterlik
    // uuid'li bir obje eki her satırı kirletir ve okunurluk hedefini bozar.
    // Kısa önek yeterli: grep tam kimlikle JSON kipinde/DB'de yapılır,
    // gözle takipte ilk 8 karakter satırları ayırt etmeye yeter.
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new ConsoleSink({ format: "pretty" }).log(
      entry({
        context: { requestId: "a3f9c1b2-4d5e-6789-abcd-ef0123456789" },
      }),
    );

    const call = spy.mock.calls[0];
    expect(call[0]).toContain("req=a3f9c1b2");
    expect(call.length).toBe(1); // geriye kalan bağlam boş → obje basılmaz
  });

  it("pretty biçimde requestId dışındaki bağlam obje olarak kalır", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new ConsoleSink({ format: "pretty" }).log(
      entry({ context: { requestId: "a3f9c1b2-ffff", orderId: "ord_1" } }),
    );

    expect(spy.mock.calls[0][0]).toContain("req=a3f9c1b2");
    expect(spy.mock.calls[0][1]).toEqual({ orderId: "ord_1" });
  });

  it("json biçimi requestId'yi TAM haliyle context'te tutar", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new ConsoleSink({ format: "json" }).log(
      entry({ context: { requestId: "a3f9c1b2-4d5e-6789-abcd-ef0123456789" } }),
    );

    expect(JSON.parse(spy.mock.calls[0][0] as string).context.requestId).toBe(
      "a3f9c1b2-4d5e-6789-abcd-ef0123456789",
    );
  });

  it("seviyeye göre doğru konsol kanalını kullanır (error → stderr)", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const sink = new ConsoleSink({ format: "pretty" });

    sink.log(entry({ level: "error" }));
    sink.log(entry({ level: "warn" }));
    sink.log(entry({ level: "debug" }));

    expect(err).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("varsayılan biçim okunur olandır (seçenek verilmezse)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new ConsoleSink().log(entry());

    const line = spy.mock.calls[0][0] as string;
    expect(() => JSON.parse(line)).toThrow();
    expect(line).toContain("[api:OrderService]");
  });

  it("eski `json: true` seçeneği çalışmayı sürdürür (geri uyumluluk)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new ConsoleSink({ json: true }).log(entry());

    expect(() => JSON.parse(spy.mock.calls[0][0] as string)).not.toThrow();
  });
});
