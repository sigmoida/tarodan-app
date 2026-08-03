/** @format */

import { Suspense } from "react";
import PaymentSuccessClient from "./_components/PaymentSuccessClient";

/**
 * ÖDEME rotasında CSP ZORLAYICI ve script'ler istek başına üretilen nonce'a
 * bağlı (`middleware.ts` → `buildContentSecurityPolicy`). Nonce build anında
 * bilinemeyeceği için statik ön-render edilen HTML'in satır içi hidrasyon
 * script'leri (`self.__next_f.push`) nonce'suz kalır ve tarayıcı hepsini
 * bloklar: sayfa hidrate olmaz, RSC akışı yarıda kesilir ("Connection closed").
 *
 * Bu yüzden sonuç ekranı istek anında render edilir. Kayıp yok: sayfa zaten
 * kişiye özel bir ödeme sonucunu gösteriyor, statik önbelleğe alınacak bir
 * içeriği ve SEO değeri yok.
 */
export const dynamic = "force-dynamic";

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={null}>
      <PaymentSuccessClient />
    </Suspense>
  );
}
