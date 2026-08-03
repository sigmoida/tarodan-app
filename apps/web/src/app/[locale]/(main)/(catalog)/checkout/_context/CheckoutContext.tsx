/** @format */

"use client";

import {
  createContext,
  useCallback,
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
import { paymentsApi } from "@/lib/api";
import { useCart } from "@/hooks/useCart";
import { useCartStore } from "@/stores/cartStore";
import { useCheckoutScope } from "@/hooks/useCartSelection";
import { useCardPayment } from "@/hooks/useCardPayment";
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
    couponDiscount: cartCouponDiscount,
    removeFromCart,
    removeFromOfflineCart,
    appliedCouponCode,
  } = useCart();
  const setBuyNowProductId = useCartStore((s) => s.setBuyNowProductId);
  const { user, isAuthenticated, token: authToken } = useAuthStore();
  const t = useTranslations();
  const locale = useLocale() as Locale;

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Set once a checkout succeeds and clears the cart. Without this, emptying the
  // cart flips `canCheckout` to false and the guard below would replace the
  // in-flight payment navigation with a redirect back to /cart.
  const checkoutSubmittedRef = useRef(false);
  /** Misafir OTP modalı doğrulanınca çağrılacak güncel "Ödeme Yap" eylemi. */
  const payRef = useRef<(() => Promise<void>) | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  // Mesafeli satış sözleşmesi onayı — kutu işaretlenmeden ödeme başlamaz ve
  // onay siparişle birlikte sunucuya yazılır (CheckoutGroup'ta damgalanır).
  const [distanceSalesAccepted, setDistanceSalesAccepted] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [paymentProvider] = useState<"paytr">("paytr");

  const [selectedCarrier] = useState<string>("surat");

  // ---- Server data (TanStack Query) ----
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

  // Ödenecek kapsam: "Hemen Al" ile gelindiyse yalnız o ürün, aksi halde
  // sepette SEÇİLİ satırlar. Sepetin tamamı değil — seçim dışı bırakılan ürün
  // sepette durur ama tahsil edilmez.
  const buyNowRequested = searchParams.get("buyNow") === "true";
  const { scopedLines, isBuyNow } = useCheckoutScope(
    cartLines,
    buyNowRequested,
  );

  const checkoutItems: CheckoutItem[] = scopedLines
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
        line.imageUrl || "https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün",
      seller: { id: line.sellerId, displayName: line.sellerName },
    }));
  // Ara toplam KAPSAMDAN türetilir; sepetin tamamının toplamı değil.
  const subtotal = checkoutItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  // Quote her item'ı GERÇEK adediyle fiyatlar (adet değişince yeniden çeker) →
  // önizleme = tahsilat. Eskiden hep quantity:1 gönderiliyordu (çok-adet yanlış).
  const { quote, quoteLoading } = useCheckoutQuote(
    checkoutItems.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    })),
    appliedCouponCode,
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
  const couponDiscount = quote?.couponDiscount ?? cartCouponDiscount ?? 0;
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
  } = useGuestOtp({
    checkoutItems,
    t,
    router,
    // Kod doğrulanır doğrulanmaz ödeme kaldığı yerden sürer: tek sayfada
    // kullanıcıyı "şimdi tekrar Ödeme Yap'a bas" demeye zorlamak gereksiz.
    onVerified: () => {
      void payRef.current?.();
    },
  });

  // Ödenen satırlar sepetten düşer, seçilmeyenler kalır: kısmi ödeme sonrası
  // sepeti tümden boşaltmak kullanıcının seçmediği ürünleri de siliyordu.
  const clearPurchasedLines = useCallback(async () => {
    for (const line of scopedLines) {
      if (line.source === "authenticated") {
        await removeFromCart(line.productId);
      } else {
        removeFromOfflineCart(line.productId);
      }
    }
    setBuyNowProductId(null);
  }, [scopedLines, removeFromCart, removeFromOfflineCart, setBuyNowProductId]);

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
    appliedCouponCode,
    clearPurchasedLines,
    distanceSalesAccepted,
    onCheckoutSubmitted: () => {
      checkoutSubmittedRef.current = true;
    },
    // Tariff version the quote was priced with — server returns 409 PRICING_CHANGED
    // if it moved before order-create, so the buyer confirms the new amount.
    expectedShippingTariffVersion: quote?.shippingTariffVersion ?? undefined,
    // Unit-price hash the quote was priced with — same 409 guard for product
    // price / campaign changes between quote and pay (F1.3).
    expectedPricingHash: quote?.pricingHash ?? undefined,
  });

  // Kart kasası yalnız üyede ve sunucu izin veriyorsa açıktır (misafir kart
  // saklayamaz). Yapılandırma okunamazsa güvenli varsayılan: yeni kart.
  const [cardStorageEnabled, setCardStorageEnabled] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) {
      setCardStorageEnabled(false);
      return;
    }
    let alive = true;
    paymentsApi
      .getConfig()
      .then((res) => {
        if (alive) setCardStorageEnabled(!!res.data?.cardStorageEnabled);
      })
      .catch(() => {
        if (alive) setCardStorageEnabled(false);
      });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  // Kart formu ve ödeme aynı sayfada: kart alanları doğrulandıktan SONRA
  // `handleCheckout` siparişi oluşturur ve paymentId'yi döndürür; kart bilgisi
  // oradan doğrudan PayTR'ye gider (bkz. useCardPayment).
  const card = useCardPayment({
    cardStorageEnabled,
    resolvePayment: handleCheckout,
  });

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

  // Ödeme ekranı en az bir SEÇİLİ satır ister. Sepet dolu ama seçim boşsa da
  // sepete döneriz: burada gösterilecek bir tutar yok. Hidrasyon beklenir ki
  // soğuk açılış geçerli bir sepeti erkenden geri göndermesin; ödeme başladıysa
  // (sepet satırları düştü) guard susar.
  useEffect(() => {
    if (checkoutSubmittedRef.current) return;
    if (!isMounted || cartIsLoading) return;
    if (canCheckout && checkoutItems.length > 0) return;
    router.replace("/cart");
  }, [canCheckout, cartIsLoading, isMounted, router, checkoutItems.length]);

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

  /** Misafirin e-posta kodu girilmiş mi — sunucu da aynı koşulu arıyor. */
  const guestOtpReady = /^\d{6}$/.test(
    guestEmailVerificationCode.replace(/\D/g, ""),
  );

  /**
   * Ödemeden önceki kapı: adres/iletişim doğrulaması ve misafirde e-posta
   * doğrulama kodu. `true` dönerse kart gönderimine geçilebilir; `false`
   * dönerken kullanıcıya ya hata gösterilmiş ya da kod ekranı açılmıştır.
   */
  const validateBeforePay = async (): Promise<boolean> => {
    if (isAuthenticated) {
      if (!authAddressOk) {
        toast.error(t("checkout.selectOrEnterCompleteShippingAddress"));
        return false;
      }
      if (!billingOk) {
        toast.error(t("checkout.completeBillingAddress"));
        return false;
      }
      return true;
    }

    if (!billingOk) {
      toast.error(t("checkout.completeBillingAddress"));
      return false;
    }
    if (!guestContactOk) {
      toast.error(t("checkout.fillNameEmailPhone"));
      return false;
    }
    if (!guestAddressOk) {
      toast.error(t("checkout.completeDeliveryAddress"));
      return false;
    }

    const em = guestEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast.error(t("checkout.enterEmail"));
      return false;
    }
    if (guestOtpReady) return true;

    // Kod ekranını AÇMADAN önce kodu iste: e-posta zaten kayıtlıysa (409)
    // requestGuestCheckoutOtp false döner + giriş'e yönlendirir → kod ekranı
    // hiç açılmaz. Kod daha önce bu e-posta için gönderildiyse tekrar isteme.
    if (guestOtpSentForEmail === em) {
      setGuestOtpModalOpen(true);
      return false;
    }
    const sent = await requestGuestCheckoutOtp(em);
    if (!sent) return false;
    toast.success(t("checkout.guestEmailCodeSent"));
    setGuestOtpModalOpen(true);
    return false;
  };

  /**
   * "Ödeme Yap" — tek sayfanın tek eylemi. Sıra bilinçli: önce ucuz kontroller
   * (kapsam, sözleşme, adres), sonra kart doğrulaması, sipariş EN SON oluşur.
   */
  const handlePay = async () => {
    if (checkoutItems.length === 0) {
      toast.error(t("checkout.noItemsSelected"));
      return;
    }
    if (!distanceSalesAccepted) {
      toast.error(t("checkout.distanceSalesRequired"));
      return;
    }
    if (!(await validateBeforePay())) return;
    await card.submit();
  };

  // Misafir kodu doğrulayınca ödeme kaldığı yerden sürsün diye güncel closure.
  payRef.current = handlePay;

  return {
    t,
    locale,
    router,
    isMounted,
    isAuthenticated,
    user,
    checkoutGuardPending:
      cartIsLoading || !canCheckout || checkoutItems.length === 0,
    isLoading,
    isBuyNow,
    // sözleşme + kart
    distanceSalesAccepted,
    setDistanceSalesAccepted,
    card,
    // items / pricing
    checkoutItems,
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
    handleAddAddress,
    handlePay,
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
