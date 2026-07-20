/** @format */

"use client";

import { useRef, type Dispatch, type SetStateAction } from "react";
import toast from "react-hot-toast";
import { ordersApi, paymentsApi } from "@/lib/api";
import { getFullPhoneNumber, normalizePhoneForPayload } from "@/lib/phone";
import { useTranslations } from "next-intl";
import type { Address, CheckoutItem } from "../_lib/types";

type Translate = ReturnType<typeof useTranslations<never>>;

/**
 * Checkout submission slice: the per-cart idempotency key and `handleCheckout` —
 * the payment orchestration (build order/guest payload → create order → initiate
 * group payment → redirect). Every value it reads comes in as an argument so no
 * state is duplicated. Extracted verbatim: API calls, payloads, idempotency keys,
 * stockout handling, toasts, and redirects are all unchanged.
 */
export function useCheckoutSubmit({
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
  clearCart,
  onCheckoutSubmitted,
}: {
  checkoutItems: CheckoutItem[];
  t: Translate;
  isAuthenticated: boolean;
  selectedAddressId: string | null;
  addresses: Address[];
  newAddress: Omit<Address, "id">;
  user:
    { email?: string; phone?: string; displayName?: string } | null | undefined;
  guestEmail: string;
  guestPhone: string;
  guestName: string;
  guestEmailVerificationCode: string;
  newAddressPhoneCountryCode: string;
  guestPhoneCountryCode: string;
  billingSameAsShipping: boolean;
  newBillingAddress: Omit<Address, "id">;
  billingAddressPhoneCountryCode: string;
  selectedBillingAddressId: string | null;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  router: { push: (href: string) => void };
  paymentProvider: "paytr";
  authToken: string | null;
  directProductId: string | null;
  clearCart: () => Promise<void>;
  /** Marks the checkout as submitted so the cart-empty guard stops redirecting. */
  onCheckoutSubmitted: () => void;
}) {
  // Checkout idempotency: retries for the same cart (double click, retry after a
  // network error) return the SAME group server-side. Generated on first submit.
  const checkoutIdempotencyKeyRef = useRef<string | null>(null);
  const getCheckoutIdempotencyKey = () => {
    if (!checkoutIdempotencyKeyRef.current) {
      checkoutIdempotencyKeyRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
            });
    }
    return checkoutIdempotencyKeyRef.current;
  };

  const handleCheckout = async () => {
    if (checkoutItems.length === 0) {
      toast.error(t("cart.empty"));
      return;
    }

    setIsLoading(true);

    try {
      // Determine checkout mode
      const hasSavedAddress =
        isAuthenticated && selectedAddressId && addresses.length > 0;
      const hasFormAddress =
        newAddress.fullName &&
        newAddress.phone &&
        newAddress.city &&
        newAddress.district &&
        newAddress.address;

      // Get shipping address - prefer saved address for logged-in users, otherwise use form
      let shippingAddress: any;
      let contactEmail: string;
      let contactPhone: string;
      let contactName: string;

      if (hasSavedAddress) {
        const selectedAddress = addresses.find(
          (a) => a.id === selectedAddressId,
        );
        if (!selectedAddress) {
          toast.error(t("checkout.addressNotFound"));
          setIsLoading(false);
          return;
        }

        const addressPhone = selectedAddress.phone || user?.phone;
        if (!addressPhone) {
          toast.error("Teslimat adresi için telefon numarası gereklidir");
          setIsLoading(false);
          return;
        }

        shippingAddress = {
          fullName: selectedAddress.fullName,
          phone: addressPhone,
          city: selectedAddress.city,
          district: selectedAddress.district,
          address: selectedAddress.address,
          zipCode: selectedAddress.zipCode || undefined,
        };
        contactEmail = user?.email || "";
        contactPhone = addressPhone;
        contactName = selectedAddress.fullName || user?.displayName || "";
      } else if (hasFormAddress) {
        const email = isAuthenticated ? user?.email : guestEmail;
        const phone = isAuthenticated
          ? user?.phone || newAddress.phone
          : guestPhone || newAddress.phone;
        const name = isAuthenticated
          ? user?.displayName || newAddress.fullName
          : guestName || newAddress.fullName;

        if (!isAuthenticated) {
          if (!guestName?.trim()) {
            toast.error(t("checkout.enterName"));
            setIsLoading(false);
            return;
          }
          if (!guestEmail?.trim()) {
            toast.error(t("checkout.enterEmail"));
            setIsLoading(false);
            return;
          }
          if (!guestPhone?.trim()) {
            toast.error(t("checkout.enterPhone"));
            setIsLoading(false);
            return;
          }
          const otpDigits = guestEmailVerificationCode.replace(/\D/g, "");
          if (!/^\d{6}$/.test(otpDigits)) {
            toast.error(t("checkout.guestEmailOtpRequired"));
            setIsLoading(false);
            return;
          }
        }

        if (!email) {
          toast.error(t("checkout.enterEmail"));
          setIsLoading(false);
          return;
        }
        if (!phone) {
          toast.error(t("checkout.enterPhone"));
          setIsLoading(false);
          return;
        }

        const addressPhone = newAddress.phone?.trim() || phone;
        if (!addressPhone) {
          toast.error(t("checkout.enterAddressPhone"));
          setIsLoading(false);
          return;
        }

        const formattedAddressPhone = getFullPhoneNumber(
          addressPhone,
          newAddressPhoneCountryCode,
        );
        const formattedContactPhone = isAuthenticated
          ? user?.phone || formattedAddressPhone
          : getFullPhoneNumber(phone || guestPhone, guestPhoneCountryCode);

        shippingAddress = {
          fullName: newAddress.fullName,
          phone: formattedAddressPhone,
          city: newAddress.city,
          district: newAddress.district,
          address: newAddress.address,
          zipCode: newAddress.zipCode || undefined,
        };
        contactEmail = email;
        contactPhone = formattedContactPhone;
        contactName = name || newAddress.fullName;
      } else {
        if (isAuthenticated) {
          if (addresses.length === 0) {
            toast.error(t("checkout.clickAddNewAddress"));
          } else if (!selectedAddressId) {
            toast.error(t("checkout.selectShippingAddress"));
          } else {
            toast.error(t("checkout.invalidAddressAddNew"));
          }
        } else {
          const missingFields = [];
          if (!newAddress.fullName) missingFields.push(t("checkout.fullName"));
          if (!newAddress.phone) missingFields.push(t("checkout.phone"));
          if (!newAddress.city) missingFields.push(t("checkout.city"));
          if (!newAddress.district) missingFields.push(t("checkout.district"));
          if (!newAddress.address) missingFields.push(t("checkout.address"));

          if (missingFields.length > 0) {
            toast.error(
              t("checkout.pleaseFillIn", { fields: missingFields.join(", ") }),
            );
          } else {
            toast.error(t("checkout.enterShippingAddress"));
          }
        }
        setIsLoading(false);
        return;
      }

      // Tüm sepet TEK çağrıda, tek CheckoutGroup altında sipariş edilir; tek
      // ödeme grubu kapsar (eski ürün-başına-sipariş döngüsü 2. siparişi ödemesiz bırakıyordu).
      {
        let orderResponse;
        const checkoutGroupItems = checkoutItems.map((ci) => ({
          productId: ci.productId,
        }));

        try {
          if (isAuthenticated) {
            const validAddressId =
              hasSavedAddress &&
              selectedAddressId &&
              selectedAddressId.trim() !== ""
                ? selectedAddressId
                : undefined;

            const payload: {
              items: Array<{ productId: string }>;
              idempotencyKey: string;
              shippingAddressId?: string;
              shippingAddress?: typeof shippingAddress;
              billingAddressId?: string;
              billingAddress?: {
                fullName: string;
                phone: string;
                city: string;
                district: string;
                address: string;
                zipCode?: string;
              };
              couponCode?: string;
            } = {
              items: checkoutGroupItems,
              idempotencyKey: getCheckoutIdempotencyKey(),
            };

            if (validAddressId) {
              payload.shippingAddressId = validAddressId;
            }
            if (
              !billingSameAsShipping &&
              newBillingAddress.fullName &&
              newBillingAddress.city &&
              newBillingAddress.address
            ) {
              payload.billingAddress = {
                fullName: newBillingAddress.fullName.trim(),
                phone: normalizePhoneForPayload(
                  newBillingAddress.phone,
                  billingAddressPhoneCountryCode,
                ),
                city: newBillingAddress.city.trim(),
                district: newBillingAddress.district.trim(),
                address: newBillingAddress.address.trim(),
                zipCode: newBillingAddress.zipCode?.trim() || undefined,
              };
            } else if (
              !billingSameAsShipping &&
              selectedBillingAddressId &&
              selectedBillingAddressId !== validAddressId
            ) {
              payload.billingAddressId = selectedBillingAddressId;
            }
            if (!validAddressId) {
              const addr =
                shippingAddress ||
                (hasFormAddress &&
                newAddress.fullName &&
                newAddress.phone &&
                newAddress.city &&
                newAddress.district &&
                newAddress.address
                  ? {
                      fullName: newAddress.fullName,
                      phone: newAddress.phone || user?.phone || "",
                      city: newAddress.city,
                      district: newAddress.district,
                      address: newAddress.address,
                      zipCode: newAddress.zipCode,
                    }
                  : null);
              if (addr) {
                if (!addr.fullName?.trim())
                  throw new Error("Teslimat adresi için ad soyad gereklidir");
                if (!addr.phone?.trim())
                  throw new Error("Teslimat adresi için telefon gereklidir");
                if (!addr.city?.trim())
                  throw new Error("Teslimat adresi için şehir gereklidir");
                if (!addr.district?.trim())
                  throw new Error("Teslimat adresi için ilçe gereklidir");
                if (!addr.address?.trim())
                  throw new Error("Teslimat adresi için açık adres gereklidir");
                payload.shippingAddress = {
                  fullName: addr.fullName.trim(),
                  phone: normalizePhoneForPayload(
                    addr.phone,
                    newAddressPhoneCountryCode,
                  ),
                  city: addr.city.trim(),
                  district: addr.district.trim(),
                  address: addr.address.trim(),
                  zipCode: addr.zipCode?.trim() || undefined,
                };
              } else {
                toast.error(t("checkout.selectOrEnterShippingAddress"));
                setIsLoading(false);
                return;
              }
            }

            orderResponse = await ordersApi.checkout(payload);
          } else {
            const formattedContactPhone = normalizePhoneForPayload(
              contactPhone,
              guestPhoneCountryCode,
            );
            const formattedAddrPhone = normalizePhoneForPayload(
              shippingAddress?.phone,
              newAddressPhoneCountryCode,
            );

            const guestPayload: {
              items: Array<{ productId: string }>;
              idempotencyKey: string;
              email: string;
              phone: string;
              guestName: string;
              emailVerificationCode: string;
              shippingAddress: {
                fullName: string;
                phone: string;
                city: string;
                district: string;
                address: string;
                zipCode?: string;
              };
              billingAddress?: {
                fullName: string;
                phone: string;
                city: string;
                district: string;
                address: string;
                zipCode?: string;
              };
            } = {
              items: checkoutGroupItems,
              idempotencyKey: getCheckoutIdempotencyKey(),
              email: contactEmail,
              phone: formattedContactPhone,
              guestName: contactName,
              emailVerificationCode: guestEmailVerificationCode
                .replace(/\D/g, "")
                .slice(0, 6),
              shippingAddress: {
                ...shippingAddress,
                phone: formattedAddrPhone,
              },
            };
            if (
              !billingSameAsShipping &&
              newBillingAddress.fullName &&
              newBillingAddress.city &&
              newBillingAddress.address
            ) {
              guestPayload.billingAddress = {
                fullName: newBillingAddress.fullName.trim(),
                phone: normalizePhoneForPayload(
                  newBillingAddress.phone,
                  billingAddressPhoneCountryCode,
                ),
                city: newBillingAddress.city.trim(),
                district: newBillingAddress.district.trim(),
                address: newBillingAddress.address.trim(),
                zipCode: newBillingAddress.zipCode?.trim() || undefined,
              };
            }

            orderResponse = await ordersApi.checkoutGuest(guestPayload);
          }
        } catch (orderError: any) {
          let errorMessage = "Sipariş oluşturulamadı";
          if (orderError.response?.data) {
            const data = orderError.response.data;
            if (Array.isArray(data.message)) {
              errorMessage = data.message.join(", ");
            } else if (typeof data.message === "string") {
              errorMessage = data.message;
            } else if (data.error) {
              errorMessage = data.error;
            } else if (typeof data === "string") {
              errorMessage = data;
            }
          } else if (orderError.message) {
            errorMessage = orderError.message;
          }

          const stockoutKeywords = [
            "satışta değil",
            "stokta yok",
            "stokta bulunmamaktadır",
            "başkası tarafından",
            "başka alıcıya satıldı",
          ];
          const isStockout =
            (orderError.response?.status === 400 ||
              orderError.response?.status === 409) &&
            stockoutKeywords.some((kw) =>
              errorMessage.toLowerCase().includes(kw.toLowerCase()),
            );

          const stockoutProductId =
            orderError.response?.data?.productId || checkoutItems[0]?.productId;
          if (isStockout && stockoutProductId) {
            router.push(`/products/unavailable/${stockoutProductId}`);
            return;
          }

          toast.error(errorMessage);
          return;
        }

        // Batch checkout: { checkoutGroupId, orders: [{ orderId, ... }] } döner
        const checkoutGroupData =
          orderResponse?.data?.data ?? orderResponse?.data ?? {};
        const checkoutGroupId: string | null =
          checkoutGroupData?.checkoutGroupId ?? null;
        const orderId =
          checkoutGroupData?.orders?.[0]?.orderId ??
          checkoutGroupData?.orderId ??
          null;

        if (!checkoutGroupId || !orderId) {
          toast.error(t("checkout.orderCreatedPaymentFailed"));
          setIsLoading(false);
          router.push("/profile/orders");
          return;
        }

        if (orderId) {
          // Grup ödemesi: tek ödeme gruptaki tüm siparişleri kapsar
          try {
            const paymentResponse = isAuthenticated
              ? await paymentsApi.initiateGroup(
                  checkoutGroupId,
                  paymentProvider,
                )
              : await paymentsApi.initiateGroupGuest(
                  checkoutGroupId,
                  paymentProvider,
                );
            const paymentData = paymentResponse.data;
            const hasSession = isAuthenticated || !!authToken;

            if (!directProductId) {
              // Guard against the cart-empty redirect before clearing the cart.
              onCheckoutSubmitted();
              await clearCart();
            }

            // TEK ödeme yüzeyi: misafir + üye aynı site-içi kart formuna gider.
            if (paymentData.paymentId) {
              router.push(
                `/payment/${paymentData.paymentId}${hasSession ? "" : "?guest=true"}`,
              );
              return;
            } else if (paymentData.paymentUrl) {
              window.location.href = paymentData.paymentUrl;
              return;
            } else {
              throw new Error(t("payment.startFailed"));
            }
          } catch (paymentError: any) {
            const msg = paymentError.response?.data?.message ?? "";
            const stockoutKeywords = [
              "satışta değil",
              "stokta yok",
              "stokta bulunmamaktadır",
              "başkası tarafından",
              "başka alıcıya satıldı",
            ];
            const isStockout =
              (paymentError.response?.status === 400 ||
                paymentError.response?.status === 409) &&
              typeof msg === "string" &&
              stockoutKeywords.some((kw) =>
                msg.toLowerCase().includes(kw.toLowerCase()),
              );
            const stockoutProductId =
              paymentError.response?.data?.productId ||
              checkoutItems[0]?.productId;
            if (isStockout && stockoutProductId) {
              router.push(`/products/unavailable/${stockoutProductId}`);
              return;
            }
            toast.error(msg || t("checkout.paymentInitFailedRetry"));
            return;
          }
        }
      }

      // Beklenmeyen durum: sipariş oluştu ama ödeme adımına düşülemedi.
      toast.error(t("checkout.completePaymentFromOrders"));
      router.push("/profile/orders");
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("checkout.orderFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return { handleCheckout };
}
