"use client";

import Link from "next/link";
import { CheckCircleIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { Form, FormInput, FormTextarea } from "@tarodan/ui/form";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { useTranslations } from "next-intl";
import { useUnsubscribe } from "../_hooks/useUnsubscribe";

export default function UnsubscribeClient() {
  const t = useTranslations();
  const { form, onSubmit, processing, unsubscribed, isSubmitting } =
    useUnsubscribe();

  if (processing) {
    return (
      <DocPage title={t("marketing.newsletter.unsubscribeTitle")}>
        <SectionCard className="text-center">
          <p className="text-muted">{t("checkout.processing")}</p>
        </SectionCard>
      </DocPage>
    );
  }

  if (unsubscribed) {
    return (
      <DocPage title={t("marketing.newsletter.unsubscribeTokenSuccess")}>
        <SectionCard className="text-center">
          <CheckCircleIcon className="mx-auto mb-4 h-14 w-14 text-success-500" />
          <p className="text-muted">
            {t("marketing.newsletter.unsubscribeSuccess")}
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
      title={t("marketing.newsletter.unsubscribeTitle")}
      description={t("marketing.newsletter.unsubscribeSubtitle")}
    >
      <SectionCard title={t("marketing.newsletter.unsubscribeByEmail")}>
        <Form form={form} onSubmit={onSubmit} className="space-y-4">
          <FormInput
            name="email"
            type="email"
            label={t("marketing.newsletter.emailLabel")}
            placeholder={t("marketing.newsletter.unsubscribeEmailPlaceholder")}
          />
          <FormTextarea
            name="feedback"
            label={t("marketing.newsletter.feedbackTitle")}
            placeholder={t("marketing.newsletter.feedbackPlaceholder")}
            rows={3}
          />
          <Button
            variant="primary"
            type="submit"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            leftIcon={<EnvelopeIcon className="h-5 w-5" />}
            className="w-full"
          >
            {t("marketing.newsletter.unsubscribeButton")}
          </Button>
        </Form>
      </SectionCard>

      <p className="text-center text-sm text-muted">
        <Link href="/newsletter" className="text-primary-500 hover:underline">
          {t("marketing.newsletter.subscribeAgain")}
        </Link>
      </p>
    </DocPage>
  );
}
