"use client";

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import {
  Form,
  FormInput,
  FormPhone,
  FormSelect,
  FormSearchableSelect,
  FormCheckbox,
  FormError,
  useZodForm,
} from "@tarodan/ui/form";
import {
  businessRegisterSchema,
  type BusinessRegisterValues,
} from "../_lib/auth";
import { getCityNames } from "@/lib/turkeyLocations";
import { AuthCard } from "./AuthCard";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useRegisterBusiness } from "../_hooks/useRegisterBusiness";

// Company types
const COMPANY_TYPES = [
  "Limited Şirket",
  "Anonim Şirket",
  "Kollektif Şirket",
  "Komandit Şirket",
  "Şahıs İşletmesi",
  "Diğer",
];

export function RegisterBusinessForm() {
  const t = useTranslations();
  const locale = useLocale();
  const { registrationSuccess, registeredEmail, submit, resendVerification } =
    useRegisterBusiness();

  const form = useZodForm(businessRegisterSchema(locale), {
    defaultValues: {
      companyName: "",
      email: "",
      phone: "",
      companyType: "",
      taxId: "",
      city: "",
      district: "",
      password: "",
      confirmPassword: "",
      agreeTerms: false,
    },
  });

  // City → district cascade: whenever the selected city changes, clear the
  // district so a stale value can't outlive its city (matches the original).
  const city = form.watch("city");
  useEffect(() => {
    form.setValue("district", "");
  }, [city, form]);

  // Registration success screen
  if (registrationSuccess) {
    return (
      <AuthCard
        title={t("auth.checkYourEmail")}
        description={t("auth.verificationLinkSentColon")}
      >
        <p className="font-semibold text-body">{registeredEmail}</p>

        <div className="mt-4 rounded-xl border border-info-200 bg-info-50 p-4">
          <p className="mb-2 text-sm text-info-800">{t("auth.nextSteps")}</p>
          <ol className="list-inside list-decimal space-y-1 text-sm text-info-700">
            <li>{t("auth.step1OpenInbox")}</li>
            <li>{t("auth.step2FindEmail")}</li>
            <li>{t("auth.step3ClickLink")}</li>
            <li>{t("auth.step4Login")}</li>
          </ol>
        </div>

        <div className="mt-6 space-y-3">
          <ButtonLink href="/login" className="w-full">
            {t("auth.goToLogin")}
          </ButtonLink>

          <Button
            variant="secondary"
            onClick={resendVerification}
            className="w-full"
          >
            {t("auth.resendVerificationEmail")}
          </Button>
        </div>
      </AuthCard>
    );
  }

  const onSubmit = (values: BusinessRegisterValues) =>
    submit({
      companyName: values.companyName,
      email: values.email,
      phone: values.phone,
      companyType: values.companyType ?? "",
      taxId: values.taxId,
      city: values.city,
      district: values.district ?? "",
      password: values.password,
      confirmPassword: values.confirmPassword,
      agreeTerms: values.agreeTerms,
    });

  return (
    <AuthCard
      title={t("auth.businessAccountTitle")}
      description={t("auth.businessAccountDesc")}
      footer={
        <>
          <p>
            {t("auth.hasAccount")}{" "}
            <Link
              href="/login"
              className="font-semibold text-primary-600 hover:text-primary-700"
            >
              {t("common.login")}
            </Link>
          </p>
          <p className="mt-2">
            {t("auth.notABusiness")}{" "}
            <Link
              href="/register"
              className="font-semibold text-primary-600 hover:text-primary-700"
            >
              {t("auth.registerAsIndividual")}
            </Link>
          </p>
        </>
      }
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="companyName"
          label={`${t("auth.companyName")} *`}
          placeholder={t("auth.companyName")}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            name="email"
            type="email"
            label={`${t("auth.email")} *`}
            placeholder={t("auth.emailPlaceholder")}
          />

          <FormPhone name="phone" label={`${t("auth.phone")} *`} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormSelect name="companyType" label={`${t("auth.companyType")} *`}>
            <option value="">{t("auth.selectCompanyType")}</option>
            {COMPANY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </FormSelect>

          <FormInput
            name="taxId"
            label={`${t("auth.taxId")} *`}
            placeholder={t("auth.taxIdPlaceholder")}
            inputMode="numeric"
            maxLength={11}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormSearchableSelect
            name="city"
            label={`${t("checkout.city")} *`}
            options={getCityNames().map((cityName) => ({
              value: cityName,
              label: cityName,
            }))}
            placeholder={t("common.selectCity")}
            searchPlaceholder={t("common.searchCity")}
            emptyText={t("common.noResults")}
          />

          <FormInput
            name="district"
            label={`${t("checkout.district")} *`}
            placeholder={t("checkout.district")}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            name="password"
            type="password"
            label={`${t("auth.password")} *`}
            placeholder="••••••••"
          />

          <FormInput
            name="confirmPassword"
            type="password"
            label={`${t("auth.confirmPassword")} *`}
            placeholder="••••••••"
          />
        </div>

        <FormCheckbox
          name="agreeTerms"
          label={t.rich("auth.termsAgreeBusinessRich", {
            terms: (chunks) => (
              <Link
                href="/terms"
                className="text-primary-600 hover:text-primary-700"
              >
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link
                href="/privacy"
                className="text-primary-600 hover:text-primary-700"
              >
                {chunks}
              </Link>
            ),
          })}
        />

        <FormError />

        <Button
          type="submit"
          isLoading={form.formState.isSubmitting}
          className="w-full"
        >
          {t("auth.registerBusinessAccount")}
        </Button>
      </Form>
    </AuthCard>
  );
}
