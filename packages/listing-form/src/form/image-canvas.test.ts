/** @format */

import { describe, expect, it } from "vitest";
import { isAbortError } from "./abort";
import {
  DOWNSCALABLE_TYPES,
  normalizeImageType,
  ROTATABLE_TYPES,
  runExclusive,
} from "./image-canvas";

/**
 * Canvas tesisatının KARAR kısmı: tür sözlüğü ve tek-seferde-bir-dosya sırası.
 * Çizim tarayıcı tesisatıdır (jsdom'da canvas yok); küçültme ve çevirme
 * testleri onu `CanvasDeps` ile değiştirir.
 */

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Elle bırakılan iş — sırayı testin elinde tutar. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

describe("normalizeImageType", () => {
  // `canvas.toBlob` "image/jpg" bilmez; tanımadığı türde sessizce PNG'ye düşer
  // ve dosya adı ile içeriği ayrışırdı.
  it("image/jpg → image/jpeg", () =>
    expect(normalizeImageType("image/jpg")).toBe("image/jpeg"));

  it("büyük harfi küçültür", () =>
    expect(normalizeImageType("IMAGE/JPG")).toBe("image/jpeg"));

  it("diğer türleri korur", () => {
    expect(normalizeImageType("image/png")).toBe("image/png");
    expect(normalizeImageType("image/webp")).toBe("image/webp");
  });
});

describe("tür listeleri", () => {
  // Listeler normalize edilmiş türleri tutar; "image/jpg" ayrıca yazılmaz.
  it("yalnız normalize edilmiş türler içerir", () => {
    for (const type of [...DOWNSCALABLE_TYPES, ...ROTATABLE_TYPES]) {
      expect(normalizeImageType(type)).toBe(type);
    }
  });

  it("küçültme yalnız JPEG; çevirme GIF hariç", () => {
    expect(DOWNSCALABLE_TYPES).toEqual(["image/jpeg"]);
    expect(ROTATABLE_TYPES).not.toContain("image/gif");
  });
});

describe("runExclusive", () => {
  it("işleri sırayla çalıştırır", async () => {
    const order: string[] = [];
    const first = gate();

    const a = runExclusive(async () => {
      order.push("a:start");
      await first.opened;
      order.push("a:end");
    });
    const b = runExclusive(async () => {
      order.push("b");
    });

    await tick();
    expect(order).toEqual(["a:start"]);

    first.open();
    await Promise.all([a, b]);
    expect(order).toEqual(["a:start", "a:end", "b"]);
  });

  it("sırada beklerken iptal edilen iş HEMEN bırakılır ve hiç çalışmaz", async () => {
    const first = gate();
    const blocker = runExclusive(() => first.opened);
    const controller = new AbortController();
    let ran = false;

    const waiting = runExclusive(async () => {
      ran = true;
    }, controller.signal);
    controller.abort();

    // Çağıran, öndeki iş bitmeden serbest kalır (kuyruk slotu boşalır).
    const error = await waiting.catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);

    first.open();
    await blocker;
    await tick();
    // Sırası geldiğinde de başlamaz: boşuna decode yok.
    expect(ran).toBe(false);
  });

  it("baştan iptal edilmiş sinyalle iş başlamaz", async () => {
    const controller = new AbortController();
    controller.abort();
    let ran = false;

    const error = await runExclusive(async () => {
      ran = true;
    }, controller.signal).catch((e: unknown) => e);

    expect(isAbortError(error)).toBe(true);
    await tick();
    expect(ran).toBe(false);
  });

  it("iptal edilen iş sıradakini engellemez", async () => {
    const controller = new AbortController();
    controller.abort();
    void runExclusive(async () => undefined, controller.signal).catch(
      () => undefined,
    );

    await expect(runExclusive(async () => "sonraki")).resolves.toBe("sonraki");
  });
});
