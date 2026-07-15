/** @format */

import ProductUnavailableClient from "./_components/ProductUnavailableClient";

/**
 * Shown when a product can no longer be bought (sold out / removed) — reached
 * from the listing detail and from checkout stockouts. Nudges back to the live
 * listing if it's actually restocked, else offers same-category alternatives.
 */
export default function ProductUnavailablePage() {
  return <ProductUnavailableClient />;
}
