import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Spinner } from "@tarodan/ui/spinner";
import CheckoutClient from "../../checkout/CheckoutClient";

export const metadata: Metadata = {
  title: "Ödeme | Tarodan",
  description: "Siparişinizi güvenle tamamlayın.",
  robots: { index: false, follow: false },
};

/**
 * Kart alanları bu sayfada toplandığı için CSP burada ZORLAYICI ve script'ler
 * istek başına üretilen nonce'a bağlı. Nonce build anında bilinemez: statik
 * ön-render edilen HTML'in satır içi hidrasyon script'leri nonce'suz kalır ve
 * tarayıcı hepsini bloklar (ödeme sonucu sayfalarında yaşanan beyaz ekranın
 * sebebi buydu). Sepete özel, önbelleğe alınacak içeriği olmayan bir ekran —
 * istek anında render edilmesinin maliyeti yok.
 */
export const dynamic = "force-dynamic";

export default function CartPaymentPage() {
  return (
    <Suspense
      fallback={
        <PageShell className="flex items-center justify-center">
          <Spinner size="lg" />
        </PageShell>
      }
    >
      <CheckoutClient />
    </Suspense>
  );
}
