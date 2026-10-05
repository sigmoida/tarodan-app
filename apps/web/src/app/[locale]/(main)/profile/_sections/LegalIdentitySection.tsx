/** @format */

"use client";

import { useTranslations } from "next-intl";
import {
  LEGAL_IDENTITY_FIELD_I18N_KEYS,
  type LegalIdentityField,
} from "@tarodan/types";
import SectionCard from "@/components/ui/SectionCard";
import { useLegalIdentity } from "@/hooks/useLegalIdentity";

/**
 * Üyenin yasal kimliği — SALT OKUNUR. Kimlik kapısında bir kez girilir; üye
 * sonradan değiştiremez (düzeltme yalnız destek/admin üzerinden). TCKN
 * sunucudan maskeli gelir, tam numara istemciye hiç dönmez.
 */
export default function LegalIdentitySection() {
  const t = useTranslations();
  const { status, isLoading } = useLegalIdentity();

  const rows: Array<{
    key: LegalIdentityField;
    value: string | null;
    mono?: boolean;
  }> = [
    { key: "legalFirstName", value: status?.legalFirstName ?? null },
    { key: "legalLastName", value: status?.legalLastName ?? null },
    { key: "nationalId", value: status?.nationalIdMasked ?? null, mono: true },
  ];

  return (
    <SectionCard title={t("identity.profile.title")}>
      <p className="mb-4 text-sm text-muted">
        {t("identity.profile.description")}
      </p>
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface" />
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {rows.map(({ key, value, mono }) => (
              <div key={key}>
                <dt className="text-sm text-muted">
                  {t(LEGAL_IDENTITY_FIELD_I18N_KEYS[key])}
                </dt>
                <dd
                  className={
                    value
                      ? `mt-1 font-medium text-heading ${mono ? "font-mono" : ""}`
                      : "mt-1 text-sm text-subtle"
                  }
                >
                  {value ?? t("identity.profile.notProvided")}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">
            {t("identity.profile.lockedNote")}
          </p>
        </div>
      )}
    </SectionCard>
  );
}
