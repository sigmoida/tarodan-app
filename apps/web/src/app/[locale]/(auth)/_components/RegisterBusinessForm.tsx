"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import {
  Form,
  FormInput,
  FormPhone,
  FormTextarea,
  FormCheckbox,
  FormError,
  useZodForm,
} from "@tarodan/ui/form";
import {
  businessRegisterSchema,
  type BusinessRegisterValues,
} from "../_lib/auth";
import { AuthCard } from "./AuthCard";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useRegisterBusiness } from "../_hooks/useRegisterBusiness";
import { RegisterAccountTabs } from "./RegisterAccountTabs";

export function RegisterBusinessForm() {
  const t = useTranslations();
  const locale = useLocale();
  const { registrationSuccess, registeredEmail, submit } =
    useRegisterBusiness();

  const form = useZodForm(businessRegisterSchema(locale), {
    defaultValues: {
      authorizedFullName: "",
      companyLegalName: "",
      companyTitle: "",
      companyAddress: "",
      companyEmail: "",
      kepAddress: "",
      phone: "",
      agreeTerms: false,
    },
  });

  if (registrationSuccess) {
    return (
      <AuthCard
        title={t("auth.corporateApplicationReceived")}
        description={t("auth.corporateApplicationReceivedDescription")}
      >
        <p className="font-semibold text-body">{registeredEmail}</p>
        <div className="mt-4 border border-info-200 bg-info-50 p-4">
          <p className="text-sm leading-6 text-info-800">
            {t("auth.corporateApplicationNextStep")}
          </p>
        </div>
        <ButtonLink href="/" className="mt-6 w-full">
          {t("auth.goToHome")}
        </ButtonLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("auth.businessAccountTitle")}
      description={t("auth.businessAccountDesc")}
      footer={
        <p>
          {t("auth.hasAccount")}{" "}
          <Link
            href="/login"
            className="font-semibold text-primary-600 hover:text-primary-700"
          >
            {t("common.login")}
          </Link>
        </p>
      }
    >
      <div className="mb-5">
        <RegisterAccountTabs active="corporate" />
      </div>

      <Form
        form={form}
        onSubmit={(values: BusinessRegisterValues) => submit(values)}
        className="space-y-4"
      >
        <FormInput
          name="authorizedFullName"
          label={`${t("auth.authorizedFullName")} *`}
          placeholder={t("auth.authorizedFullNamePlaceholder")}
          autoComplete="name"
        />

        <FormInput
          name="companyLegalName"
          label={`${t("auth.companyLegalName")} *`}
          placeholder={t("auth.companyLegalNamePlaceholder")}
        />

        <FormInput
          name="companyTitle"
          label={`${t("auth.companyTitle")} *`}
          placeholder={t("auth.companyTitlePlaceholder")}
        />

        <FormTextarea
          name="companyAddress"
          label={`${t("auth.companyAddress")} *`}
          placeholder={t("auth.companyAddressPlaceholder")}
          rows={3}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput
            name="companyEmail"
            type="email"
            label={`${t("auth.companyEmail")} *`}
            placeholder={t("auth.companyEmailPlaceholder")}
            autoComplete="email"
          />
          <FormInput
            name="kepAddress"
            type="email"
            label={`${t("auth.kepAddress")} *`}
            placeholder={t("auth.kepAddressPlaceholder")}
          />
        </div>

        <FormPhone
          name="phone"
          label={`${t("auth.companyPhone")} *`}
          required
        />

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
          {t("auth.submitCorporateApplication")}
        </Button>
      </Form>
    </AuthCard>
  );
}
