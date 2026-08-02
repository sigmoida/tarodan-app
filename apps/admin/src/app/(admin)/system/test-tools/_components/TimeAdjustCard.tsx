"use client";

import { useMemo, useState } from "react";
import { Button, Input, Select } from "@tarodan/ui";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataTable } from "@/components/DataTable";
import { useConfirm } from "@/provider/ConfirmProvider";
import { timeAdjustColumns } from "../_lib/columns";
import {
  type AdjustAction,
  type SearchItem,
  testToolTypes,
  typeOptions,
  fmt,
  previewAfter,
} from "../_lib/types";
import { useTranslations } from "next-intl";

export function TimeAdjustCard({ isProd }: { isProd: boolean }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const [type, setType] = useState("boost");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [minutes, setMinutes] = useState(1);
  const [days, setDays] = useState(1);

  const placeholder = useMemo(
    () =>
      testToolTypes(t).find((item) => item.value === type)?.placeholder ?? "",
    [t, type],
  );

  const searchMut = useAdminMutation(
    async () =>
      (await adminApi.get("/admin/test-tools/search", { params: { type, q } }))
        .data as SearchItem[],
    {
      errorMessage: t("admin.system.testTools.searchFailed"),
      onSuccess: (data) => {
        setResults(data);
        if (!data.length)
          toast(t("admin.system.testTools.noResults"), { icon: "🔍" });
      },
    },
  );
  const searching = searchMut.isPending;

  const doSearch = () => {
    if (q.trim().length < 2) {
      toast.error(t("admin.system.testTools.minimumCharacters"));
      return;
    }
    setResults([]);
    searchMut.mutate();
  };

  const adjustMut = useAdminMutation(
    (vars: { item: SearchItem; action: AdjustAction; value: number }) =>
      adminApi
        .post("/admin/test-tools/adjust", {
          type,
          id: vars.item.id,
          action: vars.action,
          value: vars.value,
        })
        .then((r) => r.data),
    {
      errorMessage: t("admin.system.testTools.adjustFailed"),
      onSuccess: (data) => {
        toast.success(`${data.field}: ${fmt(data.after, t)}`);
        doSearch();
      },
    },
  );

  const askAdjust = async (
    item: SearchItem,
    action: AdjustAction,
    value: number,
  ) => {
    const field = Object.keys(item.dates)[0] ?? t("common.date");
    const after = previewAfter(action, value);
    await confirm({
      title: t("common.confirm"),
      confirmLabel: t("admin.system.testTools.apply"),
      description: (
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            {t("admin.system.testTools.adjustRecordBefore")}{" "}
            <b className="text-heading">{item.label}</b>{" "}
            {t("admin.system.testTools.adjustRecordMiddle")}{" "}
            <code>{field}</code> {t("admin.system.testTools.adjustRecordAfter")}
          </p>
          <div className="space-y-1 rounded-lg bg-surface-alt p-3">
            <div>
              <span className="text-muted">
                {t("admin.system.testTools.oldValue")}:
              </span>{" "}
              {fmt(item.dates[field] ?? null, t)}
            </div>
            <div>
              <span className="text-muted">
                {t("admin.system.testTools.newValue")}:
              </span>{" "}
              <b>{fmt(after, t)}</b>
            </div>
          </div>
          {isProd && (
            <p className="text-xs text-danger-700">
              {t("admin.system.testTools.prodDataWarning")}
            </p>
          )}
        </div>
      ),
      onConfirm: () => adjustMut.mutateAsync({ item, action, value }),
    });
  };

  const columns = timeAdjustColumns({ minutes, days, onAdjust: askAdjust }, t);

  return (
    <SectionCard
      title={t("admin.system.testTools.timeAdjustTitle")}
      bodyClassName="space-y-4"
    >
      <p className="-mt-2 text-sm text-muted">
        {t("admin.system.testTools.timeAdjustDescription")}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t("admin.system.testTools.type")}
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setResults([]);
          }}
          options={typeOptions(t)}
          className="w-48"
        />
        <Input
          label={t("admin.system.testTools.searchLabel", { placeholder })}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          className="min-w-[220px] flex-1"
        />
        <Button onClick={doSearch} isLoading={searching}>
          {t("common.search")}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Input
          type="number"
          min={0}
          label={t("admin.system.testTools.minutesAfterInput")}
          value={minutes}
          placeholder="15"
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="w-28"
        />
        <Input
          type="number"
          min={0}
          label={t("admin.system.testTools.daysBackInput")}
          value={days}
          placeholder="7"
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-28"
        />
      </div>

      {/* Non-list DataTable (#383): renders ad-hoc search-tool results, not a
          paginated resource list — no sort/search wiring by design. */}
      {results.length > 0 && (
        <DataTable columns={columns} data={results} getRowId={(r) => r.id} />
      )}
    </SectionCard>
  );
}
