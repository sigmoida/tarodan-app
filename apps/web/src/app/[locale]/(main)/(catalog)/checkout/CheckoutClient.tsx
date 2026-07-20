/** @format */

"use client";

import { Spinner, Stepper } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Container } from "@/components/layout/Container";
import { CheckoutProvider, useCheckout } from "./_context/CheckoutContext";
import AddressStep from "./_sections/AddressStep";
import PaymentStep from "./_sections/PaymentStep";
import ConfirmStep from "./_sections/ConfirmStep";
import OrderSummarySidebar from "./_sections/OrderSummarySidebar";
import GuestOtpModal from "./_modals/GuestOtpModal";

function CheckoutLayout() {
  const { t, isMounted, step, goToStep, checkoutGuardPending } = useCheckout();

  // Wait for client mount and for the cart guard to resolve or redirect.
  if (!isMounted || checkoutGuardPending) {
    return (
      <PageShell className="flex items-center justify-center">
        <div className="text-center">
          <Spinner size="xl" className="mx-auto mb-4" />
          <p className="text-muted">Yükleniyor...</p>
        </div>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell>
        <PageHeader title={t("checkout.title")} />

        <Container className="px-4 py-8">
          {/* Clickable progress stepper — also handles going back to a step */}
          <Stepper
            steps={[
              t("checkout.step1"),
              t("checkout.step2"),
              t("checkout.step3"),
            ]}
            current={step}
            onStepClick={goToStep}
            className="mb-8"
          />

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {step === 0 && <AddressStep />}
              {step === 1 && <PaymentStep />}
              {step === 2 && <ConfirmStep />}
            </div>

            {/* Order Summary Sidebar */}
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
