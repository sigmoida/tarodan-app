/**
 * Rules of the `GET /products` search filters that the API and both clients
 * must agree on. Mobile vendors this file into `src/types/`.
 */

/**
 * The highest price bound (TL) of a product search. `GET /products` answers a
 * larger `maxPrice` with a 400 (and so does `POST /saved-searches`, which picks
 * the same DTO rules); `minPrice` has no API cap, so released clients that
 * send a larger one keep getting an empty list instead of a new 400. Web
 * `/listings` and mobile `/search` keep both bounds within this value: a larger
 * typed bound shows a field error and is not sent, and a larger URL or
 * saved-search value is read as no bound, so a search never fails on it.
 *
 * A search bound, not a money rule: it is unrelated to the listing price
 * limits (platform settings) and to `TL_NEGOTIATED_AMOUNT_MAX` (API).
 */
export const SEARCH_PRICE_MAX = 9_999_999;
