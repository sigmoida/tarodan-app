"use client";

import { use } from "react";
import { ListingFormApiProvider } from "@tarodan/listing-form";
import { createAdminListingFormApi } from "@/components/listings/listing-form-api";
import ProductEditClient from "./_components/ProductEditClient";

/**
 * Yönetici ilan düzenleme ekranı.
 *
 * Vitrindeki satıcı formunun AYNISI: aynı kartlar, aynı şema, aynı görsel
 * kuyruğu (`@tarodan/listing-form`). Ayrışan tek şey portun nereye gittiğidir
 * — o yüzden burada yalnız sağlayıcı kuruluyor.
 *
 * Sağlayıcı formun ÜSTÜNDE: kartlar ve `useListingImageUpload` portu bileşen
 * gövdesinde okur.
 */
export default function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <ListingFormApiProvider api={createAdminListingFormApi(id)}>
      <ProductEditClient id={id} />
    </ListingFormApiProvider>
  );
}
