/** @format */

"use client";

import { useTranslations } from "next-intl";
import { Button, Input, Modal } from "@tarodan/ui";
import { Form, FormError, FormInput, useZodForm } from "@tarodan/ui/form";
import type { LegalIdentityStatus } from "@tarodan/types";
import type { useLegalIdentity } from "@/hooks/useLegalIdentity";
import { useAuthStore } from "@/stores/authStore";
import {
  legalIdentityGateSchema,
  legalIdentitySubmission,
  type LegalIdentityFormValues,
} from "@/lib/legalIdentity";

type Submit = ReturnType<typeof useLegalIdentity>["submit"];

/**
 * Kimlik penceresi — yasal ad, soyad ya da TCKN'si eksik üye (eski hesap,
 * Google/Apple ile açılan hesap, alanları göndermeyen mobil kaydı) siteyi
 * kullanmaya devam etmeden önce bunları girer.
 *
 * Kimin bekletileceğine sunucu karar verir (`GET /legal-identity/me`); ne
 * zaman gösterileceğine `RequiredStepsGate` (önce onaylar, sonra bu). Kapatılamaz:
 * tek çıkış kaydetmek ya da oturumu kapatmaktır. Yalnız eksik alanlar sorulur;
 * dolu olanlar salt-okunur görünür. TCKN, üyenin kendi banka hesabında geçerli
 * bir numara varsa onunla ön doldurulur; ad hiçbir kaynaktan tahmin edilmez.
 */
export default function LegalIdentityGate({
  status,
  submit,
}: {
  status: LegalIdentityStatus;
  submit: Submit;
}) {
  const t = useTranslations();
  const logout = useAuthStore((state) => state.logout);
  const { missing } = status;
  const asks = (field: (typeof missing)[number]) => missing.includes(field);

  const form = useZodForm(
    legalIdentityGateSchema(missing, {
      nameInvalid: t("identity.validation.nameInvalid"),
      nationalIdInvalid: t("identity.validation.nationalIdInvalid"),
    }),
    {
      defaultValues: {
        legalFirstName: "",
        legalLastName: "",
        nationalId: status.suggestedNationalId ?? "",
      },
    },
  );

  const onSubmit = (values: LegalIdentityFormValues) =>
    submit.mutate(legalIdentitySubmission(values, missing));

  return (
    <Modal
      isOpen
      onClose={() => undefined}
      title={t("identity.gate.title")}
      size="lg"
      showCloseButton={false}
      closeOnBackdrop={false}
      closeOnEscape={false}
      dismissDisabled
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => void logout()}
            disabled={submit.isPending}
          >
            {t("common.logout")}
          </Button>
          <Button
            className="w-full sm:w-auto"
            isLoading={submit.isPending}
            onClick={form.handleSubmit(onSubmit)}
          >
            {t("identity.gate.submit")}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">{t("identity.gate.intro")}</p>
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {asks("legalFirstName") ? (
            <FormInput
              name="legalFirstName"
              label={t("identity.legalFirstName")}
              helperText={t("identity.legalNameHint")}
              autoComplete="given-name"
            />
          ) : (
            <Input
              label={t("identity.legalFirstName")}
              value={status.legalFirstName ?? ""}
              disabled
            />
          )}
          {asks("legalLastName") ? (
            <FormInput
              name="legalLastName"
              label={t("identity.legalLastName")}
              autoComplete="family-name"
            />
          ) : (
            <Input
              label={t("identity.legalLastName")}
              value={status.legalLastName ?? ""}
              disabled
            />
          )}
        </div>
        {asks("nationalId") ? (
          <FormInput
            name="nationalId"
            label={t("identity.nationalId")}
            placeholder={t("identity.nationalIdPlaceholder")}
            helperText={
              status.suggestedNationalId
                ? t("identity.gate.prefilledHint")
                : undefined
            }
            inputMode="numeric"
            autoComplete="off"
            maxLength={11}
          />
        ) : (
          <Input
            label={t("identity.nationalId")}
            value={status.nationalIdMasked ?? ""}
            className="font-mono"
            disabled
          />
        )}
        <FormError />
        <p className="text-xs text-muted">{t("identity.gate.lockedNote")}</p>
      </Form>
    </Modal>
  );
}
