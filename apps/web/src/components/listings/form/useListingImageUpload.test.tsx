// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { useListingImageUpload } from "./useListingImageUpload";
import type { UploadPort } from "./listing-upload-queue";

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

// Hook mesajları katalogdan okur; testin konusu yükleme davranışı, metin değil.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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

/**
 * GERÇEK react-hook-form ile.
 *
 * Regresyon: `setValue(..., { shouldDirty: true })` RHF'te "zorla kirlet"
 * demek DEĞİLDİR — yeni değer varsayılanla karşılaştırılır. Bekleyen bir
 * yükleme sırasında forma yalnız `uploaded` kalemler yazıldığı için `images`
 * değişmez ve `isDirty` FALSE kalır. Sahte bir `setValue` ile bu görülemezdi:
 * önceki test yalnız çağrıya `shouldDirty: true` geçildiğini doğruluyordu.
 */
describe("useListingImageUpload — gerçek form ile kirlilik", () => {
  const seeded = [existing("a"), existing("b")];

  const setup = (upload?: UploadPort) =>
    renderHook(() => {
      const form = useForm({
        defaultValues: {
          images: seeded.map((image) => ({
            cardKey: image.cardKey,
            detailKey: image.detailKey,
          })),
        },
      });
      const images = useListingImageUpload({
        form: form as never,
        maxImages: 5,
        upload: upload ?? (() => new Promise(() => {})),
      });
      // RHF `formState`i Proxy ile abone eder: RENDER sırasında okunmayan alan
      // yeniden hesaplanmaz. Gerçek bileşen de böyle okur.
      const { isDirty } = form.formState;
      return { form, images, isDirty };
    });

  it("bekleyen yüklemede isDirty FALSE kalır — guard bu yüzden ayrı tutulur", () => {
    const { result, unmount } = setup();
    act(() => result.current.images.seedExistingImages(seeded));

    act(() => result.current.images.handleFileUpload([fakeFile("yeni.png")]));

    // Kanıt: form değeri değişmedi (yükleme bitmedi), dolayısıyla isDirty yok.
    expect(result.current.form.getValues("images")).toHaveLength(2);
    expect(result.current.isDirty).toBe(false);
    // Ama kullanıcı düzenlemesi bayrağı DOĞRU: refetch koruması bunu görür.
    expect(result.current.images.hasUserImageEdits).toBe(true);
    unmount();
  });

  it("yükleme tamamlanınca form da kirlenir", async () => {
    const { result, unmount } = setup(async () => ({
      cardKey: "c-card",
      detailKey: "c-detail",
    }));
    act(() => result.current.images.seedExistingImages(seeded));

    await act(async () => {
      result.current.images.handleFileUpload([fakeFile("yeni.png")]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.form.getValues("images")).toHaveLength(3);
    expect(result.current.isDirty).toBe(true);
    unmount();
  });

  it("ilk seed kullanıcı düzenlemesi sayılmaz", () => {
    const { result, unmount } = setup();

    act(() => result.current.images.seedExistingImages(seeded));

    expect(result.current.images.hasUserImageEdits).toBe(false);
    expect(result.current.isDirty).toBe(false);
    unmount();
  });

  it("yalnız sıra değiştirmek bayrağı kaldırır", () => {
    const { result, unmount } = setup();
    act(() => result.current.images.seedExistingImages(seeded));

    act(() => result.current.images.moveImage(1, 0));

    expect(result.current.images.hasUserImageEdits).toBe(true);
    unmount();
  });

  describe("refetch koruması", () => {
    /**
     * Asıl senaryo: dosya seçicisinden pencereye dönmek React Query'nin focus
     * refetch'ini tetikler; ikinci seed yüklenmekte olan görseli ezerse
     * kullanıcı onu ekranda kaybeder ve nesne depoda sahipsiz kalır.
     */
    it("ikinci seed BEKLEYEN görseli EZMEZ", () => {
      const { result, unmount } = setup();
      act(() => result.current.images.seedExistingImages(seeded));
      act(() => result.current.images.handleFileUpload([fakeFile("yeni.png")]));

      const before = result.current.images.items.map((i) => i.clientId);
      expect(before).toHaveLength(3);

      // Focus refetch → sunucu yine iki görsel döndürür.
      act(() => result.current.images.seedExistingImages(seeded));

      expect(result.current.images.items.map((i) => i.clientId)).toEqual(
        before,
      );
      unmount();
    });

    it("ikinci seed kullanıcının SIRASINI da ezmez", () => {
      const { result, unmount } = setup();
      act(() => result.current.images.seedExistingImages(seeded));
      act(() => result.current.images.moveImage(1, 0));
      const reordered = result.current.images.items.map((i) => i.cardKey);

      act(() => result.current.images.seedExistingImages(seeded));

      expect(result.current.images.items.map((i) => i.cardKey)).toEqual(
        reordered,
      );
      unmount();
    });

    /**
     * Regresyon: bayrak oturum boyunca kalıcıydı. Bu segmentte ilandan ilana
     * geçerken bileşen unmount OLMAYABİLİR; A ilanında görsel düzenleyen
     * kullanıcı B ilanına geçtiğinde seed reddediliyor ve B formunda A'nın
     * görselleri kalıyordu.
     */
    it("BAŞKA ilana geçince liste zorunlu olarak yenilenir", () => {
      const { result, unmount } = setup();
      act(() => result.current.images.seedExistingImages(seeded, "listing-a"));
      act(() => result.current.images.moveImage(1, 0));
      expect(result.current.images.hasUserImageEdits).toBe(true);

      act(() =>
        result.current.images.seedExistingImages([existing("z")], "listing-b"),
      );

      // Ekranda YALNIZ B'nin görselleri.
      expect(result.current.images.items.map((i) => i.cardKey)).toEqual([
        "z-card",
      ]);
      // Ve düzenleme bayrağı yeni kayıt için sıfırlanır.
      expect(result.current.images.hasUserImageEdits).toBe(false);
      unmount();
    });

    it("başka ilana geçerken bekleyen yükleme iptal edilir ve taşınmaz", () => {
      const { result, unmount } = setup();
      act(() => result.current.images.seedExistingImages(seeded, "listing-a"));
      act(() => result.current.images.handleFileUpload([fakeFile("a.png")]));
      expect(result.current.images.items).toHaveLength(3);
      expect(result.current.images.submitBlocker?.reason).toBe("pending");

      act(() =>
        result.current.images.seedExistingImages([existing("z")], "listing-b"),
      );

      // A'nın yüklemesi B'nin listesine düşmemeli ve gönderimi kilitlememeli.
      expect(result.current.images.items.map((i) => i.cardKey)).toEqual([
        "z-card",
      ]);
      expect(result.current.images.submitBlocker).toBeNull();
      unmount();
    });

    it("aynı ilan kimliğiyle yapılan refetch yine ezmez", () => {
      const { result, unmount } = setup();
      act(() => result.current.images.seedExistingImages(seeded, "listing-a"));
      act(() => result.current.images.moveImage(1, 0));
      const reordered = result.current.images.items.map((i) => i.cardKey);

      act(() => result.current.images.seedExistingImages(seeded, "listing-a"));

      expect(result.current.images.items.map((i) => i.cardKey)).toEqual(
        reordered,
      );
      unmount();
    });

    it("kullanıcı dokunmadıysa seed normal çalışır (ilk doldurma bozulmasın)", () => {
      const { result, unmount } = setup();

      act(() => result.current.images.seedExistingImages(seeded));
      act(() => result.current.images.seedExistingImages([existing("z")]));

      expect(result.current.images.items.map((i) => i.cardKey)).toEqual([
        "z-card",
      ]);
      unmount();
    });
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
