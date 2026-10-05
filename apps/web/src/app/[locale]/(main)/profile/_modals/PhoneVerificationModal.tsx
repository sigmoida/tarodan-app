/** @format */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Input,
  Modal,
  ModalFooter,
  PhoneInput,
  splitPhone,
  combinePhone,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/authStore";
import { usePhoneVerification } from "../_hooks/useSecurity";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * A number the user has just saved on their profile. When set, the code is
   * sent as the dialog opens and it starts on the code step — saving a phone
   * and proving it are one motion, not two screens the user has to connect.
   */
  pendingPhone?: string | null;
}

/** SMS phone verification: enter the number, then the 6-digit code. */
export default function PhoneVerificationModal({
  open,
  onClose,
  pendingPhone,
}: Props) {
  const t = useTranslations();
  const { user } = useAuthStore();
  const { sendCode, verify } = usePhoneVerification();
  const [step, setStep] = useState<"enter" | "verify">("enter");
  const [phone, setPhone] = useState("");
  const [isLegacy, setIsLegacy] = useState(false);
  const [code, setCode] = useState("");
  // The number this opening already sent a code to. Saving the profile also
  // refreshes the user, and without this guard a re-run would send a second
  // SMS straight into the API's 60 s resend cooldown.
  const autoSentFor = useRef<string | null>(null);

  const seedPhone = pendingPhone ?? user?.phone;

  useEffect(() => {
    if (!open) {
      autoSentFor.current = null;
      return;
    }
    if (pendingPhone && autoSentFor.current === pendingPhone) return;
    const seed = splitPhone(seedPhone);
    setStep("enter");
    setPhone(seed.national);
    setIsLegacy(seed.isLegacy);
    setCode("");
    if (pendingPhone) {
      autoSentFor.current = pendingPhone;
      sendCode.mutate(pendingPhone, { onSuccess: () => setStep("verify") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seedPhone]); // sendCode.mutate is stable; pendingPhone is in seedPhone

  // "" until the national part is a complete Turkish mobile — this is what gates
  // the submit button, so an incomplete number can never reach the API.
  const fullPhone = combinePhone(phone);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("profile.security.phoneVerification")}
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={sendCode.isPending || verify.isPending}
      footer={
        <ModalFooter
          onCancel={step === "enter" ? onClose : () => setStep("enter")}
          onConfirm={
            step === "enter"
              ? () =>
                  sendCode.mutate(fullPhone, {
                    onSuccess: () => setStep("verify"),
                  })
              : () => verify.mutate(code, { onSuccess: onClose })
          }
          cancelLabel={step === "enter" ? t("common.cancel") : t("common.back")}
          confirmLabel={
            step === "enter" ? t("profile.sendCode") : t("profile.verify")
          }
          isLoading={sendCode.isPending || verify.isPending}
          disabled={step === "enter" ? !fullPhone : code.length !== 6}
        />
      }
    >
      {step === "enter" ? (
        <div className="space-y-4">
          <PhoneInput
            label={t("profile.security.phoneNumber")}
            phone={phone}
            onPhoneChange={(next) => {
              setPhone(next);
              setIsLegacy(false);
            }}
            helperText={
              isLegacy ? t("validation.phoneLegacyNotice") : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {t.rich("profile.security.phoneCodeSentTo", {
              phone: fullPhone,
              b: (chunks) => <strong className="text-heading">{chunks}</strong>,
            })}
          </p>
          <Input
            label={t("profile.verificationCode")}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            maxLength={6}
            inputMode="numeric"
          />
        </div>
      )}
    </Modal>
  );
}
