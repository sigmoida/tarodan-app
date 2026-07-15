"use client";

import { Link } from "@/i18n/navigation";
import {
  QuestionMarkCircleIcon,
  ChatBubbleLeftRightIcon,
  PhoneIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { HELP_CATEGORIES, POPULAR_TOPICS, QUICK_LINKS } from "../_lib/data";

export default function HelpClient() {
  const t = useTranslations();

  return (
    <DocPage
      title={t("help.title")}
      description={t("help.subtitle")}
      actions={
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => (
            <ButtonLink
              key={link.labelKey}
              variant="secondary"
              size="sm"
              href={link.href}
              className="gap-1.5"
            >
              <link.icon className="w-4 h-4" />
              {t(link.labelKey)}
            </ButtonLink>
          ))}
        </div>
      }
    >
      {/* Help category grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {HELP_CATEGORIES.map((category) => (
          <SectionCard key={category.title}>
            <div
              className={`w-12 h-12 ${category.color} rounded-xl flex items-center justify-center mb-4`}
            >
              <category.icon className="w-6 h-6 text-inverted" />
            </div>
            <h3 className="font-semibold text-heading mb-2">
              {category.title}
            </h3>
            <p className="text-sm text-muted mb-4">{category.description}</p>
            <ul className="space-y-2">
              {category.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-primary-500 hover:text-primary-600 hover:underline"
                  >
                    {link.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        ))}
      </div>

      {/* Popular topics */}
      <SectionCard title={t("help.popularTopics")}>
        <div className="grid md:grid-cols-2 gap-3">
          {POPULAR_TOPICS.map((item) => (
            <Link
              key={item.q}
              href={item.href}
              className="flex items-center gap-3 p-4 rounded-lg border border-border-subtle hover:border-primary-200 hover:bg-primary-50 transition-colors"
            >
              <QuestionMarkCircleIcon className="w-5 h-5 text-primary-500 flex-shrink-0" />
              <span className="text-body">{item.q}</span>
            </Link>
          ))}
        </div>
      </SectionCard>

      {/* Still need help */}
      <SectionCard title={t("help.needMoreHelp")}>
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <div>
            <p className="text-muted mb-4">
              {t("help.supportReady")} {t("help.businessHours")}
            </p>
            <div className="space-y-2 text-sm text-body">
              <div className="flex items-center gap-3">
                <EnvelopeIcon className="w-5 h-5 text-primary-500" />
                <span>destek@tarodan.com</span>
              </div>
              <div className="flex items-center gap-3">
                <PhoneIcon className="w-5 h-5 text-primary-500" />
                <span>0850 XXX XX XX</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <ButtonLink
              variant="primary"
              href="/contact"
              className="flex-1 gap-1.5"
            >
              <ChatBubbleLeftRightIcon className="w-5 h-5" />
              {t("help.contactForm")}
            </ButtonLink>
            <ButtonLink
              variant="secondary"
              href="/faq"
              className="flex-1 gap-1.5"
            >
              <QuestionMarkCircleIcon className="w-5 h-5" />
              {t("footer.faq")}
            </ButtonLink>
          </div>
        </div>
      </SectionCard>
    </DocPage>
  );
}
