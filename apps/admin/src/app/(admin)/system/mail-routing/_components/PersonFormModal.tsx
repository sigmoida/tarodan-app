"use client";

import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import {
  FormCheckbox,
  FormInput,
  FormModal,
  useZodForm,
} from "@tarodan/ui/form";
import type { MailAreaState } from "@/lib/api/mail-routing.types";
import {
  areaLabel,
  normalizeEmail,
  notifiableAreas,
  personAreaField,
  personSchema,
  personToFormValues,
  planPersonChange,
  selectedAreaIds,
  type PersonFormValues,
  type PersonRow,
} from "../_lib/mail-routing";
import { usePersonChange } from "../_lib/useMailRoutingPage";

/**
 * Kişiyi birkaç alana birden ekle / çıkar. Her değişen alan için tek PATCH
 * gider (`planPersonChange`); dolu (20 alıcı) bir alana ekleme istenirse hiçbir
 * istek gönderilmez ve alanlar adlarıyla bildirilir.
 */
export function PersonFormModal({
  open,
  onClose,
  areas,
  person,
}: {
  open: boolean;
  onClose: () => void;
  areas: readonly MailAreaState[];
  person?: PersonRow;
}) {
  const t = useTranslations();
  const form = useZodForm(personSchema(t, areas), {
    defaultValues: personToFormValues(areas, person),
  });
  const save = usePersonChange({ onSuccess: onClose });

  const submit = (values: PersonFormValues) => {
    const plan = planPersonChange(
      areas,
      normalizeEmail(String(values.address)),
      selectedAreaIds(values, areas),
    );
    if (plan.overLimit.length > 0) {
      toast.error(
        t("admin.mailRouting.people.overLimit", {
          areas: plan.overLimit.map((id) => areaLabel(t, id)).join(", "),
        }),
      );
      return;
    }
    if (plan.updates.length === 0) onClose();
    else save.mutate(plan);
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        person
          ? t("admin.mailRouting.people.editTitle")
          : t("admin.mailRouting.people.addTitle")
      }
      form={form}
      onSubmit={submit}
      isSubmitting={save.isPending}
      submitLabel={t("common.save")}
    >
      <FormInput
        name="address"
        type="email"
        label={t("admin.mailRouting.people.address")}
        disabled={Boolean(person)}
      />
      <div className="space-y-2">
        <p className="text-sm font-medium text-heading">
          {t("admin.mailRouting.people.areasLabel")}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {notifiableAreas(areas).map((area) => (
            <FormCheckbox
              key={area.id}
              name={personAreaField(area.id)}
              label={areaLabel(t, area.id)}
            />
          ))}
        </div>
      </div>
    </FormModal>
  );
}
