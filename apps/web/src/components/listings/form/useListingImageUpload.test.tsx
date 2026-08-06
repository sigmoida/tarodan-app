// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListingImageUpload } from "./useListingImageUpload";
import type { UploadPort } from "./listing-upload-queue";

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

// React'e test ortamında olduğumuzu bildirir; olmadan her `act` uyarı basıyor.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Hook'u gerçekten çalıştıran asgari koşucu — ek test kütüphanesi olmadan.
 * `setValue` çağrılarının SEÇENEKLERİNİ ölçebilmek şart: kirlilik bayrağı
 * (`shouldDirty`) burada belirleniyor.
 */
function renderHook<T>(useHookFn: () => T) {
  const result = { current: undefined as unknown as T };
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;

  function Probe() {
    result.current = useHookFn();
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(<Probe />);
  });

  return {
    result,
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
  };
}

const fakeFile = (name: string): File => {
  const file = new File(["x"], name, { type: "image/png" });
  Object.defineProperty(file, "lastModified", { value: 1 });
  return file;
};

const existing = (id: string) => ({
  cardKey: `${id}-card`,
  detailKey: `${id}-detail`,
  cardUrl: `https://cdn/${id}.webp`,
});

describe("useListingImageUpload — form kirliliği", () => {
  let setValue: ReturnType<typeof vi.fn>;
  let form: { setValue: typeof setValue };

  const setup = (upload?: UploadPort) => {
    const hook = renderHook(() =>
      useListingImageUpload({
        form: form as never,
        maxImages: 5,
        upload:
          upload ??
          (async () => ({ cardKey: "new-card", detailKey: "new-detail" })),
      }),
    );
    return hook;
  };

  const lastOptions = () => setValue.mock.calls.at(-1)?.[2];
  const dirtyCalls = () =>
    setValue.mock.calls.filter((call) => call[2]?.shouldDirty === true);

  beforeEach(() => {
    setValue = vi.fn();
    form = { setValue };
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:preview"),
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      writable: true,
    });
  });

  afterEach(() => vi.clearAllMocks());

  /**
   * Regresyon: görsel değişiklikleri formu kirletmiyordu. Pencere odağı
   * değişince çalışan refetch, form "temiz" göründüğü için kaydedilmemiş
   * görsel düzenini sessizce eziyordu.
   */
  it("SADECE sıra değiştirildiğinde form dirty olur", () => {
    const { result, unmount } = setup();

    act(() =>
      result.current.seedExistingImages([existing("a"), existing("b")]),
    );
    setValue.mockClear();

    act(() => result.current.moveImage(1, 0));

    expect(lastOptions()).toMatchObject({ shouldDirty: true });
    unmount();
  });

  it("kapak seçme formu dirty yapar", () => {
    const { result, unmount } = setup();
    act(() =>
      result.current.seedExistingImages([existing("a"), existing("b")]),
    );
    setValue.mockClear();

    act(() => result.current.makeCover(1));

    expect(lastOptions()).toMatchObject({ shouldDirty: true });
    unmount();
  });

  it("görsel kaldırma formu dirty yapar", () => {
    const { result, unmount } = setup();
    act(() => result.current.seedExistingImages([existing("a")]));
    const clientId = result.current.items[0].clientId;
    setValue.mockClear();

    act(() => result.current.removeImage(clientId));

    expect(lastOptions()).toMatchObject({ shouldDirty: true });
    unmount();
  });

  it("görsel ekleme formu dirty yapar", () => {
    const { result, unmount } = setup();
    setValue.mockClear();

    act(() => result.current.handleFileUpload([fakeFile("a.png")]));

    expect(dirtyCalls().length).toBeGreaterThan(0);
    unmount();
  });

  /**
   * Regresyon: refetch mevcut görselleri yeniden yerleştiriyor. Bu bir KULLANICI
   * değişikliği değildir; kirletirse "kaydedilmemiş değişiklik" uyarıları ve
   * dirty-guard'lar yanlış tetiklenir.
   */
  it("sunucudan gelen görselleri yerleştirmek formu dirty YAPMAZ", () => {
    const { result, unmount } = setup();

    act(() =>
      result.current.seedExistingImages([existing("a"), existing("b")]),
    );

    expect(setValue).toHaveBeenCalled();
    expect(dirtyCalls()).toHaveLength(0);
    expect(lastOptions()).toMatchObject({ shouldDirty: false });
    unmount();
  });

  it("refetch, kullanıcının kaydedilmemiş sırasını EZMEZ", () => {
    const { result, unmount } = setup();
    act(() =>
      result.current.seedExistingImages([existing("a"), existing("b")]),
    );

    // Kullanıcı sırayı değiştirir.
    act(() => result.current.moveImage(1, 0));
    const reordered = result.current.items.map((i) => i.cardKey);
    expect(reordered).toEqual(["b-card", "a-card"]);

    // Düzenleme formu kayıt dirty ise yeniden doldurmaz; bu kural burada
    // kirlilik bayrağıyla temsil edilir — sıra kullanıcı düzeninde kalır.
    expect(dirtyCalls().length).toBeGreaterThan(0);
    expect(result.current.items.map((i) => i.cardKey)).toEqual(reordered);
    unmount();
  });
});

describe("useListingImageUpload — gönderim engeli", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:preview"),
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      writable: true,
    });
  });

  it("yükleme sürerken engel bildirir", () => {
    const setValue = vi.fn();
    // Hiç çözülmeyen port: kalem 'uploading' durumunda kalır.
    const hanging: UploadPort = () => new Promise(() => {});
    const { result, unmount } = renderHook(() =>
      useListingImageUpload({
        form: { setValue } as never,
        maxImages: 5,
        upload: hanging,
      }),
    );

    expect(result.current.submitBlocker).toBeNull();

    act(() => result.current.handleFileUpload([fakeFile("a.png")]));

    expect(result.current.submitBlocker?.reason).toBe("pending");
    unmount();
  });
});
