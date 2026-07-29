/** @format */

"use client";

import { useEffect } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Badge, Button, isValidIban } from "@tarodan/ui";
import { Form, FormInput, FormIban, useZodForm } from "@tarodan/ui/form";
import { SectionCard } from "@/components/ui";
import { bankAccountApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
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
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.bankAccount.detail(),
    queryFn: async () => (await bankAccountApi.get()).data,
    staleTime: 30_000,
  });

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

  const save = useMutation({
    mutationFn: (v: Values) =>
      bankAccountApi.upsert({
        accountHolder: v.accountHolder.trim(),
        iban: v.iban.replace(/\s/g, "").toUpperCase(),
        taxId: v.taxId?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t("seller.documents.ibanSaved"));
      qc.invalidateQueries({ queryKey: queryKeys.bankAccount.detail() });
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message || t("seller.documents.ibanSaveFailed"),
      ),
  });

  return (
    <SectionCard title={t("seller.documents.ibanTitle")}>
      {data?.iban && (
        <div className="mb-3">
          <Badge variant={data.isVerified ? "success" : "warning"} size="sm">
            {data.isVerified
              ? t("seller.documents.ibanVerified")
              : t("seller.documents.ibanUnverified")}
          </Badge>
        </div>
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
