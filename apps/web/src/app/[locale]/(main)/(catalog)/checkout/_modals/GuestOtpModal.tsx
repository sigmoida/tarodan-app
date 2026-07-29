/** @format */

"use client";

import toast from "react-hot-toast";
import { Button, Input, Modal } from "@tarodan/ui";
import { useCheckout } from "../_context/CheckoutContext";

export default function GuestOtpModal() {
  const {
    t,
    isAuthenticated,
    guestEmail,
    guestOtpSending,
    guestOtpSentForEmail,
    guestOtpModalOpen,
    setGuestOtpModalOpen,
    guestEmailVerificationCode,
    setGuestEmailVerificationCode,
    guestOtpInputRef,
    confirmGuestOtpModal,
    requestGuestCheckoutOtp,
  } = useCheckout();

  const sendingForThisEmail =
    guestOtpSending && guestOtpSentForEmail !== guestEmail.trim().toLowerCase();

  return (
    <Modal
      isOpen={guestOtpModalOpen && !isAuthenticated}
      onClose={() => setGuestOtpModalOpen(false)}
      title={t("checkout.guestEmailVerifyTitle")}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {t("checkout.guestEmailModalBody")}
        </p>
        <p className="text-xs font-medium text-primary-600 break-all">
          {guestEmail.trim()}
        </p>
        {sendingForThisEmail ? (
          <p className="text-sm text-muted">
            {t("checkout.guestEmailModalSending")}
          </p>
        ) : null}
        <Input
          ref={guestOtpInputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={t("checkout.guestEmailOtpPlaceholder")}
          value={guestEmailVerificationCode}
          onChange={(e) =>
            setGuestEmailVerificationCode(
              e.target.value.replace(/\D/g, "").slice(0, 6),
            )
          }
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              /^\d{6}$/.test(guestEmailVerificationCode.replace(/\D/g, ""))
            ) {
              confirmGuestOtpModal();
            }
          }}
          className="text-center font-mono text-xl tracking-[0.35em]"
          maxLength={6}
          disabled={sendingForThisEmail}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="secondary"
            type="button"
            disabled={guestOtpSending || !guestEmail.trim()}
            onClick={async () => {
              const em = guestEmail.trim().toLowerCase();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
                toast.error(t("checkout.enterEmail"));
                return;
              }
              const ok = await requestGuestCheckoutOtp(em);
              if (ok) toast.success(t("checkout.guestEmailCodeSent"));
            }}
          >
            {guestOtpSending ? "…" : t("checkout.guestEmailSendCode")}
          </Button>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle pt-2">
          <Button
            variant="secondary"
            type="button"
            onClick={() => setGuestOtpModalOpen(false)}
          >
            {t("checkout.guestEmailModalCancel")}
          </Button>
          <Button type="button" onClick={confirmGuestOtpModal}>
            {t("checkout.guestEmailModalConfirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
