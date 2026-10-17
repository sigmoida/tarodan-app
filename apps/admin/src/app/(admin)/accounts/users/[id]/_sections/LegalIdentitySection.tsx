"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@tarodan/ui";
import { LEGAL_IDENTITY_FIELD_I18N_KEYS } from "@tarodan/types";
import { MaskedValue } from "@/components/MaskedValue";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { useSession } from "@/context/SessionContext";
import { LegalIdentityCorrectionModal } from "../_modals/LegalIdentityCorrectionModal";
import { type UserDetail } from "../types";

/**
 * Yasal kimlik (ad, soyad, TCKN) — devlet bildirimi için. TCKN maskeli,
 * tıkla-göster. Eksikse kimlik kapısıyla aynı kuralla "Kimlik eksik" rozeti;
 * düzeltme yalnız super_admin / admin (sunucu da aynı rolleri ister).
 */
export function LegalIdentitySection({ user }: { user: UserDetail }) {
  const t = useTranslations();
  const { user: admin } = useSession();
  const [editing, setEditing] = useState(false);
  const canCorrect =
    !user.staff &&
    !user.deletedAt &&
    (admin.role === "super_admin" || admin.role === "admin");
  const missing = user.legalIdentityMissing ?? [];
  const notProvided = (
    <span className="font-normal text-subtle">
      {t("admin.users.legalIdentity.notProvided")}
    </span>
  );

  return (
    <SectionCard
      title={t("admin.users.legalIdentity.title")}
      actions={
        canCorrect ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {t("admin.users.legalIdentity.correct")}
          </Button>
        ) : undefined
      }
    >
      {missing.length > 0 && (
        <Badge className="mb-3" size="sm" variant="warning">
          {t("admin.users.legalIdentity.incomplete")} —{" "}
          {t("admin.users.legalIdentity.missingFields", {
            fields: missing
              .map((field) => t(LEGAL_IDENTITY_FIELD_I18N_KEYS[field]))
              .join(", "),
          })}
        </Badge>
      )}
      <DataList>
        <Field label={t("identity.legalFirstName")}>
          {user.legalFirstName ?? notProvided}
        </Field>
        <Field label={t("identity.legalLastName")}>
          {user.legalLastName ?? notProvided}
        </Field>
        <Field label={t("identity.nationalId")}>
          {user.nationalId ? (
            <MaskedValue value={user.nationalId} />
          ) : (
            notProvided
          )}
        </Field>
      </DataList>

      {editing && (
        <LegalIdentityCorrectionModal
          open
          onClose={() => setEditing(false)}
          userId={user.id}
          current={{
            legalFirstName: user.legalFirstName,
            legalLastName: user.legalLastName,
            nationalId: user.nationalId,
          }}
        />
      )}
    </SectionCard>
  );
}
