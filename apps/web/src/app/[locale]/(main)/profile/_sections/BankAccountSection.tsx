/** @format */

"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { Form, FormInput, FormIban, useZodForm } from "@tarodan/ui/form";
import SectionCard from "@/components/ui/SectionCard";
import { useConfirm } from "@/components/ConfirmProvider";
import { BankAccountSummary } from "@/components/bank/BankAccountSummary";
import { useReturnAfterSave } from "@/hooks/useReturnAfterSave";
import { PROFILE_GATE } from "@/lib/profileGate";
import { useAuthStore } from "@/stores/authStore";
import { bankAccountSchema, type BankAccountValues } from "../_lib/schemas";
import {
  useBankAccount,
  useSaveBankAccount,
  useDeleteBankAccount,
} from "@/hooks/useBankAccount";

const EMPTY: BankAccountValues = {
  accountHolder: "",
  iban: "",
  taxId: "",
};

/** Seller IBAN — shared `useBankAccount` query + upsert/delete, RHF+zod form. */
export default function BankAccountSection() {
  const t = useTranslations();
  const { isAuthenticated } = useAuthStore();
  const confirm = useConfirm();
  const { account } = useBankAccount(isAuthenticated);
  const save = useSaveBankAccount();
  const remove = useDeleteBankAccount();
  const finish = useReturnAfterSave("bank");

  const form = useZodForm(bankAccountSchema(t), { defaultValues: EMPTY });

  useEffect(() => {
    if (account) {
      form.reset({
        accountHolder: account.accountHolder || "",
        iban: account.iban || "",
        taxId: account.taxId || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  // Kayıt başarılıysa ve güvenli bir `returnTo` varsa (ör. ilan formu) oraya dön.
  const submit = (v: BankAccountValues) =>
    save.mutate(v, { onSuccess: finish });

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
    <div id={PROFILE_GATE.bank.anchor} className="scroll-mt-24">
      <SectionCard
        title={t("profile.bank.title")}
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
              onClick={form.handleSubmit(submit)}
              isLoading={save.isPending}
            >
              {account ? t("common.update") : t("common.save")}
            </Button>
          </div>
        }
      >
        {account && (
          <BankAccountSummary
            accountHolder={account.accountHolder}
            iban={account.iban}
            updatedAt={account.updatedAt}
          />
        )}
        <p className="mb-4 text-sm text-muted">
          {t("profile.bank.payoutNote")}
        </p>
        <Form form={form} onSubmit={submit} className="space-y-4">
          <FormInput
            name="accountHolder"
            label={t("profile.bank.accountHolder")}
            placeholder={t("profile.bank.accountHolderPlaceholder")}
          />
          <FormIban name="iban" label="IBAN" className="font-mono" />
          <FormInput
            name="taxId"
            label={t("profile.bank.taxIdOptional")}
            placeholder={t("profile.bank.taxIdPlaceholder")}
            inputMode="numeric"
            maxLength={10}
          />
        </Form>
      </SectionCard>
    </div>
  );
}
