/** @format */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useStepper } from "@tarodan/ui";
import { useCart } from "@/hooks/useCart";
import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@tarodan/i18n";
import {
  billingAddressSchema,
  isValid,
  shippingAddressSchema,
  shippingAddressWithPhoneSchema,
} from "../_lib/schema";
import type { CheckoutItem } from "../_lib/types";
import { useCheckoutQuote } from "../_hooks/useCheckoutQuote";
import { useShippingCost } from "../_hooks/useShippingCost";
import { useDirectProduct } from "../_hooks/useDirectProduct";
import { useCheckoutAddresses } from "../_hooks/useCheckoutAddresses";
import { useCheckoutAddressForm } from "../_hooks/useCheckoutAddressForm";
import { useGuestOtp } from "../_hooks/useGuestOtp";
import { useCheckoutSubmit } from "../_hooks/useCheckoutSubmit";

function useCheckoutValue() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const {
    lines: cartLines,
    canCheckout,
    isLoading: cartIsLoading,
    subtotal: cartSubtotal,
    totalDiscount: cartTotalDiscount,
    clearCart,
    appliedCouponCode,
  } = useCart();
  const { user, isAuthenticated, token: authToken } = useAuthStore();
  const t = useTranslations();
  const locale = useLocale() as Locale;

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const directProductId = searchParams.get("productId");
  const existingOrderId = searchParams.get("orderId");
  const isCartCheckout = !directProductId && !existingOrderId;

  // Set once a checkout succeeds and clears the cart. Without this, emptying the
  // cart flips `canCheckout` to false and the guard below would replace the
  // in-flight payment navigation with a redirect back to /cart.
  const checkoutSubmittedRef = useRef(false);

  // 0: Address, 1: Confirm — payment (PayTR) is triggered from the Confirm step.
  const stepper = useStepper(2, 0);
  const step = stepper.current;
  const goToStep = stepper.goTo;
  const nextStep = stepper.next;
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [paymentProvider] = useState<"paytr">("paytr");

  const [selectedCarrier] = useState<string>("surat");

  // "Hemen Al" adet seçimi (yalnız direct/buy-now akışı). Sepet checkout'unda adet
  // sepet sayfasında ayarlanır; burada satırdan gelir. Ürün sayfasından gelen
  // `?quantity=` ilk adedi tohumlar (pozitif tam sayıya kırpılır, varsayılan 1).
  const [directQuantity, setDirectQuantity] = useState(() => {
    const raw = Number.parseInt(searchParams.get("quantity") ?? "", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });

  // ---- Server data (TanStack Query) ----
  const { directProduct, directProductError } = useDirectProduct(
    directProductId,
    locale,
  );
  const { addresses, addressesLoading, addressesError } =
    useCheckoutAddresses(isAuthenticated);

  // New-address / billing form + handleAddAddress + invalidateAddresses
  const {
    newAddress,
    setNewAddress,
    newAddressPhoneCountryCode,
    setNewAddressPhoneCountryCode,
    billingSameAsShipping,
    setBillingSameAsShipping,
    selectedBillingAddressId,
    setSelectedBillingAddressId,
    newBillingAddress,
    setNewBillingAddress,
    billingAddressPhoneCountryCode,
    setBillingAddressPhoneCountryCode,
    handleAddAddress,
  } = useCheckoutAddressForm({
    isAuthenticated,
    user,
    addresses,
    locale,
    t,
    queryClient,
    setSelectedAddressId,
    setShowAddressForm,
  });

  // Get checkout items: direct buy > available normalized cart lines. The cart
  // hook already hides stale guest lines for authenticated users.
  const checkoutItems: CheckoutItem[] = directProduct
    ? [{ ...directProduct, quantity: directQuantity }]
    : cartLines
        .filter((line) => line.isAvailable)
        .map((line) => ({
          id: line.id,
          productId: line.productId,
          title: line.title,
          price: line.price,
          quantity: line.quantity,
          maxQuantity: line.maxQuantity,
          originalPrice:
            line.originalPrice != null && line.originalPrice > line.price
              ? line.originalPrice
              : undefined,
          imageUrl:
            line.imageUrl ||
            "https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün",
          seller: { id: line.sellerId, displayName: line.sellerName },
        }));
  const subtotal = Number(
    (directProduct ? directProduct.price * directQuantity : cartSubtotal) ?? 0,
  );

  // Quote her item'ı GERÇEK adediyle fiyatlar (adet değişince yeniden çeker) →
  // önizleme = tahsilat. Eskiden hep quantity:1 gönderiliyordu (çok-adet yanlış).
  const { quote, quoteLoading } = useCheckoutQuote(
    checkoutItems.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    })),
    // Direct-buy'da kupon sunulmuyor; sepet checkout'unda uygulanan kupon quote'a
    // gönderilir → server toplamı kuponu içerir (önizleme = tahsilat).
    directProduct ? null : appliedCouponCode,
  );

  const shippingCity =
    isAuthenticated && selectedAddressId
      ? addresses.find((a) => a.id === selectedAddressId)?.city || ""
      : !isAuthenticated
        ? newAddress.city
        : "";
  const { shippingCost, shippingLoading } = useShippingCost({
    isAuthenticated,
    city: shippingCity,
    carrier: selectedCarrier,
    itemCount: checkoutItems.length,
  });

  // Kupon artık QUOTE'ta server-otoriter uygulanıyor (fee/tax/kargo indirimli baz):
  // pricing.totalAmount doğrudan tahsil edilecek tutardır → client-side ÇIKARMA YOK
  // (eski önizleme≠tahsilat hatası kapandı). Quote yoksa kaba fallback tahmini kullanılır.
  const couponDiscount = directProduct ? 0 : (cartTotalDiscount ?? 0);
  const displayTotal = Math.max(
    0,
    quote?.pricing?.totalAmount ?? subtotal + shippingCost - couponDiscount,
  );
  const grandTotal = displayTotal;

  // Guest contact + email OTP slice
  const {
    guestName,
    setGuestName,
    guestEmail,
    setGuestEmail,
    guestPhone,
    setGuestPhone,
    guestPhoneCountryCode,
    setGuestPhoneCountryCode,
    guestEmailVerificationCode,
    setGuestEmailVerificationCode,
    guestOtpSending,
    guestOtpSentForEmail,
    guestOtpModalOpen,
    setGuestOtpModalOpen,
    guestOtpInputRef,
    requestGuestCheckoutOtp,
    confirmGuestOtpModal,
  } = useGuestOtp({ checkoutItems, t, router, goToStep });

  // Payment orchestration slice (idempotency key + handleCheckout)
  const { handleCheckout } = useCheckoutSubmit({
    checkoutItems,
    t,
    isAuthenticated,
    selectedAddressId,
    addresses,
    newAddress,
    user,
    guestEmail,
    guestPhone,
    guestName,
    guestEmailVerificationCode,
    newAddressPhoneCountryCode,
    guestPhoneCountryCode,
    billingSameAsShipping,
    newBillingAddress,
    billingAddressPhoneCountryCode,
    selectedBillingAddressId,
    setIsLoading,
    router,
    paymentProvider,
    authToken,
    directProductId,
    appliedCouponCode: directProduct ? null : appliedCouponCode,
    clearCart,
    onCheckoutSubmitted: () => {
      checkoutSubmittedRef.current = true;
    },
    // Tariff version the quote was priced with — server returns 409 PRICING_CHANGED
    // if it moved before order-create, so the buyer confirms the new amount.
    expectedShippingTariffVersion: quote?.shippingTariffVersion ?? undefined,
  });

  // Direct product failed to load → bounce back to listings.
  useEffect(() => {
    if (directProductError) {
      toast.error(t("product.loadFailed"));
      router.push("/listings");
    }
  }, [directProductError, router, t]);

  // Default-select an address once the list first settles (default > last), or
  // open the form when there are none / the fetch failed.
  const didInitAddrRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || addressesLoading || didInitAddrRef.current) return;
    didInitAddrRef.current = true;
    if (addressesError) {
      setShowAddressForm(true);
      return;
    }
    const defaultAddr = addresses.find((a) => a.isDefault);
    if (defaultAddr) {
      setSelectedAddressId(defaultAddr.id);
    } else if (addresses.length > 0) {
      setSelectedAddressId(addresses[addresses.length - 1].id);
    } else {
      setSelectedAddressId(null);
      setShowAddressForm(true);
    }
  }, [isAuthenticated, addressesLoading, addressesError, addresses]);

  // orderId ile gelindiyse sipariş detay sayfasına yönlendir
  useEffect(() => {
    if (existingOrderId && isAuthenticated) {
      router.replace(`/profile/orders/${existingOrderId}`);
    }
  }, [existingOrderId, isAuthenticated, router]);

  // Plain cart checkout requires at least one available line. Wait for auth and
  // cart hydration so a cold load cannot redirect a valid cart prematurely, and
  // skip once a submit has emptied the cart on its way to the payment page.
  useEffect(() => {
    if (checkoutSubmittedRef.current) return;
    if (!isMounted || !isCartCheckout || cartIsLoading || canCheckout) return;
    router.replace("/cart");
  }, [canCheckout, cartIsLoading, isCartCheckout, isMounted, router]);

  // ---- Step-1 validation (zod) ----
  const authAddressOk =
    !!selectedAddressId ||
    isValid(shippingAddressWithPhoneSchema(locale), newAddress);
  const guestContactOk = !!(
    guestName?.trim() &&
    guestEmail?.trim() &&
    guestPhone?.trim()
  );
  const guestAddressOk = isValid(shippingAddressSchema(locale), newAddress);
  const billingOk =
    billingSameAsShipping ||
    isValid(billingAddressSchema(locale), newBillingAddress);
  const addressStepValid = isAuthenticated
    ? authAddressOk && billingOk
    : guestContactOk && guestAddressOk && billingOk;

  const handleAddressStepContinue = async () => {
    if (isAuthenticated) {
      if (!authAddressOk) {
        toast.error(t("checkout.selectOrEnterCompleteShippingAddress"));
        return;
      }
      if (!billingOk) {
        toast.error(t("checkout.completeBillingAddress"));
        return;
      }
      goToStep(1);
      return;
    }

    if (!billingOk) {
      toast.error(t("checkout.completeBillingAddress"));
      return;
    }
    if (!guestContactOk) {
      toast.error(t("checkout.fillNameEmailPhone"));
      return;
    }
    if (!guestAddressOk) {
      toast.error(t("checkout.completeDeliveryAddress"));
      return;
    }

    const em = guestEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast.error(t("checkout.enterEmail"));
      return;
    }

    // Kod ekranını AÇMADAN önce kodu iste: e-posta zaten kayıtlıysa (409)
    // requestGuestCheckoutOtp false döner + giriş'e yönlendirir → kod ekranı
    // hiç açılmaz. Kod daha önce bu e-posta için gönderildiyse tekrar isteme.
    if (guestOtpSentForEmail === em) {
      setGuestOtpModalOpen(true);
      return;
    }
    const sent = await requestGuestCheckoutOtp(em);
    if (!sent) return;
    toast.success(t("checkout.guestEmailCodeSent"));
    setGuestOtpModalOpen(true);
  };

  return {
    t,
    locale,
    router,
    isMounted,
    isAuthenticated,
    user,
    directProductId,
    existingOrderId,
    checkoutGuardPending: isCartCheckout && (cartIsLoading || !canCheckout),
    step,
    goToStep,
    nextStep,
    isLoading,
    // items / pricing
    checkoutItems,
    isCartCheckout,
    // "Hemen Al" adet seçimi (buy-now); sepet checkout'unda kullanılmaz.
    directQuantity,
    setDirectQuantity,
    subtotal,
    quote,
    quoteLoading,
    shippingCost,
    shippingLoading,
    couponDiscount,
    grandTotal,
    appliedCouponCode,
    // addresses
    addresses,
    selectedAddressId,
    setSelectedAddressId,
    showAddressForm,
    setShowAddressForm,
    newAddress,
    setNewAddress,
    newAddressPhoneCountryCode,
    setNewAddressPhoneCountryCode,
    // billing
    billingSameAsShipping,
    setBillingSameAsShipping,
    selectedBillingAddressId,
    setSelectedBillingAddressId,
    newBillingAddress,
    setNewBillingAddress,
    billingAddressPhoneCountryCode,
    setBillingAddressPhoneCountryCode,
    // guest
    guestName,
    setGuestName,
    guestEmail,
    setGuestEmail,
    guestPhone,
    setGuestPhone,
    guestPhoneCountryCode,
    setGuestPhoneCountryCode,
    guestEmailVerificationCode,
    setGuestEmailVerificationCode,
    guestOtpSending,
    guestOtpSentForEmail,
    guestOtpModalOpen,
    setGuestOtpModalOpen,
    guestOtpInputRef,
    requestGuestCheckoutOtp,
    confirmGuestOtpModal,
    // actions
    addressStepValid,
    handleAddressStepContinue,
    handleAddAddress,
    handleCheckout,
  };
}

type CheckoutValue = ReturnType<typeof useCheckoutValue>;

const CheckoutContext = createContext<CheckoutValue | null>(null);

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const value = useCheckoutValue();
  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
}

export function useCheckout() {
  const ctx = useContext(CheckoutContext);
  if (!ctx)
    throw new Error("useCheckout must be used within a CheckoutProvider");
  return ctx;
}
