import { useState, useEffect, useMemo, useRef } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { appAlert } from "@tarodan/ui-native";
import {
  ordersApi,
  paymentsApi,
  shippingApi,
  addressesApi,
  type OrderAddressInput,
} from "@/lib/api";
import { qk } from "@/lib/query";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { captureException } from "@/services/sentry";
import { DEFAULT_COUNTRY_CODE, normalizePhoneForPayload } from "@/utils/phone";
import {
  STOCKOUT_KEYWORDS,
  generateUuidV4,
  EMPTY_ADDRESS,
} from "../_lib/constants";
import {
  extractApiMessage,
  validateGuest,
  validateInlineAddress,
} from "../_lib/validation";
import type { ShippingAddressInput, SavedAddress } from "../_lib/types";

/**
 * Checkout controller'ı — tüm form durumu, query'ler, kargo hesabı, payload
 * kurucuları ve ödeme akışı (`proceedCheckout` + misafir OTP) burada. Ekran
 * yalnız adımları kompoze eder. Ödeme dallanmaları orijinalden BİREBİR taşındı.
 */
export function useCheckout() {
  const { buyNow } = useLocalSearchParams<{ buyNow?: string }>();
  const isBuyNow = buyNow === "1";
  const {
    items: cartItems,
    clearCart: clearCartStore,
    buyNowItem,
    clearBuyNow,
  } = useCartStore();
  const { isAuthenticated, user } = useAuthStore();

  const items = useMemo(
    () => (isBuyNow ? (buyNowItem ? [buyNowItem] : []) : cartItems),
    [isBuyNow, buyNowItem, cartItems],
  );
  const finalizeCart = () => {
    if (isBuyNow) clearBuyNow();
    else clearCartStore();
  };

  const [step, setStep] = useState(1);

  const idempotencyKeyRef = useRef(generateUuidV4());
  useEffect(() => {
    idempotencyKeyRef.current = generateUuidV4();
  }, [items]);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestPhoneCountryCode, setGuestPhoneCountryCode] =
    useState(DEFAULT_COUNTRY_CODE);

  const [selectedAddressId, setSelectedAddressId] = useState<string | "new">(
    "new",
  );
  const [shippingAddress, setShippingAddress] =
    useState<ShippingAddressInput>(EMPTY_ADDRESS);
  const [billingDifferent, setBillingDifferent] = useState(false);
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<
    string | "new"
  >("new");
  const [billingAddress, setBillingAddress] =
    useState<ShippingAddressInput>(EMPTY_ADDRESS);

  const selectedCarrier = "surat" as const;
  const paymentProvider = "paytr" as const;
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingLoading, setShippingLoading] = useState(false);

  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: "" });

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + it.price * it.quantity, 0),
    [items],
  );

  const quoteQuery = useQuery({
    queryKey: qk.checkout.quote(
      items.map((it) => `${it.productId}:${it.quantity}`).join(","),
    ),
    queryFn: async () => {
      const res: any = await ordersApi.getQuote({
        items: items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
        })),
      });
      const pricing = res.data?.pricing ?? res.data ?? {};
      return {
        ...pricing,
        // Threshold-applied shipping + tariff version live at the quote top level.
        shippingAmount: res.data?.shippingAmount ?? pricing?.shippingAmount,
        shippingTariffVersion: res.data?.shippingTariffVersion ?? null,
      } as {
        buyerFeeAmount?: number;
        taxAmount?: number;
        totalAmount?: number;
        shippingAmount?: number;
        shippingTariffVersion?: number | null;
      };
    },
    enabled: items.length > 0,
    staleTime: 60_000,
  });
  const buyerFee = Number(quoteQuery.data?.buyerFeeAmount ?? 0);
  const taxAmount = Number(quoteQuery.data?.taxAmount ?? 0);

  // The server quote's shipping (active tariff, free-shipping threshold applied) is
  // authoritative — the /shipping/rates estimate is only a pre-quote placeholder.
  useEffect(() => {
    if (quoteQuery.data?.shippingAmount != null) {
      setShippingCost(Number(quoteQuery.data.shippingAmount));
    }
  }, [quoteQuery.data?.shippingAmount]);

  const total = subtotal + shippingCost + buyerFee + taxAmount;

  const addressesQuery = useQuery({
    queryKey: qk.addresses.mine,
    queryFn: async () => {
      const response = await addressesApi.getAll();
      const list: SavedAddress[] =
        (response.data as any)?.data ?? response.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: isAuthenticated,
  });
  const addresses = addressesQuery.data ?? [];

  useEffect(() => {
    if (!isAuthenticated || addresses.length === 0) return;
    if (selectedAddressId !== "new") return;
    const def = addresses.find((a) => a.isDefault) ?? addresses[0];
    setSelectedAddressId(def.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, addresses]);

  useEffect(() => {
    if (!otpModalOpen) return;
    const id = setInterval(
      () => setOtpExpiresIn((s) => (s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => clearInterval(id);
  }, [otpModalOpen]);

  const effectiveShippingCity = useMemo(() => {
    if (isAuthenticated && selectedAddressId !== "new") {
      const a = addresses.find((x) => x.id === selectedAddressId);
      return a?.city ?? "";
    }
    return shippingAddress.city;
  }, [isAuthenticated, selectedAddressId, addresses, shippingAddress.city]);

  const calculateShipping = async (city: string) => {
    setShippingLoading(true);
    try {
      const response = await shippingApi
        .getRatesByCity({ city, carrier: selectedCarrier, weight: 0.5 })
        .catch(() => null);
      if (response?.data?.rate) {
        setShippingCost(response.data.rate);
      } else {
        const isIstanbul = city.toLowerCase().includes("istanbul");
        setShippingCost(isIstanbul ? 34.9 : 49.9);
      }
    } catch {
      setShippingCost(49.9);
    } finally {
      setShippingLoading(false);
    }
  };

  useEffect(() => {
    if (effectiveShippingCity) calculateShipping(effectiveShippingCity);
    else setShippingCost(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveShippingCity, selectedCarrier]);

  const showSnackbar = (message: string) =>
    setSnackbar({ visible: true, message });

  const handleEmailAlreadyRegistered = (e: any): boolean => {
    if (
      e?.response?.status === 409 ||
      e?.response?.data?.code === "EMAIL_ALREADY_REGISTERED"
    ) {
      appAlert(
        "Bu e-posta zaten kayıtlı",
        extractApiMessage(e) ??
          "Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapıp alışverişe devam edin.",
      );
      router.push("/(auth)/login" as any);
      return true;
    }
    return false;
  };

  const validateStep1 = (): string | null => {
    if (!isAuthenticated) {
      const guestErr = validateGuest(guestName, guestEmail, guestPhone);
      if (guestErr) return guestErr;
    }
    if (isAuthenticated && selectedAddressId !== "new") {
      // Kayıtlı adres seçildi → OK
    } else {
      const phone = shippingAddress.phone.trim() || guestPhone.trim();
      const err = validateInlineAddress({ ...shippingAddress, phone });
      if (err) return err;
    }
    if (billingDifferent) {
      if (isAuthenticated && selectedBillingAddressId !== "new") {
        // Kayıtlı seçildi → OK
      } else {
        const err = validateInlineAddress(billingAddress, "Fatura");
        if (err) return err;
      }
    }
    return null;
  };

  const handleNextStep = () => {
    if (step === 1) {
      const err = validateStep1();
      if (err) return showSnackbar(err);
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
  };

  const buildShippingPayload = (): {
    id?: string;
    inline?: OrderAddressInput;
  } => {
    if (isAuthenticated && selectedAddressId !== "new") {
      return { id: selectedAddressId };
    }
    const phone = shippingAddress.phone.trim()
      ? normalizePhoneForPayload(
          shippingAddress.phone,
          shippingAddress.phoneCountryCode ?? DEFAULT_COUNTRY_CODE,
        )
      : normalizePhoneForPayload(guestPhone, guestPhoneCountryCode);
    return {
      inline: {
        fullName: shippingAddress.fullName.trim(),
        phone,
        city: shippingAddress.city.trim(),
        district: shippingAddress.district.trim(),
        address: shippingAddress.address.trim(),
        zipCode: shippingAddress.zipCode?.trim() || undefined,
      },
    };
  };

  const buildBillingPayload = (): {
    id?: string;
    inline?: OrderAddressInput;
  } | null => {
    if (!billingDifferent) return null;
    if (isAuthenticated && selectedBillingAddressId !== "new") {
      return { id: selectedBillingAddressId };
    }
    return {
      inline: {
        fullName: billingAddress.fullName.trim(),
        phone: normalizePhoneForPayload(
          billingAddress.phone,
          billingAddress.phoneCountryCode ?? DEFAULT_COUNTRY_CODE,
        ),
        city: billingAddress.city.trim(),
        district: billingAddress.district.trim(),
        address: billingAddress.address.trim(),
        zipCode: billingAddress.zipCode?.trim() || undefined,
      },
    };
  };

  const proceedCheckout = async (emailVerificationCode?: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const shipping = buildShippingPayload();
      const billing = buildBillingPayload();

      // Tariff version the quote was priced with → server returns 409 PRICING_CHANGED
      // if it moved before order-create, so the buyer confirms the new amount.
      const expectedShippingTariffVersion =
        quoteQuery.data?.shippingTariffVersion ?? undefined;

      const checkoutPayload = {
        items: items.map((item) => ({ productId: item.productId })),
        idempotencyKey: idempotencyKeyRef.current,
        shippingAddressId: shipping.id,
        shippingAddress: shipping.inline,
        billingAddressId: billing?.id,
        billingAddress: billing?.inline,
        expectedShippingTariffVersion,
      };

      const response =
        isAuthenticated && user
          ? await ordersApi.checkout(checkoutPayload)
          : await ordersApi.checkoutGuest({
              items: checkoutPayload.items,
              idempotencyKey: checkoutPayload.idempotencyKey,
              email: guestEmail.trim().toLowerCase(),
              emailVerificationCode: emailVerificationCode ?? "",
              phone: normalizePhoneForPayload(
                guestPhone,
                guestPhoneCountryCode,
              ),
              guestName: guestName.trim(),
              shippingAddress: shipping.inline!,
              billingAddress: billing?.inline,
              expectedShippingTariffVersion,
            });

      const data: any = (response.data as any)?.data ?? response.data;
      const checkoutGroupId: string | null = data?.checkoutGroupId ?? null;
      const firstOrderId: string | null = data?.orders?.[0]?.orderId ?? null;

      if (!checkoutGroupId || !firstOrderId) {
        appAlert(
          "Hata",
          "Sipariş oluşturuldu fakat ödeme başlatılamadı. Siparişlerim sayfasından devam edebilirsiniz.",
        );
        finalizeCart();
        router.replace("/orders" as any);
        return;
      }

      try {
        const initResp: any = isAuthenticated
          ? await paymentsApi.initiateGroup(checkoutGroupId, paymentProvider)
          : await paymentsApi.initiateGroupGuest(
              checkoutGroupId,
              paymentProvider,
            );
        const initData = initResp.data?.data ?? initResp.data ?? {};
        const paymentId =
          initData.paymentId ||
          initData.id ||
          initData.payment?.id ||
          firstOrderId;

        if (initData.useBypass === true) {
          try {
            await paymentsApi.bypassComplete(paymentId);
          } catch (bypassErr: any) {
            captureException(bypassErr, {
              level: "error",
              tags: { flow: "checkout.bypassComplete" },
              extra: { paymentId, orderId: firstOrderId, checkoutGroupId },
            });
          }
          finalizeCart();
          router.replace({
            pathname: "/payment/success",
            params: {
              paymentId,
              orderId: firstOrderId,
              groupId: checkoutGroupId,
            },
          } as any);
          return;
        }

        const paymentUrl: string | undefined = initData.paymentUrl;
        finalizeCart();
        router.replace({
          pathname: "/payment/[id]",
          params: {
            id: paymentId,
            orderId: firstOrderId,
            groupId: checkoutGroupId,
            provider: paymentProvider,
            guest: isAuthenticated ? "0" : "1",
            ...(paymentUrl ? { paymentUrl } : {}),
          },
        } as any);
      } catch (payErr: any) {
        const msg =
          payErr?.response?.data?.message ||
          "Ödeme başlatılamadı. Siparişinizi daha sonra siparişlerim üzerinden tamamlayabilirsiniz.";
        const status = payErr?.response?.status;
        const isStockout =
          (status === 400 || status === 409) &&
          typeof msg === "string" &&
          STOCKOUT_KEYWORDS.some((kw) =>
            msg.toLowerCase().includes(kw.toLowerCase()),
          );
        if (isStockout) {
          const productId =
            payErr?.response?.data?.productId || items[0]?.productId;
          if (productId) {
            router.replace({
              pathname: "/products/unavailable/[productId]",
              params: { productId },
            } as any);
            return;
          }
        }
        appAlert("Ödeme Başlatılamadı", msg, [
          {
            text: "Tamam",
            onPress: () =>
              router.replace(isAuthenticated ? "/orders" : ("/" as any)),
          },
        ]);
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      captureException(error, {
        level: "error",
        tags: { flow: "checkout" },
        extra: { status: error?.response?.status },
      });
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        (Array.isArray(error.response?.data?.message)
          ? error.response?.data?.message.join(", ")
          : "Sipariş oluşturulamadı");
      const status = error?.response?.status;
      const isStockout =
        (status === 400 || status === 409) &&
        typeof errorMessage === "string" &&
        STOCKOUT_KEYWORDS.some((kw) =>
          errorMessage.toLowerCase().includes(kw.toLowerCase()),
        );
      if (
        !isAuthenticated &&
        emailVerificationCode &&
        status === 400 &&
        !isStockout
      ) {
        setOtpError(
          extractApiMessage(error) ??
            "Doğrulama kodu geçersiz veya süresi dolmuş.",
        );
        return;
      }
      if (isStockout) {
        const productId =
          error?.response?.data?.productId || items[0]?.productId;
        if (productId) {
          router.replace({
            pathname: "/products/unavailable/[productId]",
            params: { productId },
          } as any);
          return;
        }
      }
      appAlert("Hata", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (items.length === 0) {
      showSnackbar("Sepetiniz boş");
      return;
    }
    for (const item of items) {
      if (
        !item.productId ||
        typeof item.productId !== "string" ||
        item.productId.length < 10
      ) {
        appAlert("Hata", `Geçersiz ürün ID: ${item.title}`);
        return;
      }
    }
    if (isAuthenticated && user) {
      await proceedCheckout();
      return;
    }

    const guestErr = validateGuest(guestName, guestEmail, guestPhone);
    if (guestErr) {
      showSnackbar(guestErr);
      return;
    }
    const email = guestEmail.trim().toLowerCase();
    setOtpSending(true);
    try {
      const resp: any = await ordersApi.sendGuestVerificationCode({
        email,
        expectedCheckoutCount: Math.max(1, items.length),
      });
      const expiresIn =
        resp?.data?.data?.expiresInSeconds ??
        resp?.data?.expiresInSeconds ??
        180;
      setOtpCode("");
      setOtpError(null);
      setOtpExpiresIn(expiresIn);
      setOtpModalOpen(true);
    } catch (e: any) {
      if (handleEmailAlreadyRegistered(e)) return;
      appAlert("Hata", extractApiMessage(e) ?? "Doğrulama kodu gönderilemedi.");
    } finally {
      setOtpSending(false);
    }
  };

  const closeOtpModal = () => {
    setOtpModalOpen(false);
    setOtpCode("");
    setOtpError(null);
  };

  const handleOtpSubmit = async () => {
    if (otpCode.length !== 6) return;
    await proceedCheckout(otpCode);
  };

  const handleOtpResend = async () => {
    if (otpExpiresIn > 0 || otpSending) return;
    const email = guestEmail.trim().toLowerCase();
    setOtpSending(true);
    try {
      const resp: any = await ordersApi.sendGuestVerificationCode({
        email,
        expectedCheckoutCount: Math.max(1, items.length),
      });
      const expiresIn =
        resp?.data?.data?.expiresInSeconds ??
        resp?.data?.expiresInSeconds ??
        180;
      setOtpExpiresIn(expiresIn);
      setOtpCode("");
      setOtpError(null);
    } catch (e: any) {
      if (handleEmailAlreadyRegistered(e)) {
        setOtpModalOpen(false);
        return;
      }
      setOtpError(extractApiMessage(e) ?? "Kod gönderilemedi.");
    } finally {
      setOtpSending(false);
    }
  };

  return {
    isAuthenticated,
    items,
    step,
    setStep,
    // guest
    guestName,
    setGuestName,
    guestEmail,
    setGuestEmail,
    guestPhone,
    setGuestPhone,
    guestPhoneCountryCode,
    setGuestPhoneCountryCode,
    // address
    selectedAddressId,
    setSelectedAddressId,
    shippingAddress,
    setShippingAddress,
    billingDifferent,
    setBillingDifferent,
    selectedBillingAddressId,
    setSelectedBillingAddressId,
    billingAddress,
    setBillingAddress,
    addresses,
    // shipping/pricing
    shippingCost,
    shippingLoading,
    effectiveShippingCity,
    subtotal,
    buyerFee,
    taxAmount,
    total,
    // ui
    loading,
    snackbar,
    dismissSnackbar: () => setSnackbar({ visible: false, message: "" }),
    handleNextStep,
    handleCheckout,
    // otp
    otpModalOpen,
    otpCode,
    setOtpCode,
    otpError,
    otpExpiresIn,
    otpSending,
    closeOtpModal,
    handleOtpSubmit,
    handleOtpResend,
  };
}
