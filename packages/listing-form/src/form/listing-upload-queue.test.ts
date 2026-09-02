/** @format */

import { describe, expect, it, vi } from "vitest";
import {
  createUploadQueue,
  uploadErrorMessage,
  type QueueEvent,
  type UploadPort,
} from "./listing-upload-queue";

const fakeFile = (name: string): File => ({ name }) as unknown as File;

const item = (id: string) => ({ clientId: id, file: fakeFile(`${id}.jpg`) });

/** Çözümü/ret'i testin elinde tutan port. */
function deferredPort() {
  const calls = new Map<
    string,
    {
      resolve: (r: { cardKey: string; detailKey: string }) => void;
      reject: (e: unknown) => void;
      onProgress: (p: number) => void;
      signal: AbortSignal;
    }
  >();

  const upload: UploadPort = (file, options) =>
    new Promise((resolve, reject) => {
      calls.set(file.name, { resolve, reject, ...options });
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  return { upload, calls };
}

const collect = () => {
  const events: QueueEvent[] = [];
  return { events, onEvent: (e: QueueEvent) => events.push(e) };
};

const statusesFor = (events: QueueEvent[], clientId: string) =>
  events.filter((e) => e.clientId === clientId).map((e) => e.status);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("yükleme kuyruğu", () => {
  it("eşzamanlı istek sayısını sınırlar", async () => {
    const { upload, calls } = deferredPort();
    const queue = createUploadQueue({
      upload,
      onEvent: collect().onEvent,
      concurrency: 3,
    });

    queue.enqueue([item("a"), item("b"), item("c"), item("d"), item("e")]);
    await flush();

    expect(queue.activeCount()).toBe(3);
    expect(calls.has("d.jpg")).toBe(false);

    calls.get("a.jpg")!.resolve({ cardKey: "a-c", detailKey: "a-d" });
    await flush();

    // Slot boşalınca sıradaki başlar.
    expect(calls.has("d.jpg")).toBe(true);
    expect(queue.activeCount()).toBe(3);
  });

  /**
   * Regresyon: bütün dosyalar tek istekle gidiyordu, bir dosyanın hatası
   * partinin tamamını düşürüyordu.
   */
  it("bir dosyanın hatası diğerlerini düşürmez", async () => {
    const { upload, calls } = deferredPort();
    const { events, onEvent } = collect();
    const queue = createUploadQueue({ upload, onEvent, concurrency: 3 });

    queue.enqueue([item("a"), item("b")]);
    await flush();

    calls
      .get("a.jpg")!
      .reject({ response: { data: { message: "çok büyük" } } });
    calls.get("b.jpg")!.resolve({ cardKey: "b-c", detailKey: "b-d" });
    await flush();

    expect(statusesFor(events, "a")).toContain("failed");
    expect(statusesFor(events, "b")).toContain("uploaded");
    expect(
      events.find((e) => e.clientId === "a" && e.status === "failed")?.error,
    ).toBe("çok büyük");
    expect(
      events.find((e) => e.clientId === "b" && e.status === "uploaded")?.result,
    ).toEqual({ cardKey: "b-c", detailKey: "b-d" });
  });

  it("hata alan dosya kuyruğu durdurmaz, sıradaki başlar", async () => {
    const { upload, calls } = deferredPort();
    const queue = createUploadQueue({
      upload,
      onEvent: collect().onEvent,
      concurrency: 1,
    });

    queue.enqueue([item("a"), item("b")]);
    await flush();
    expect(calls.has("b.jpg")).toBe(false);

    calls.get("a.jpg")!.reject(new Error("boom"));
    await flush();

    expect(calls.has("b.jpg")).toBe(true);
  });

  describe("ilerleme", () => {
    it("bayt aktarımını yüzdeyle bildirir", async () => {
      const { upload, calls } = deferredPort();
      const { events, onEvent } = collect();
      const queue = createUploadQueue({ upload, onEvent, concurrency: 1 });

      queue.enqueue([item("a")]);
      await flush();
      calls.get("a.jpg")!.onProgress(42);

      expect(
        events.filter((e) => e.status === "uploading" && e.progress === 42),
      ).toHaveLength(1);
    });

    /**
     * %100 bayt aktarımı "hazır" DEĞİLDİR: sunucuda moderasyon, Sharp dönüşümü
     * ve depolama yüklemesi sürüyor. Sahte bir sunucu yüzdesi göstermek yerine
     * ayrı bir "işleniyor" durumu bildirilir.
     */
    it("baytlar bitince 'işleniyor'a geçer, 'yüklendi'ye değil", async () => {
      const { upload, calls } = deferredPort();
      const { events, onEvent } = collect();
      const queue = createUploadQueue({ upload, onEvent, concurrency: 1 });

      queue.enqueue([item("a")]);
      await flush();
      calls.get("a.jpg")!.onProgress(100);

      expect(statusesFor(events, "a")).toContain("processing");
      expect(statusesFor(events, "a")).not.toContain("uploaded");

      calls.get("a.jpg")!.resolve({ cardKey: "c", detailKey: "d" });
      await flush();
      expect(statusesFor(events, "a")).toContain("uploaded");
    });

    it("yüzde 99'u aşamaz (yanıt gelmeden 'hazır' görünmesin)", async () => {
      const { upload, calls } = deferredPort();
      const { events, onEvent } = collect();
      const queue = createUploadQueue({ upload, onEvent, concurrency: 1 });

      queue.enqueue([item("a")]);
      await flush();
      calls.get("a.jpg")!.onProgress(99.7);

      const uploading = events.filter((e) => e.status === "uploading");
      expect(uploading[uploading.length - 1].progress).toBe(99);
    });
  });

  describe("iptal", () => {
    it("aktif isteği durdurur ve hata olayı üretmez", async () => {
      const { upload, calls } = deferredPort();
      const { events, onEvent } = collect();
      const queue = createUploadQueue({ upload, onEvent, concurrency: 1 });

      queue.enqueue([item("a")]);
      await flush();
      queue.cancel("a");
      await flush();

      expect(calls.get("a.jpg")!.signal.aborted).toBe(true);
      expect(statusesFor(events, "a")).not.toContain("failed");
    });

    it("henüz başlamamış kalemi kuyruktan çıkarır", async () => {
      const { upload, calls } = deferredPort();
      const queue = createUploadQueue({
        upload,
        onEvent: collect().onEvent,
        concurrency: 1,
      });

      queue.enqueue([item("a"), item("b")]);
      await flush();
      queue.cancel("b");
      calls.get("a.jpg")!.resolve({ cardKey: "c", detailKey: "d" });
      await flush();

      expect(calls.has("b.jpg")).toBe(false);
    });

    it("iptal sonrası geç gelen hata bastırılır", async () => {
      const { upload, calls } = deferredPort();
      const { events, onEvent } = collect();
      const queue = createUploadQueue({ upload, onEvent, concurrency: 1 });

      queue.enqueue([item("a")]);
      await flush();
      queue.cancel("a");
      calls.get("a.jpg")!.reject(new Error("geç hata"));
      await flush();

      expect(statusesFor(events, "a")).not.toContain("failed");
    });

    it("cancelAll bekleyen ve aktif her şeyi durdurur", async () => {
      const { upload, calls } = deferredPort();
      const queue = createUploadQueue({
        upload,
        onEvent: collect().onEvent,
        concurrency: 1,
      });

      queue.enqueue([item("a"), item("b")]);
      await flush();
      queue.cancelAll();
      await flush();

      expect(calls.get("a.jpg")!.signal.aborted).toBe(true);
      expect(calls.has("b.jpg")).toBe(false);
    });
  });

  it("tekrar denenen kalem yeniden kuyruğa girer", async () => {
    const { upload, calls } = deferredPort();
    const { events, onEvent } = collect();
    const queue = createUploadQueue({ upload, onEvent, concurrency: 1 });

    queue.enqueue([item("a")]);
    await flush();
    calls.get("a.jpg")!.reject(new Error("boom"));
    await flush();
    expect(statusesFor(events, "a")).toContain("failed");

    calls.delete("a.jpg");
    queue.enqueue([item("a")]);
    await flush();
    calls.get("a.jpg")!.resolve({ cardKey: "c", detailKey: "d" });
    await flush();

    expect(statusesFor(events, "a")).toContain("uploaded");
  });

  it("port çağrısı iptal sinyali ve ilerleme geri çağrısı alır", async () => {
    const upload = vi.fn().mockResolvedValue({ cardKey: "c", detailKey: "d" });
    const queue = createUploadQueue({
      upload,
      onEvent: collect().onEvent,
      concurrency: 1,
    });

    queue.enqueue([item("a")]);
    await flush();

    expect(upload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    );
  });
});

describe("yükleme hata mesajı", () => {
  it("sunucu mesajını tercih eder", () => {
    expect(
      uploadErrorMessage({ response: { data: { message: "Dosya bozuk" } } }),
    ).toBe("Dosya bozuk");
  });

  it("dizi biçimli doğrulama mesajının ilkini alır", () => {
    expect(
      uploadErrorMessage({
        response: { data: { message: ["ilk", "ikinci"] } },
      }),
    ).toBe("ilk");
  });

  it("mesaj yoksa null döner — genel metni gösterim tarafı katalogdan okur", () => {
    expect(uploadErrorMessage(new Error("network"))).toBeNull();
  });
});
