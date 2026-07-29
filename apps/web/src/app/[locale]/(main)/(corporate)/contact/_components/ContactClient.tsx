"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { Form, FormInput, FormTextarea } from "@tarodan/ui/form";
import { SectionCard } from "@/components/ui";
import { DocPage } from "@/components/layout/DocPage";
import { useContactForm } from "../_hooks/useContactForm";

export default function ContactClient() {
  const t = useTranslations();
  const { form, onSubmit, isSending } = useContactForm();

  return (
    <DocPage title={t("contact.title")} description={t("contact.subtitle")}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Contact info */}
        <SectionCard title={t("information.contactInfo.title")}>
          <dl className="space-y-3 text-sm text-body">
            <div>
              <dt className="text-muted">
                {t("information.contactInfo.email")}
              </dt>
              <dd>
                <a
                  href={`mailto:${t("information.contactInfo.emailValue")}`}
                  className="text-primary-600 hover:underline"
                >
                  {t("information.contactInfo.emailValue")}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-muted">
                {t("information.contactInfo.phone")}
              </dt>
              <dd>{t("information.contactInfo.phoneValue")}</dd>
            </div>
            <div>
              <dt className="text-muted">
                {t("information.contactInfo.address")}
              </dt>
              <dd>{t("information.contactInfo.addressValue")}</dd>
            </div>
          </dl>
        </SectionCard>

        {/* Form */}
        <SectionCard className="lg:col-span-2">
          <Form form={form} onSubmit={onSubmit} className="space-y-5">
            <FormInput
              name="name"
              label={t("contact.name")}
              placeholder={t("contact.namePlaceholder")}
            />
            <FormInput
              name="email"
              type="email"
              label={t("contact.email")}
              placeholder={t("contact.emailPlaceholder")}
            />
            <FormInput
              name="subject"
              label={t("contact.subject")}
              placeholder={t("contact.subjectPlaceholder")}
            />
            <FormTextarea
              name="message"
              label={t("contact.message")}
              placeholder={t("contact.messagePlaceholder")}
              rows={6}
            />
            <Button
              variant="primary"
              type="submit"
              isLoading={isSending}
              disabled={isSending}
              className="w-full"
            >
              {t("contact.send")}
            </Button>
          </Form>
        </SectionCard>
      </div>
    </DocPage>
  );
}
