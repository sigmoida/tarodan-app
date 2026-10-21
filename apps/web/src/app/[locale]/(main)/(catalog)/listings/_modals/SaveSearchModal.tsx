/** @format */

"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Alert } from "@tarodan/ui";
import { FormInput, FormModal, useZodForm } from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useFormModalLabels } from "@/hooks/useFormModalLabels";
import { useSavedSearchUpgrade } from "@/hooks/useSavedSearchUpgrade";
import {
  saveSearchSchema,
  type SaveSearchValues,
} from "../_lib/saveSearchSchema";
import type { SaveSearchRefusal } from "../_hooks/useSaveSearch";

interface SaveSearchModalProps {
  open: boolean;
  onClose: () => void;
  /** Prefill: the automatic name of the current search. */
  defaultName: string;
  refusal: SaveSearchRefusal | null;
  isSaving: boolean;
  onSave: (name: string) => void;
}

/** "Save this search" dialog: a name field plus the 409 / 403 refusals inline. */
export default function SaveSearchModal({
  open,
  onClose,
  defaultName,
  refusal,
  isSaving,
  onSave,
}: SaveSearchModalProps) {
  const t = useTranslations();
  const modalLabels = useFormModalLabels();
  const values: SaveSearchValues = { name: defaultName };
  const form = useZodForm(saveSearchSchema(t), { defaultValues: values });
  const limit = refusal?.kind === "limit" ? refusal.limit : null;
  const canUpgrade = useSavedSearchUpgrade(limit);

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("savedSearch.saveTitle")}
      form={form}
      onSubmit={(v) => onSave(v.name)}
      isSubmitting={isSaving}
      resetValues={values}
      submitLabel={t("common.save")}
      size="md"
      {...modalLabels}
    >
      <FormInput name="name" label={t("savedSearch.nameLabel")} />
      {refusal?.kind === "duplicate" && (
        <Alert variant="warning">{t("server.savedSearch.alreadySaved")}</Alert>
      )}
      {refusal?.kind === "limit" && (
        <Alert
          variant="warning"
          icon={<ExclamationTriangleIcon className="h-5 w-5" />}
          title={t("savedSearch.limitTitle")}
        >
          {refusal.limit !== null &&
            t("search.savedLimitReached", { limit: refusal.limit })}
          {canUpgrade && (
            <>
              {" "}
              <Link href="/membership" className="font-medium underline">
                {t("search.premiumMoreSearches")}
              </Link>
            </>
          )}
        </Alert>
      )}
    </FormModal>
  );
}
