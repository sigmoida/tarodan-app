"use client";

import { SectionCard } from "@/components/detail/SectionCard";
import { ResourceList } from "@/components/list";
import { commissionColumns } from "../_lib/columns";
import { type CommissionRule } from "../_lib/types";
import { useTranslations } from "next-intl";

export function CommissionTable({
  onEdit,
  onDelete,
}: {
  onEdit: (rule: CommissionRule) => void;
  onDelete: (rule: CommissionRule) => void;
}) {
  const t = useTranslations();
  const columns = commissionColumns({ onEdit, onDelete }, t);

  return (
    <SectionCard title={t("admin.finance.commission.rules")}>
      <ResourceList.Table<CommissionRule>
        columns={columns}
        emptyText={t("admin.finance.commission.emptyRules")}
      />
    </SectionCard>
  );
}
