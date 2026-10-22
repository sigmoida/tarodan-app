/**
 * Rules of the `GET /products` search filters that the API and both clients
 * must agree on. Mobile vendors this file into `src/types/`.
 */

/**
 * The highest `minPrice` and `maxPrice` (TL) `GET /products` accepts; a larger
 * value is a 400. Web `/listings` and mobile `/search` show a field error for a
 * larger typed bound and do not send it, and read a larger URL or saved-search
 * value as no bound, so a search never fails on it. Saved searches pick their
 * validation from the same DTO, so `POST /saved-searches` refuses it too.
 *
 * A search bound, not a money rule: it is unrelated to the listing price
 * limits (platform settings) and to `TL_NEGOTIATED_AMOUNT_MAX` (API).
 */
export const SEARCH_PRICE_MAX = 9_999_999;
