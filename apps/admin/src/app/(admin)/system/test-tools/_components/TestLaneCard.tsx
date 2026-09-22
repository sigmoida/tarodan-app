"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Checkbox, Input } from "@tarodan/ui";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataTable } from "@/components/DataTable";
import { useConfirm } from "@/provider/ConfirmProvider";
import { testLaneColumns } from "../_lib/columns";
import { type TestAccount, type TestLaneResetResult } from "../_lib/types";
import { useTranslations } from "next-intl";

const EMPTY_FORM = {
  email: "",
  password: "",
  displayName: "",
  phone: "",
  isSeller: false,
};

/**
 * Canlıdaki test şeridi: hesap listesi, yeni hesap formu ve şerit sıfırlama.
 * Hesaplar doğrulanmış ve adresli açılır (reviewer SMS/e-posta alamaz).
 */
export function TestLaneCard({ isProd }: { isProd: boolean }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const [form, setForm] = useState(EMPTY_FORM);

  const accountsQuery = useQuery<TestAccount[]>({
    queryKey: adminKeys.all("test-lane-accounts"),
    queryFn: async () =>
      (await adminApi.get("/admin/test-tools/lane/accounts")).data,
  });
  const accounts = accountsQuery.data ?? [];

  const createMut = useAdminMutation(
    (vars: typeof EMPTY_FORM) =>
      adminApi
        .post("/admin/test-tools/lane/accounts", {
          email: vars.email.trim(),
          password: vars.password,
          displayName: vars.displayName.trim(),
          isSeller: vars.isSeller,
          ...(vars.phone.trim() ? { phone: vars.phone.trim() } : {}),
        })
        .then((r) => r.data as TestAccount),
    {
      invalidates: ["test-lane-accounts"],
      errorMessage: t("admin.system.testTools.lane.createFailed"),
      onSuccess: (data) => {
        toast.success(
          t("admin.system.testTools.lane.created", { email: data.email }),
        );
        setForm(EMPTY_FORM);
      },
    },
  );

  const resetMut = useAdminMutation(
    () =>
      adminApi
        .post("/admin/test-tools/lane/reset")
        .then((r) => r.data as TestLaneResetResult),
    {
      invalidates: ["test-lane-accounts"],
      errorMessage: t("admin.system.testTools.lane.resetFailed"),
      onSuccess: (data) =>
        toast.success(
          t("admin.system.testTools.lane.resetDone", {
            accounts: data.accounts,
            orders: data.deleted.orders ?? 0,
          }),
        ),
    },
  );

  const askReset = () =>
    confirm({
      title: t("admin.system.testTools.lane.resetConfirmTitle"),
      confirmLabel: t("admin.system.testTools.lane.reset"),
      description: (
        <div className="space-y-2 text-sm">
          <p className="text-muted">
            {t("admin.system.testTools.lane.resetConfirmDescription")}
          </p>
          {isProd && (
            <p className="text-xs text-danger-700">
              {t("admin.system.testTools.prodDataWarning")}
            </p>
          )}
        </div>
      ),
      onConfirm: () => resetMut.mutateAsync(undefined),
    });

  const canCreate =
    form.email.trim().length > 3 &&
    form.password.length >= 8 &&
    form.displayName.trim().length >= 2;

  return (
    <SectionCard
      title={t("admin.system.testTools.lane.title")}
      actions={
        <Button
          variant="danger"
          size="sm"
          onClick={askReset}
          isLoading={resetMut.isPending}
          disabled={accounts.length === 0}
        >
          {t("admin.system.testTools.lane.reset")}
        </Button>
      }
      bodyClassName="space-y-4"
    >
      <p className="-mt-2 text-sm text-muted">
        {t("admin.system.testTools.lane.description")}
      </p>
      <Alert variant="info">
        {t("admin.system.testTools.lane.reviewHint")}
      </Alert>

      {accounts.length > 0 ? (
        <DataTable
          columns={testLaneColumns(t)}
          data={accounts}
          getRowId={(r) => r.id}
        />
      ) : (
        <p className="text-sm text-muted">
          {accountsQuery.isLoading
            ? "…"
            : t("admin.system.testTools.lane.accountsEmpty")}
        </p>
      )}

      <div className="border-t border-border pt-4">
        <h3 className="mb-3 text-sm font-semibold text-heading">
          {t("admin.system.testTools.lane.createTitle")}
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label={t("admin.system.testTools.lane.email")}
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="min-w-[220px] flex-1"
          />
          <Input
            label={t("admin.system.testTools.lane.password")}
            type="text"
            autoComplete="off"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-48"
          />
          <Input
            label={t("admin.system.testTools.lane.displayName")}
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className="w-48"
          />
          <Input
            label={t("admin.system.testTools.lane.phone")}
            placeholder="+905XXXXXXXXX"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-44"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Checkbox
            label={t("admin.system.testTools.lane.isSeller")}
            checked={form.isSeller}
            onChange={(e) => setForm({ ...form, isSeller: e.target.checked })}
          />
          <Button
            onClick={() => createMut.mutate(form)}
            isLoading={createMut.isPending}
            disabled={!canCreate}
          >
            {t("admin.system.testTools.lane.create")}
          </Button>
          <Badge variant="warning" size="sm">
            {t("admin.users.testAccount")}
          </Badge>
        </div>
      </div>
    </SectionCard>
  );
}
