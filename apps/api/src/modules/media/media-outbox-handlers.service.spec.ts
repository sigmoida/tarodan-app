import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import { OUTBOX_MEDIA_AVATAR_DELETE } from "../outbox/outbox.types";
import { MediaOutboxHandlers } from "./media-outbox-handlers.service";
import {
  avatarStorageKey,
  enqueueAvatarDeletion,
} from "./helpers/avatar-deletion";

/**
 * Hesap silmede avatar (KVKK): silme transaction'ı yalnız işi outbox'a yazar,
 * depolama çağrısı commit sonrası bu handler'dadır.
 */
describe("MediaOutboxHandlers — avatar silme", () => {
  const makeHandler = () => {
    const registry = new OutboxHandlerRegistry();
    const storage = { deleteFile: jest.fn().mockResolvedValue(undefined) };
    new MediaOutboxHandlers(registry, storage as never).onModuleInit();
    const handler = registry.get(OUTBOX_MEDIA_AVATAR_DELETE)!;
    return { handler, storage };
  };

  it("avatar nesnesini avatars kökünden siler", async () => {
    const { handler, storage } = makeHandler();

    await handler({ key: "dev/avatars/abc.jpg" }, {} as never);

    expect(storage.deleteFile).toHaveBeenCalledWith(
      "avatars",
      "dev/avatars/abc.jpg",
    );
  });

  it("depolama anahtarı olmayan yükü no-op geçer", async () => {
    const { handler, storage } = makeHandler();

    await handler({ key: "https://lh3.googleusercontent.com/a" }, {} as never);
    await handler({ key: "" }, {} as never);

    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});

describe("enqueueAvatarDeletion", () => {
  const tx = {} as never;

  it("depolama anahtarını dedupe anahtarıyla kuyruğa yazar", async () => {
    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };

    await expect(
      enqueueAvatarDeletion(outbox, tx, "dev/avatars/abc.jpg"),
    ).resolves.toBe(true);
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, {
      type: OUTBOX_MEDIA_AVATAR_DELETE,
      payload: { key: "dev/avatars/abc.jpg" },
      dedupeKey: "media.avatar_delete:dev/avatars/abc.jpg",
    });
  });

  it.each([null, "", "https://lh3.googleusercontent.com/a"])(
    "silinecek nesne yoksa (%p) yazmaz",
    async (avatarUrl) => {
      const outbox = { enqueue: jest.fn() };

      await expect(enqueueAvatarDeletion(outbox, tx, avatarUrl)).resolves.toBe(
        false,
      );
      expect(outbox.enqueue).not.toHaveBeenCalled();
    },
  );

  it("sosyal girişten gelen tam URL bizim nesnemiz değildir", () => {
    expect(avatarStorageKey("http://example.com/a.png")).toBeNull();
    expect(avatarStorageKey(" dev/avatars/a.png ")).toBe("dev/avatars/a.png");
  });
});
