"use client";

import { SectionCard } from "@/components/detail/SectionCard";
import { ResourceList } from "@/components/list";
import { commissionColumns } from "../_lib/columns";
import { type CommissionRule } from "../_lib/types";

export function CommissionTable({
  onEdit,
  onDelete,
  onToggle,
  togglingId,
}: {
  onEdit: (rule: CommissionRule) => void;
  onDelete: (rule: CommissionRule) => void;
  onToggle: (rule: CommissionRule) => void;
  togglingId?: string;
}) {
  const columns = commissionColumns({ onEdit, onDelete, onToggle, togglingId });

  return (
    <SectionCard title="Komisyon Kuralları">
      <ResourceList.Table<CommissionRule>
        columns={columns}
        emptyText="Henüz komisyon kuralı eklenmemiş"
      />
    </SectionCard>
  );
}
