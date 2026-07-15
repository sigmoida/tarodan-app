"use client";

import { Link } from "@/i18n/navigation";
import { CheckCircleIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { Form, FormCheckbox, FormInput } from "@tarodan/ui/form";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/authStore";
import { useNewsletterSignup } from "../_hooks/useNewsletterSignup";

export default function NewsletterClient() {
  const t = useTranslations();
  const { isAuthenticated } = useAuthStore();
  const { form, onSubmit, isSubmitting, success } = useNewsletterSignup();

  if (success) {
    return (
      <DocPage title={t("marketing.newsletter.successTitle")}>
        <SectionCard className="text-center">
          <CheckCircleIcon className="mx-auto mb-4 h-14 w-14 text-success-500" />
          <p className="text-muted">
            {t("marketing.newsletter.successMessage")}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block font-medium text-primary-500 hover:underline"
          >
            {t("utility.notFound.goHome")}
          </Link>
        </SectionCard>
      </DocPage>
    );
  }

  return (
    <DocPage
      title={t("marketing.newsletter.title")}
      description={t("marketing.newsletter.subtitle")}
    >
      {isAuthenticated && (
        <div className="rounded-lg border border-info-200 bg-info-50 p-4 text-sm text-info-800">
          {t("marketing.newsletter.manageInSettings")}{" "}
          <Link href="/profile" className="font-semibold underline">
            {t("marketing.newsletter.manageInSettingsLink")}
          </Link>
          .
        </div>
      )}

      <SectionCard title={t("marketing.newsletter.benefitsTitle")}>
        <ul className="mb-6 space-y-2 text-sm text-muted">
          <li>• {t("marketing.newsletter.benefit1")}</li>
          <li>• {t("marketing.newsletter.benefit2")}</li>
          <li>• {t("marketing.newsletter.benefit3")}</li>
        </ul>

        <Form form={form} onSubmit={onSubmit} className="space-y-5">
          <FormInput
            name="email"
            type="email"
            label={t("marketing.newsletter.emailLabel")}
            placeholder={t("marketing.newsletter.emailPlaceholder")}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium text-body">
              {t("marketing.newsletter.preferencesTitle")}
            </p>
            <FormCheckbox
              name="newsletter"
              label={t("marketing.newsletter.prefNewsletter")}
            />
            <FormCheckbox
              name="promotions"
              label={t("marketing.newsletter.prefPromotions")}
            />
          </div>

          <Button
            variant="primary"
            type="submit"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            leftIcon={<EnvelopeIcon className="h-5 w-5" />}
            className="w-full"
          >
            {t("marketing.newsletter.subscribeButton")}
          </Button>
        </Form>
      </SectionCard>

      <p className="text-center text-sm text-muted">
        <Link href="/privacy" className="text-primary-500 hover:underline">
          {t("footer.privacy")}
        </Link>
      </p>
    </DocPage>
  );
}
