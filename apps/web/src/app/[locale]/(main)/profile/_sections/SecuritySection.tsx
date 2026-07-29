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
  getFullPhoneNumber,
  DEFAULT_COUNTRY_CODE,
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

const RULES = [
  { test: (p: string) => p.length >= 8, label: "En az 8 karakter" },
  { test: (p: string) => /[A-Z]/.test(p), label: "Büyük harf" },
  { test: (p: string) => /[a-z]/.test(p), label: "Küçük harf" },
  { test: (p: string) => /\d/.test(p), label: "Rakam" },
];

function PhoneModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const { user } = useAuthStore();
  const { sendCode, verify } = usePhoneVerification();
  const [step, setStep] = useState<"enter" | "verify">("enter");
  const initial = splitPhone(user?.phone || "");
  const [countryCode, setCountryCode] = useState(
    initial.countryCode || DEFAULT_COUNTRY_CODE,
  );
  const [phone, setPhone] = useState(initial.national);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (open) {
      const p = splitPhone(user?.phone || "");
      setStep("enter");
      setCountryCode(p.countryCode || DEFAULT_COUNTRY_CODE);
      setPhone(p.national);
      setCode("");
    }
  }, [open, user?.phone]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Telefon Doğrulama"
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={sendCode.isPending || verify.isPending}
      footer={
        <ModalFooter
          onCancel={step === "enter" ? onClose : () => setStep("enter")}
          onConfirm={
            step === "enter"
              ? () =>
                  sendCode.mutate(getFullPhoneNumber(countryCode, phone), {
                    onSuccess: () => setStep("verify"),
                  })
              : () => verify.mutate(code, { onSuccess: onClose })
          }
          cancelLabel={step === "enter" ? t("common.cancel") : t("common.back")}
          confirmLabel={step === "enter" ? "Kod Gönder" : "Doğrula"}
          isLoading={sendCode.isPending || verify.isPending}
          disabled={step === "enter" ? !phone : code.length !== 6}
        />
      }
    >
      {step === "enter" ? (
        <div className="space-y-4">
          <PhoneInput
            label="Telefon numarası"
            countryCode={countryCode}
            onCountryCodeChange={setCountryCode}
            phone={phone}
            onPhoneChange={setPhone}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label="Doğrulama kodu"
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
  const { user, isAuthenticated } = useAuthStore();
  const changePassword = useChangePassword();
  const { is2faEnabled } = use2faStatus(isAuthenticated);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const form = useZodForm(changePasswordSchema, { defaultValues: EMPTY });
  const newPassword = form.watch("newPassword") ?? "";

  const onSubmit = (values: ChangePasswordValues) =>
    changePassword.mutate(values, { onSuccess: () => form.reset(EMPTY) });

  return (
    <SectionCard
      title="Güvenlik"
      action={
        <Button
          type="button"
          size="sm"
          onClick={form.handleSubmit(onSubmit)}
          isLoading={changePassword.isPending}
        >
          Şifreyi Değiştir
        </Button>
      }
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="currentPassword"
          type="password"
          label="Mevcut Şifre"
          autoComplete="current-password"
        />
        <FormInput
          name="newPassword"
          type="password"
          label="Yeni Şifre"
          autoComplete="new-password"
        />
        <div className="flex flex-wrap gap-2">
          {RULES.map((r) => {
            const met = r.test(newPassword);
            return (
              <span
                key={r.label}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  met
                    ? "bg-surface-alt text-success-700"
                    : "bg-surface-alt text-subtle"
                }`}
              >
                {met ? "✓" : "○"} {r.label}
              </span>
            );
          })}
        </div>
        <FormInput
          name="confirmPassword"
          type="password"
          label="Yeni Şifre (Tekrar)"
          autoComplete="new-password"
        />
      </Form>

      <div className="mt-6 flex items-center justify-between border-t border-border-subtle pt-5">
        <div className="flex items-center gap-3">
          <DevicePhoneMobileIcon className="h-5 w-5 text-primary-500" />
          <div>
            <p className="text-sm font-medium text-heading">
              Telefon Doğrulama
            </p>
            <p className="text-xs text-muted">
              {user?.isPhoneVerified
                ? "Telefonunuz doğrulandı"
                : "Telefonunuzu SMS ile doğrulayın"}
            </p>
          </div>
        </div>
        {user?.isPhoneVerified ? (
          <Badge variant="success" size="sm">
            Doğrulandı
          </Badge>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPhoneOpen(true)}
          >
            Doğrula
          </Button>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border-subtle pt-5">
        <div className="flex items-center gap-3">
          <ShieldCheckIcon className="h-5 w-5 text-primary-500" />
          <div>
            <p className="text-sm font-medium text-heading">
              İki Adımlı Doğrulama (2FA)
            </p>
            <p className="text-xs text-muted">
              {is2faEnabled
                ? "Hesabınız TOTP ile korunuyor"
                : "Uygulama tabanlı ek güvenlik katmanı ekleyin"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {is2faEnabled && (
            <Badge variant="success" size="sm">
              Aktif
            </Badge>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/profile/security">
              {is2faEnabled ? "Yönet" : "Ayarla"}
            </Link>
          </Button>
        </div>
      </div>

      <PhoneModal open={phoneOpen} onClose={() => setPhoneOpen(false)} />
    </SectionCard>
  );
}
