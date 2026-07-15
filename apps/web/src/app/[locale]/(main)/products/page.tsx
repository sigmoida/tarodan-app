/** @format */

import { redirect } from "next/navigation";

/** No bare /products index — the marketplace listing lives at /listings. */
export default function ProductsIndexPage() {
  redirect("/listings");
}
