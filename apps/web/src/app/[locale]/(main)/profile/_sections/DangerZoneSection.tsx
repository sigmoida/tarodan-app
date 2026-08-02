/** @format */

"use client";

import { useState } from "react";
import {
  ExclamationTriangleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button, Input, Modal, ModalFooter } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import SectionCard from "@/components/ui/SectionCard";
import { useDeleteAccount } from "../_hooks/useDeleteAccount";

/** Account deletion — type-to-confirm modal. */
export default function DangerZoneSection() {
  const t = useTranslations();
  const del = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const close = () => {
    setOpen(false);
    setConfirmText("");
  };

  return (
    <SectionCard
      title={t("settings.dangerZone")}
      className="border-danger-200 bg-danger-50"
      action={
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="gap-1"
          onClick={() => setOpen(true)}
        >
          <TrashIcon className="h-4 w-4" />
          {t("settings.deleteAccount")}
        </Button>
      }
    >
      <p className="text-sm text-danger-700">
        {t("settings.deleteAccountDetails")}
      </p>

      <Modal
        isOpen={open}
        onClose={close}
        title={t("settings.deleteAccount")}
        size="md"
        closeLabel={t("common.close")}
        dismissDisabled={del.isPending}
        footer={
          <ModalFooter
            onCancel={close}
            onConfirm={() => del.mutate()}
            cancelLabel={t("common.cancel")}
            confirmLabel={t("collection.yesDelete")}
            destructive
            isLoading={del.isPending}
            disabled={confirmText !== t("settings.deleteAccountKeyword")}
          />
        }
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-100">
            <ExclamationTriangleIcon className="h-8 w-8 text-danger-600" />
          </div>
          <p className="text-muted">{t("settings.deleteAccountWarning")}</p>
        </div>
        <label className="mb-2 block text-sm font-medium text-body">
          {t("settings.deleteAccountTypePrompt", {
            keyword: t("settings.deleteAccountKeyword"),
          })}
        </label>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={t("settings.deleteAccountKeyword")}
        />
      </Modal>
    </SectionCard>
  );
}
