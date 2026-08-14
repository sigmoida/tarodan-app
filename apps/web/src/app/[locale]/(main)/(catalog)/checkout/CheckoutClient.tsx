/** @format */

"use client";

import { Spinner } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { Container } from "@/components/layout/Container";
import { CheckoutProvider, useCheckout } from "./_context/CheckoutContext";
import OrderItemsCard from "./_sections/OrderItemsCard";
import AddressStep from "./_sections/AddressStep";
import PaymentSection from "./_sections/PaymentSection";
import OrderSummarySidebar from "./_sections/OrderSummarySidebar";
import GuestOtpModal from "./_modals/GuestOtpModal";

/**
 * Ödeme ekranı — TEK sayfa: ürünler, teslimat adresi ve kart bilgileri alt
 * alta; özet, sözleşme onayı ve "Ödeme Yap" sağdaki sabit sütunda.
 *
 * Eskiden adres ve onay iki adımlı bir stepper'dı, kart bilgisi ise ayrı bir
 * rotadaydı (/payment/[id]): alıcı tek bir alışverişi tamamlamak için üç ekran
 * geziyordu. Artık sipariş, kart alanları doğrulandıktan sonra tek akışta
 * oluşuyor. /payment/[id] duruyor — yarım kalmış bir ödemeye dönüş yolu o.
 */
function CheckoutLayout() {
  const { t, isMounted, checkoutGuardPending } = useCheckout();

  // Wait for client mount and for the cart guard to resolve or redirect.
  if (!isMounted || checkoutGuardPending) {
    return (
      <PageShell className="flex items-center justify-center">
        <div className="text-center">
          <Spinner size="xl" className="mx-auto mb-4" />
          <p className="text-muted">{t("common.loading")}</p>
        </div>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell>
        <Container className="pt-4">
          {/* `grid-cols-1` AÇIKÇA yazılıyor: sütun tanımı olmayan bir ızgara tek
              sütununu `auto` genişlikte kurar, yani içerik sütunu büyütür ve kap
              taşar. Tailwind'in `grid-cols-*` yardımcıları `minmax(0, 1fr)`
              ürettiği için sütun kabına sıkışır — hücreye `min-w-0` vermek tek
              başına yetmiyordu, sorun hücrede değil sütun boyutlandırmasındaydı. */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* `min-w-0`: sipariş kalemi satırları (ad + fiyat) hücreyi
                telefonda 579px'e genişletiyordu; ızgara hücresi varsayılan
                `min-width:auto` ile içeriğinin altına inemez. */}
            <div className="min-w-0 space-y-6 lg:col-span-2">
              <OrderItemsCard />
              <AddressStep />
              <PaymentSection />
            </div>

            <div className="lg:col-span-1">
              <OrderSummarySidebar />
            </div>
          </div>
        </Container>
      </PageShell>

      <GuestOtpModal />
    </>
  );
}

export default function CheckoutClient() {
  return (
    <CheckoutProvider>
      <CheckoutLayout />
    </CheckoutProvider>
  );
}
