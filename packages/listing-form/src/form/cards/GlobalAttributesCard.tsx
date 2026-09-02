/** @format */

"use client";

import { useTranslations } from "next-intl";
import SectionCard from "@tarodan/ui/section-card";
import type { AttributeGroup, AttributeGroupsStatus } from "../queries";
import { AttributeGroupSelect } from "./AttributeGroupField";
import { optionPlaceholder } from "./option-text";

interface GlobalAttributesCardProps {
  attrGroups: AttributeGroup[];
  attrGroupsStatus: AttributeGroupsStatus;
}

/**
 * "Ek Özellikler" — admin'in kataloğa eklediği, her ilanda sorulan genel
 * özel gruplar (ör. Nadirlik/Bulunabilirlik). Her grup TEK seçimlidir;
 * zorunlu olanlar yıldızla işaretlenir ve şema/API tarafından zorlanır.
 *
 * Yükleme anında ve katalog boşken kart çizilmez (görünmeyen bir bölüm
 * "bozuk" hissi vermez). İstek düştüyse sebep yazılır: satıcı zorunlu bir
 * alanın neden yok olduğunu ancak API 400'ünden öğrenmemeli.
 */
export default function GlobalAttributesCard({
  attrGroups,
  attrGroupsStatus,
}: GlobalAttributesCardProps) {
  const t = useTranslations();

  if (attrGroups.length === 0) {
    if (attrGroupsStatus !== "failed") return null;
    return (
      <SectionCard title={t("product.additionalDetails")}>
        <p className="text-sm text-danger-600">
          {t("product.optionsLoadFailed")}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("product.additionalDetails")}>
      <p className="text-xs text-muted -mt-2 mb-4">
        {t("product.globalAttrsHint")}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {attrGroups.map((group) => {
          const field = optionPlaceholder(
            attrGroupsStatus,
            group.attributes.length,
            {
              loading: t("common.loading"),
              failed: t("product.optionsLoadFailed"),
              empty: t("product.noOptionsDefined"),
              ready: t("product.selectAttribute", { name: group.name }),
            },
          );
          return (
            <AttributeGroupSelect
              key={group.slug}
              group={group}
              placeholder={field.placeholder}
              disabled={field.disabled}
              required={group.isRequired}
            />
          );
        })}
      </div>
    </SectionCard>
  );
}
