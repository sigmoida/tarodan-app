/** @format */

"use client";

import Image from "next/image";
import { CreditCardIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useCheckout } from "../_context/CheckoutContext";

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function ConfirmStep() {
  const {
    locale,
    isAuthenticated,
    checkoutItems,
    addresses,
    selectedAddressId,
    grandTotal,
    isLoading,
    handleCheckout,
  } = useCheckout();

  const deliveryAddr =
    isAuthenticated && selectedAddressId
      ? addresses.find((a) => a.id === selectedAddressId)
      : null;

  return (
    <SectionCard
      title={locale === "en" ? "Order Summary" : "Sipariş Özeti"}
      className="p-6"
    >
      {/* Order Items */}
      <div className="space-y-4 mb-6">
        {checkoutItems.map((item) => (
          <div key={item.id} className="flex gap-4 p-4 bg-surface rounded">
            <div className="w-16 h-16 rounded overflow-hidden bg-border-subtle">
              <Image
                src={item.imageUrl}
                alt={item.title}
                width={64}
                height={64}
                className="object-cover w-full h-full"
              />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-muted">
                Satıcı: {item.seller.displayName}
              </p>
            </div>
            <div className="text-right">
              {item.originalPrice != null &&
                item.originalPrice > item.price && (
                  <p className="text-sm text-subtle line-through">
                    {fmtTL(item.originalPrice)} TL
                  </p>
                )}
              <p className="font-bold text-primary-500">
                {fmtTL(item.price)} TL
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Delivery Address */}
      {deliveryAddr && (
        <div className="mb-6 p-4 bg-surface rounded">
          <p className="text-sm text-muted mb-1">
            {locale === "en" ? "Delivery Address" : "Teslimat Adresi"}
          </p>
          <p className="font-medium">
            {deliveryAddr.fullName}, {deliveryAddr.address},{" "}
            {deliveryAddr.district}/{deliveryAddr.city}
          </p>
        </div>
      )}

      {/* Payment Method */}
      <div className="mb-6 p-4 bg-surface rounded">
        <p className="text-sm text-muted mb-1">
          {locale === "en" ? "Payment Method" : "Ödeme Yöntemi"}
        </p>
        <p className="font-medium">
          {locale === "en" ? "Pay with PayTR" : "PayTR ile Öde"}
        </p>
      </div>

      {/* Security Notice */}
      <div className="flex items-start gap-3 p-4 bg-success-50 rounded mb-6">
        <ShieldCheckIcon className="w-6 h-6 text-success-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-success-800">Güvenli Alışveriş</p>
          <p className="text-sm text-success-700">
            Ödemeniz şifreli olarak iletilir. Ürün elinize ulaşana kadar
            ödemeniz güvende tutulur.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleCheckout}
          isLoading={isLoading}
          leftIcon={<CreditCardIcon className="w-5 h-5" />}
        >
          Onayla ve Öde (₺{grandTotal.toFixed(2)})
        </Button>
      </div>
    </SectionCard>
  );
}
