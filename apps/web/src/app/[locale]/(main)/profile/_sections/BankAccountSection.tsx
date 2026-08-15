/** @format */

"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Badge, Button } from "@tarodan/ui";
import { Form, FormInput, FormIban, useZodForm } from "@tarodan/ui/form";
import SectionCard from "@/components/ui/SectionCard";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAuthStore } from "@/stores/authStore";
import { bankAccountSchema, type BankAccountValues } from "../_lib/schemas";
import {
  useBankAccount,
  useSaveBankAccount,
  useDeleteBankAccount,
} from "../_hooks/useBankAccount";

const EMPTY: BankAccountValues = {
  accountHolder: "",
  iban: "",
  tcKimlikNo: "",
  taxId: "",
};

/** Seller IBAN — independent query + upsert/delete, RHF+zod form. */
export default function BankAccountSection() {
  const t = useTranslations();
  const { isAuthenticated } = useAuthStore();
  const confirm = useConfirm();
  const { account } = useBankAccount(isAuthenticated);
  const save = useSaveBankAccount();
  const remove = useDeleteBankAccount();

  const form = useZodForm(bankAccountSchema(t), { defaultValues: EMPTY });

  useEffect(() => {
    if (account) {
      form.reset({
        accountHolder: account.accountHolder || "",
        iban: account.iban || "",
        tcKimlikNo: account.tcKimlikNo || "",
        taxId: account.taxId || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const onDelete = async () => {
    const ok = await confirm({
      title: t("profile.bank.deleteTitle"),
      description: t("profile.bank.deleteConfirm"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (ok) remove.mutate(undefined, { onSuccess: () => form.reset(EMPTY) });
  };

  return (
    <SectionCard
      title={t("profile.bank.title")}
      badge={
        account ? (
          <Badge variant={account.isVerified ? "success" : "warning"} size="sm">
            {account.isVerified
              ? t("profile.bank.verified")
              : t("profile.bank.unverified")}
          </Badge>
        ) : undefined
      }
      action={
        <div className="flex gap-2">
          {account && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="gap-1 text-danger-600 hover:bg-danger-50 hover:text-danger-600"
            >
              <TrashIcon className="h-4 w-4" />
              {t("common.delete")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={form.handleSubmit((v) => save.mutate(v))}
            isLoading={save.isPending}
          >
            {account ? t("common.update") : t("common.save")}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">{t("profile.bank.payoutNote")}</p>
      <Form form={form} onSubmit={(v) => save.mutate(v)} className="space-y-4">
        <FormInput
          name="accountHolder"
          label={t("profile.bank.accountHolder")}
          placeholder={t("profile.bank.accountHolderPlaceholder")}
        />
        <FormIban name="iban" label="IBAN" className="font-mono" />
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput
            name="tcKimlikNo"
            label={t("profile.bank.tcOptional")}
            placeholder={t("profile.bank.tcPlaceholder")}
            inputMode="numeric"
            maxLength={11}
          />
          <FormInput
            name="taxId"
            label={t("profile.bank.taxIdOptional")}
            placeholder={t("profile.bank.taxIdPlaceholder")}
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        {account && (
          <p className="text-xs text-muted">
            {t("profile.bank.reverificationNote")}
          </p>
        )}
      </Form>
    </SectionCard>
  );
}
