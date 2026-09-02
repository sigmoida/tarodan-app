import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { i18nMessage } from "../i18n";

/**
 * Spec'ler için UserBlockService taklidi: `isBlockedEither`/`getHiddenUserIds`
 * jest.fn olarak ayarlanabilir; `assertNotBlocked`/`assertVisibleTo` gerçek
 * servisle aynı kuralı bu iki fonksiyondan türetir (403 / 404).
 */
export function userBlockServiceStub(
  opts: { blockedEither?: boolean; hidden?: string[] } = {},
) {
  const stub = {
    isBlockedEither: jest.fn().mockResolvedValue(opts.blockedEither ?? false),
    getHiddenUserIds: jest.fn().mockResolvedValue(opts.hidden ?? []),
    hasBlocked: jest.fn().mockResolvedValue(false),
    assertNotBlocked: jest.fn(
      async (a: string, b: string, key = "server.user.interactionBlocked") => {
        if (await stub.isBlockedEither(a, b)) {
          throw new ForbiddenException(i18nMessage(key as any));
        }
      },
    ),
    assertVisibleTo: jest.fn(
      async (viewer: string | undefined | null, owner: string, key: string) => {
        if (!viewer || viewer === owner) return;
        if (await stub.isBlockedEither(viewer, owner)) {
          throw new NotFoundException(i18nMessage(key as any));
        }
      },
    ),
  };
  return stub;
}
