/** @format */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ordersApi } from "@/lib/api";
import { useTranslations } from "next-intl";
import type { CheckoutItem } from "../_lib/types";

type Translate = ReturnType<typeof useTranslations<never>>;

/**
 * Guest checkout contact + email OTP slice. Owns the guest name/email/phone and
 * country-code fields, the verification-code state, the modal open/focus state,
 * and the send/confirm flow (including the "email already registered → bounce to
 * login" 409 path). Extracted verbatim from the checkout context: payloads,
 * toasts, redirects, and effect deps are unchanged.
 */
export function useGuestOtp({
  checkoutItems,
  t,
  router,
  onVerified,
}: {
  checkoutItems: CheckoutItem[];
  t: Translate;
  router: { push: (href: string) => void };
  /** Kod doğrulandığında çağrılır — tek sayfada ödeme kaldığı yerden sürer. */
  onVerified: () => void;
}) {
  // Guest checkout fields
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhoneCountryCode, setGuestPhoneCountryCode] = useState("+90");
  const [guestEmailVerificationCode, setGuestEmailVerificationCode] =
    useState("");
  const [guestOtpSentForEmail, setGuestOtpSentForEmail] = useState<
    string | null
  >(null);

  // Guest email OTP send (mutation). The wrapper below keeps the original
  // boolean contract + 409 "already registered → login" bounce behavior.
  const sendOtpMutation = useMutation({
    mutationFn: (payload: { email: string; expectedCheckoutCount: number }) =>
      ordersApi.sendGuestVerificationCode(payload),
  });
  const guestOtpSending = sendOtpMutation.isPending;
  const [guestOtpModalOpen, setGuestOtpModalOpen] = useState(false);
  const guestOtpInputRef = useRef<HTMLInputElement>(null);

  // Guest OTP: reset the verified state if the email changes after a code was sent
  useEffect(() => {
    const n = guestEmail.trim().toLowerCase();
    if (!guestOtpSentForEmail) return;
    if (!n || n !== guestOtpSentForEmail) {
      setGuestOtpSentForEmail(null);
      setGuestEmailVerificationCode("");
      setGuestOtpModalOpen(false);
    }
  }, [guestEmail, guestOtpSentForEmail]);

  // Guest OTP modal: focus the input + close on Escape
  useEffect(() => {
    if (!guestOtpModalOpen) return;
    const focusTimer = window.setTimeout(
      () => guestOtpInputRef.current?.focus(),
      100,
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGuestOtpModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
    };
  }, [guestOtpModalOpen]);

  const sendGuestOtp = sendOtpMutation.mutateAsync;
  const requestGuestCheckoutOtp = useCallback(
    async (em: string): Promise<boolean> => {
      try {
        await sendGuestOtp({
          email: em,
          expectedCheckoutCount: Math.max(1, checkoutItems.length),
        });
        setGuestOtpSentForEmail(em);
        return true;
      } catch (e: any) {
        const data = e?.response?.data;
        // E-posta zaten kayıtlı (409) → misafir alışverişe izin verme; net mesaj
        // ver ve checkout'a geri dönecek şekilde giriş sayfasına yönlendir.
        if (
          e?.response?.status === 409 ||
          data?.code === "EMAIL_ALREADY_REGISTERED"
        ) {
          toast.error(
            typeof data?.message === "string"
              ? data.message
              : t("checkout.emailAlreadyRegistered"),
          );
          try {
            sessionStorage.setItem("login_redirect", "/cart/payment");
          } catch {
            /* sessionStorage erişilemezse query param yine yönlendirir */
          }
          router.push("/login?redirect=/cart/payment");
          return false;
        }
        const msg =
          data?.message ??
          (Array.isArray(data?.message) ? data.message.join(", ") : null);
        toast.error(
          typeof msg === "string"
            ? msg
            : t("checkout.guestEmailSendCodeFailed"),
        );
        return false;
      }
    },
    [checkoutItems.length, t, router, sendGuestOtp],
  );

  const confirmGuestOtpModal = () => {
    const digits = guestEmailVerificationCode.replace(/\D/g, "");
    if (!/^\d{6}$/.test(digits)) {
      toast.error(t("checkout.guestEmailOtpRequired"));
      return;
    }
    setGuestOtpModalOpen(false);
    onVerified();
  };

  return {
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
  };
}
