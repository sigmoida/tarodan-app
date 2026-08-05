/** @format */

"use client";

import { useEffect, useState } from "react";
import { Button, Input, Modal, ModalFooter } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import {
  Form,
  FormDatePicker,
  FormInput,
  FormPhone,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import SectionCard from "@/components/ui/SectionCard";
import { useAuthStore } from "@/stores/authStore";
import UsernameField from "../_components/UsernameField";
import { profileInfoSchema, type ProfileInfoValues } from "../_lib/schemas";
import {
  useProfileInfo,
  useUpdateProfile,
  useEmailChange,
} from "../_hooks/useProfileInfo";

const EMPTY: ProfileInfoValues = {
  displayName: "",
  phone: "",
  birthDate: "",
  bio: "",
  companyName: "",
  taxId: "",
  taxOffice: "",
};

/** Two-step email change: send a code to the NEW address, then verify it. The
 *  current email keeps working until the code is confirmed. */
function EmailChangeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { sendCode, verify } = useEmailChange();
  const [step, setStep] = useState<"enter" | "verify">("enter");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (open) {
      setStep("enter");
      setEmail("");
      setCode("");
    }
  }, [open]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="E-posta Değiştir"
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={sendCode.isPending || verify.isPending}
      footer={
        <ModalFooter
          onCancel={step === "enter" ? onClose : () => setStep("enter")}
          onConfirm={
            step === "enter"
              ? () =>
                  sendCode.mutate(email.trim(), {
                    onSuccess: () => setStep("verify"),
                  })
              : () => verify.mutate(code, { onSuccess: onClose })
          }
          cancelLabel={step === "enter" ? t("common.cancel") : t("common.back")}
          confirmLabel={step === "enter" ? "Kod Gönder" : "Doğrula"}
          isLoading={sendCode.isPending || verify.isPending}
          disabled={step === "enter" ? !email.trim() : code.length !== 6}
        />
      }
    >
      {step === "enter" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Yeni e-posta adresinize 6 haneli bir doğrulama kodu göndereceğiz.
            Mevcut e-postanız kod doğrulanana kadar geçerli kalır.
          </p>
          <Input
            label="Yeni e-posta"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="yeni@ornek.com"
            autoComplete="email"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            <strong className="text-heading">{email}</strong> adresine
            gönderilen 6 haneli kodu girin.
          </p>
          <Input
            label="Doğrulama kodu"
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

/** Personal (+ business) info — independent query, RHF+zod form, own save button. */
export default function ProfileInfoSection() {
  const { isAuthenticated, user } = useAuthStore();
  const { profile, isLoading } = useProfileInfo(isAuthenticated);
  const updateProfile = useUpdateProfile();

  const isBusiness =
    (profile?.membershipTier ?? user?.membershipTier) === "business";
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  const form = useZodForm(profileInfoSchema, { defaultValues: EMPTY });

  useEffect(() => {
    if (!profile) return;
    form.reset({
      displayName: profile.displayName || "",
      phone: profile.phone || "",
      birthDate: profile.birthDate
        ? new Date(profile.birthDate).toISOString().split("T")[0]
        : "",
      bio: profile.bio || "",
      companyName: profile.companyName || "",
      taxId: profile.taxId || "",
      taxOffice: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const onSubmit = (values: ProfileInfoValues) => {
    const payload: Record<string, unknown> = { ...values };
    if (!isBusiness) {
      delete payload.companyName;
      delete payload.taxId;
      delete payload.taxOffice;
    }
    updateProfile.mutate(payload);
  };

  return (
    <SectionCard
      title="Profil Bilgileri"
      action={
        <Button
          type="button"
          size="sm"
          onClick={form.handleSubmit(onSubmit)}
          isLoading={updateProfile.isPending}
        >
          Kaydet
        </Button>
      }
    >
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      ) : (
        <Form form={form} onSubmit={onSubmit} className="space-y-4">
          <FormInput
            name="displayName"
            label="Görünen İsim"
            placeholder="Adınız"
          />

          <UsernameField />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-heading">
              E-posta
            </label>
            <div className="flex items-center gap-2">
              <div className="flex h-10 flex-1 items-center truncate rounded-lg border border-border bg-surface px-3 text-sm text-muted">
                {profile?.email || "—"}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmailModalOpen(true)}
              >
                Değiştir
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormPhone name="phone" label="Telefon" />
            <FormDatePicker name="birthDate" label="Doğum Tarihi" />
          </div>
          <FormTextarea
            name="bio"
            label="Hakkımda"
            placeholder="Kendiniz hakkında birkaç şey yazın..."
            rows={4}
            maxLength={500}
          />

          {isBusiness && (
            <div className="space-y-4 rounded-lg border border-border-subtle bg-surface p-4">
              <p className="text-sm font-semibold text-heading">
                İşletme Bilgileri
              </p>
              <FormInput
                name="companyName"
                label="Şirket / Ticari Unvan"
                placeholder="ABC Ltd. Şti."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FormInput
                  name="taxId"
                  label="Vergi Kimlik No"
                  placeholder="1234567890"
                />
                <FormInput
                  name="taxOffice"
                  label="Vergi Dairesi"
                  placeholder="Kadıköy VD"
                />
              </div>
            </div>
          )}
        </Form>
      )}

      <EmailChangeModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
      />
    </SectionCard>
  );
}
