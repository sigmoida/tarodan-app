/**
 * URL slugs: the one implementation for catalog slugs (category, collection,
 * brand, manufacturer, car model, attribute value) and listing URLs, shared by
 * the API, web, admin and (vendored) mobile.
 *
 * Listing URL (ADR 0017): `/listings/<slug>-<uuid>`. The UUID is the key and
 * the slug is decoration: every reader takes the trailing UUID and ignores the
 * rest, so a stale slug after a title edit still resolves (web redirects it to
 * the canonical form).
 */

/**
 * Turkish (and circumflex) letters mapped by hand: "ı" and "İ" do not
 * decompose under NFD, so stripping combining marks alone would drop or keep
 * them instead of mapping them to "i"/"I".
 */
const TR_CHAR_MAP: Readonly<Record<string, string>> = {
  ı: "i",
  İ: "I",
  ş: "s",
  Ş: "S",
  ğ: "g",
  Ğ: "G",
  ü: "u",
  Ü: "U",
  ö: "o",
  Ö: "O",
  ç: "c",
  Ç: "C",
  â: "a",
  Â: "A",
  î: "i",
  Î: "I",
  û: "u",
  Û: "U",
};

/**
 * Reduces text to ASCII letters: Turkish letters are mapped ("Kırmızı" ->
 * "Kirmizi"), other accented Latin letters lose their marks ("Citroën" ->
 * "Citroen"). Run text through this before any `[^a-z0-9]` clean-up, which
 * would otherwise drop the letters ("Ölçek" -> "lek").
 */
export function transliterateTurkish(value: string): string {
  return value
    .replace(/[ıİşŞğĞüÜöÖçÇâÂîÎûÛ]/g, (char) => TR_CHAR_MAP[char] ?? char)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Name to URL slug: transliterate, lower-case, every run of characters
 * outside `[a-z0-9]` becomes one hyphen, no leading or trailing hyphen.
 * "Öz Çelik" -> "oz-celik". Returns "" when nothing survives.
 *
 * Catalog slugs are stored and unique, so this body must not change output
 * for existing names: a change would make import and manual entry disagree
 * on the same name.
 */
export function generateSlug(text: string): string {
  return transliterateTurkish(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/** Longest listing slug, in characters (ADR 0017). */
export const LISTING_SLUG_MAX_LENGTH = 80;

/**
 * Slugs a listing never gets: they read as actions next to a listing route
 * (`/listings/new`, `/listings/<id>/edit`), so a listing titled "New" or
 * "Edit" gets a bare-UUID URL instead.
 */
const RESERVED_LISTING_SLUGS: ReadonlySet<string> = new Set(["edit", "new"]);

/**
 * The readable part of a listing URL, derived from the title on every read
 * (never stored, so a title edit cannot leave a stale stored slug).
 *
 * `generateSlug`, then cut to {@link LISTING_SLUG_MAX_LENGTH} at the last
 * word boundary (a single word longer than the limit is cut hard). Returns ""
 * for an empty or reserved result; the URL then carries the UUID only.
 */
export function listingSlug(title: string | null | undefined): string {
  const slug = generateSlug(title ?? "");
  const cut =
    slug.length <= LISTING_SLUG_MAX_LENGTH
      ? slug
      : cutAtWordBoundary(slug, LISTING_SLUG_MAX_LENGTH);
  return RESERVED_LISTING_SLUGS.has(cut) ? "" : cut;
}

/** `slug` holds single hyphens only, so no cut can end on a hyphen. */
function cutAtWordBoundary(slug: string, max: number): string {
  const head = slug.slice(0, max);
  // The character right after the cut is a hyphen: the cut already ends a word.
  if (slug.charAt(max) === "-") return head;
  const lastHyphen = head.lastIndexOf("-");
  return lastHyphen > 0 ? head.slice(0, lastHyphen) : head;
}

/** What a listing URL needs: the id and, when known, the title. */
export interface ListingUrlSource {
  id: string;
  title?: string | null;
}

/**
 * The `[id]` segment of a listing URL: `<slug>-<uuid>`, or the bare UUID when
 * the title yields no slug. `ferrari-f40-1-18-bburago-kirmizi-0b1e...c9`.
 */
export function listingPathSegment(listing: ListingUrlSource): string {
  const slug = listingSlug(listing.title);
  return slug ? `${slug}-${listing.id}` : listing.id;
}

/** Locale-less path of a listing page: `/listings/<slug>-<uuid>`. */
export function listingPath(listing: ListingUrlSource): string {
  return `/listings/${listingPathSegment(listing)}`;
}

/**
 * Any UUID version, case-insensitive: the same rule as the API's
 * `ParseUUIDPipe` without a version (seeded ids are not always v4).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_LENGTH = 36;

/**
 * The listing id inside a URL segment: a bare UUID, or the trailing UUID of
 * `<anything>-<uuid>` (the prefix is ignored, so an old or edited slug still
 * resolves). Returns null for anything else; callers answer that as an
 * invalid id. The UUID is returned as written.
 */
export function parseListingParam(
  param: string | null | undefined,
): string | null {
  if (typeof param !== "string") return null;
  if (UUID_RE.test(param)) return param;
  // `<prefix>-<uuid>`: at least one prefix character, then the separator.
  const separator = param.length - UUID_LENGTH - 1;
  if (separator < 1 || param.charAt(separator) !== "-") return null;
  const id = param.slice(separator + 1);
  return UUID_RE.test(id) ? id : null;
}
