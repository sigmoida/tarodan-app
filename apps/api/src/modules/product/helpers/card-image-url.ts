import type { StorageService } from "../../storage/storage.service";

/**
 * Public URL of a listing's card-size image key, or null when there is none.
 *
 * `getPublicAssetUrl` returns "" when the public storage root is not
 * configured; that is folded into null so the payload keeps its
 * `string | null` contract and clients fall back to their placeholder.
 */
export function cardImageUrl(
  storage: Pick<StorageService, "getPublicAssetUrl">,
  cardKey: string | null | undefined,
): string | null {
  return cardKey ? storage.getPublicAssetUrl(cardKey) || null : null;
}
