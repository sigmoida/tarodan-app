/** @format */

"use client";

import Link from "next/link";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { MetricCard } from "@/components/MetricCard";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import { SECTION_PRESENTATION } from "../_lib/sections";
import type {
  ReconciliationLine,
  ReconciliationSection as Section,
} from "../_lib/types";

/** İşaretli tutar: negatif satırlar "−" ile. */
function SignedAmount({ amount }: { amount: number }) {
  if (amount < 0) return <span>−{fmtTry(Math.abs(amount))}</span>;
  return <span>{fmtTry(amount)}</span>;
}

function LineRow({
  line,
  label,
  syncEnabled,
  emphasis,
}: {
  line: ReconciliationLine;
  label: string;
  syncEnabled: boolean;
  emphasis?: boolean;
}) {
  const t = useTranslations();
  const text = (
    <span className={emphasis ? "font-semibold text-heading" : "text-body"}>
      {label}
      {line.count !== undefined && (
        <span className="ml-1 text-xs text-subtle">({line.count})</span>
      )}
      {line.syncDependent && !syncEnabled && (
        <Badge variant="warning" size="sm" className="ml-2">
          {t("admin.finance.overview.syncOff")}
        </Badge>
      )}
    </span>
  );
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      {line.href ? (
        <Link href={line.href} className="hover:underline">
          {text}
        </Link>
      ) : (
        text
      )}
      <span
        className={`tabular-nums ${emphasis ? "font-semibold text-heading" : ""}`}
      >
        <SignedAmount amount={line.amount} />
      </span>
    </div>
  );
}

/**
 * Sağlamalı bölüm: solda toplam kartı, sağda bileşen satırları, altta fark.
 *  - identity: fark = toplam − Σ bileşen; 0 → yeşil, değilse kırmızı.
 *  - waterfall: bileşenler işaretli; son satır "Sonuç" (toplam + Σ).
 *  - breakdown: bilgi; son bileşen "ayrıştırılamayan" kalan.
 */
export function ReconciliationSectionView({
  section,
  syncEnabled,
  loading,
}: {
  section: Section;
  syncEnabled: boolean;
  loading: boolean;
}) {
  const t = useTranslations();
  /** Satır anahtarları API'den gelir; i18n anahtarı çalışma zamanında kurulur. */
  const asKey = (k: string) => k as Parameters<typeof t>[0];
  const base = `admin.finance.overview.sections.${section.key}` as const;
  const { icon, tone } = SECTION_PRESENTATION[section.key];
  const needsSync =
    !syncEnabled &&
    (section.components.some((c) => c.syncDependent) ||
      section.result?.syncDependent);

  return (
    <SectionCard
      title={t(asKey(`${base}.title`))}
      actions={
        needsSync ? (
          <Badge
            variant="warning"
            title={t("admin.finance.overview.syncOffHint")}
          >
            {t("admin.finance.overview.syncOff")}
          </Badge>
        ) : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_2fr]">
        <MetricCard
          icon={icon}
          tone={tone}
          label={t(asKey(`${base}.total`))}
          value={fmtTry(section.total.amount)}
          loading={loading}
          footer={
            <span className="text-muted">
              {section.total.count !== undefined && `${section.total.count} · `}
              {t(`admin.finance.overview.scope.${section.scope}`)}
            </span>
          }
        />
        <div className="divide-y divide-border text-sm">
          {section.components.map((line) => (
            <LineRow
              key={line.key}
              line={line}
              label={t(asKey(`${base}.lines.${line.key}`))}
              syncEnabled={syncEnabled}
            />
          ))}
          {section.kind === "waterfall" && section.result && (
            <LineRow
              line={section.result}
              label={t(asKey(`${base}.lines.${section.result.key}`))}
              syncEnabled={syncEnabled}
              emphasis
            />
          )}
          {section.kind === "identity" && (
            <div
              className={`flex items-center justify-between gap-3 py-2 ${
                section.balanced
                  ? "text-success-700"
                  : "font-semibold text-danger-600"
              }`}
            >
              <span className="flex items-center gap-1">
                {section.balanced ? (
                  <CheckCircleIcon className="h-4 w-4" />
                ) : (
                  <ExclamationTriangleIcon className="h-4 w-4" />
                )}
                {section.balanced
                  ? t("admin.finance.overview.balanced")
                  : t("admin.finance.overview.difference")}
              </span>
              <span className="tabular-nums">
                <SignedAmount amount={section.difference} />
              </span>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
