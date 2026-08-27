/** @format */

"use client";

import type { ReactNode } from "react";
import { ListingFormApiProvider } from "@tarodan/listing-form";
import { webListingFormApi } from "./listing-form-api";

/**
 * İlan formunu vitrinin API portuna bağlar.
 *
 * Sağlayıcı formun ÜSTÜNDE durmak zorunda: kartlar ve `useListingImageUpload`
 * portu bileşen gövdesinde okur, kendi `return`'ünde sarmalamak geç kalırdı.
 * Port fonksiyon taşıdığı için sunucu bileşeninden prop olarak geçirilemez —
 * bu yüzden ayrı bir istemci sarmalayıcı.
 */
export default function ListingFormProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ListingFormApiProvider api={webListingFormApi}>
      {children}
    </ListingFormApiProvider>
  );
}
