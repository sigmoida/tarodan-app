/** @format */

"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  DevicePhoneMobileIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import {
  Badge,
  Button,
  Input,
  Modal,
  ModalFooter,
  PhoneInput,
  splitPhone,
  combinePhone,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import SectionCard from "@/components/ui/SectionCard";
import { useAuthStore } from "@/stores/authStore";
import {
  changePasswordSchema,
  type ChangePasswordValues,
} from "../_lib/schemas";
import {
  useChangePassword,
  usePhoneVerification,
  use2faStatus,
} from "../_hooks/useSecurity";

const EMPTY: ChangePasswordValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

/** Şifre kuralları — etiket katalogdan gelir, bu yüzden anahtar taşınır. */
const RULES = [
  { test: (p: string) => p.length >= 8, key: "profile.security.ruleMin8" },
  {
    test: (p: string) => /[A-Z]/.test(p),
    key: "profile.security.ruleUppercase",
  },
  {
    test: (p: string) => /[a-z]/.test(p),
    key: "profile.security.ruleLowercase",
  },
  { test: (p: string) => /\d/.test(p), key: "profile.security.ruleDigit" },
] as const;

function PhoneModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const { user } = useAuthStore();
  const { sendCode, verify } = usePhoneVerification();
  const [step, setStep] = useState<"enter" | "verify">("enter");
  const initial = splitPhone(user?.phone);
  const [phone, setPhone] = useState(initial.national);
  const [isLegacy, setIsLegacy] = useState(initial.isLegacy);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (open) {
      const p = splitPhone(user?.phone);
      setStep("enter");
      setPhone(p.national);
      setIsLegacy(p.isLegacy);
      setCode("");
    }
  }, [open, user?.phone]);

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
          <Input
            label={t("profile.verificationCode")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            maxLength={6}
          />
        </div>
      )}
    </Modal>
  );
}

/** Security: change password (RHF+zod) + SMS phone verification. */
export default function SecuritySection() {
  const t = useTranslations();
  const { user, isAuthenticated } = useAuthStore();
  const changePassword = useChangePassword();
  const { is2faEnabled } = use2faStatus(isAuthenticated);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const form = useZodForm(changePasswordSchema(t), { defaultValues: EMPTY });
  const newPassword = form.watch("newPassword") ?? "";

  const onSubmit = (values: ChangePasswordValues) =>
    changePassword.mutate(values, { onSuccess: () => form.reset(EMPTY) });

  return (
    <SectionCard
      title={t("profile.security.title")}
      action={
        <Button
          type="button"
          size="sm"
          onClick={form.handleSubmit(onSubmit)}
          isLoading={changePassword.isPending}
        >
          {t("profile.security.changePassword")}
        </Button>
      }
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="currentPassword"
          type="password"
          label={t("profile.security.currentPassword")}
          placeholder="••••••••"
          autoComplete="current-password"
        />
        <FormInput
          name="newPassword"
          type="password"
          label={t("auth.newPassword")}
          placeholder="••••••••"
          autoComplete="new-password"
        />
        <div className="flex flex-wrap gap-2">
          {RULES.map((r) => {
            const met = r.test(newPassword);
            return (
              <span
                key={r.key}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  met
                    ? "bg-surface-alt text-success-700"
                    : "bg-surface-alt text-subtle"
                }`}
              >
                {met ? "✓" : "○"} {t(r.key)}
              </span>
            );
          })}
        </div>
        <FormInput
          name="confirmPassword"
          type="password"
          label={t("profile.security.newPasswordRepeat")}
          placeholder="••••••••"
          autoComplete="new-password"
        />
      </Form>

      <div className="mt-6 flex items-center justify-between border-t border-border-subtle pt-5">
        <div className="flex items-center gap-3">
          <DevicePhoneMobileIcon className="h-5 w-5 text-primary-500" />
          <div>
            <p className="text-sm font-medium text-heading">
              {t("profile.security.phoneVerification")}
            </p>
            <p className="text-xs text-muted">
              {user?.isPhoneVerified
                ? t("profile.security.phoneVerified")
                : t("profile.security.phoneVerifyPrompt")}
            </p>
          </div>
        </div>
        {user?.isPhoneVerified ? (
          <Badge variant="success" size="sm">
            {t("profile.bank.verified")}
          </Badge>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPhoneOpen(true)}
          >
            {t("profile.verify")}
          </Button>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border-subtle pt-5">
        <div className="flex items-center gap-3">
          <ShieldCheckIcon className="h-5 w-5 text-primary-500" />
          <div>
            <p className="text-sm font-medium text-heading">
              {t("profile.security.twoFactor")}
            </p>
            <p className="text-xs text-muted">
              {is2faEnabled
                ? t("profile.security.twoFactorOn")
                : t("profile.security.twoFactorOff")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {is2faEnabled && (
            <Badge variant="success" size="sm">
              {t("common.active")}
            </Badge>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/profile/security">
              {is2faEnabled
                ? t("profile.security.manage")
                : t("profile.security.setUp")}
            </Link>
          </Button>
        </div>
      </div>

      <PhoneModal open={phoneOpen} onClose={() => setPhoneOpen(false)} />
    </SectionCard>
  );
}
