/** @format */

"use client";

import { useEffect } from "react";
import { z } from "zod";
import { Button, isValidIban } from "@tarodan/ui";
import { Form, FormInput, FormIban, useZodForm } from "@tarodan/ui/form";
import { SectionCard } from "@/components/ui";
import { BankAccountSummary } from "@/components/bank/BankAccountSummary";
import { useBankAccount, useSaveBankAccount } from "@/hooks/useBankAccount";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

const schema = (t: T) =>
  z.object({
    accountHolder: z
      .string()
      .min(1, t("seller.documents.accountHolderRequired")),
    iban: z
      .string()
      .refine((v) => isValidIban(v), t("seller.documents.ibanInvalid")),
    taxId: z.string().optional(),
  });
type Values = z.infer<ReturnType<typeof schema>>;

/** Corporate IBAN captured with the application; admin sees it on the detail. */
export function BankAccountCard() {
  const t = useTranslations();
  const { account: data } = useBankAccount();

  const form = useZodForm(schema(t), {
    defaultValues: { accountHolder: "", iban: "", taxId: "" },
  });
  const { reset } = form;
  useEffect(() => {
    if (data) {
      reset({
        accountHolder: data.accountHolder ?? "",
        iban: data.iban ?? "",
        taxId: data.taxId ?? "",
      });
    }
  }, [data, reset]);

  const save = useSaveBankAccount({
    successMessage: t("seller.documents.ibanSaved"),
    errorMessage: t("seller.documents.ibanSaveFailed"),
  });

  return (
    <SectionCard title={t("seller.documents.ibanTitle")}>
      {data && (
        <BankAccountSummary
          accountHolder={data.accountHolder ?? ""}
          iban={data.iban ?? ""}
          updatedAt={data.updatedAt}
        />
      )}
      <Form form={form} onSubmit={(v) => save.mutate(v)} className="space-y-3">
        <FormInput
          name="accountHolder"
          label={t("seller.documents.accountHolder")}
          placeholder={t("seller.documents.accountHolderPlaceholder")}
        />
        <FormIban name="iban" label={t("seller.documents.iban")} />
        <FormInput
          name="taxId"
          label={t("seller.documents.taxIdOptional")}
          placeholder={t("seller.documents.taxIdPlaceholder")}
        />
        <Button type="submit" isLoading={save.isPending} className="w-full">
          {t("seller.documents.saveIban")}
        </Button>
      </Form>
    </SectionCard>
  );
}
