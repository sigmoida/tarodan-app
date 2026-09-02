/** @format */

"use client";

import { useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import SectionCard from "@tarodan/ui/section-card";
import {
  AttributeGroupChips,
  AttributeGroupSelect,
  type AttributeGroupFieldGroup,
} from "./AttributeGroupField";

interface ManufacturerAttributesCardProps {
  manufacturerList: Array<{ id: string; name: string }>;
  manufacturerAttrGroups: AttributeGroupFieldGroup[];
}

/** Bu sayının üstündeki gruplar çip yerine açılır liste olur. */
const CHIP_LIMIT = 20;

/**
 * Üreticiye özel nitelikler (ör. Hot Wheels serisi/nadirlik).
 *
 * Context yerine props alır: yeni ilan ve düzenleme formlarının ikisi de aynı
 * bölümü gösterir, ikisi de kendi veri kaynağından besler. Alan bağı ve hata
 * gösterimi `AttributeGroupField` ile genel grup kartıyla ortaktır. Zorunlu
 * yıldızı YOK: üreticiye bağlı grupların `isRequired` bayrağını ne şema ne
 * API zorlar; işaretlemek satıcıya olmayan bir kural anlatırdı.
 */
export default function ManufacturerAttributesCard({
  manufacturerList,
  manufacturerAttrGroups,
}: ManufacturerAttributesCardProps) {
  const t = useTranslations();
  const { watch } = useFormContext();
  const manufacturerId = watch("manufacturerId");

  if (manufacturerAttrGroups.length === 0) return null;

  const manufacturerName = manufacturerList.find(
    (m) => m.id === manufacturerId,
  )?.name;

  return (
    <SectionCard
      title={`${manufacturerName ?? ""} ${t("product.detailsSuffix")}`}
    >
      <p className="text-xs text-muted -mt-2 mb-4">
        {t("product.manufacturerAttrsHint")}
      </p>
      <div className="space-y-4">
        {manufacturerAttrGroups.map((group) =>
          group.attributes.length > CHIP_LIMIT ? (
            <AttributeGroupSelect
              key={group.slug}
              group={group}
              placeholder={t("product.selectAttribute", { name: group.name })}
            />
          ) : (
            <AttributeGroupChips key={group.slug} group={group} />
          ),
        )}
      </div>
    </SectionCard>
  );
}
