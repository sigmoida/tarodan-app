'use client';

import { SectionCard } from '@/components/detail/SectionCard';
import { DataTable } from '@/components/DataTable';
import { commissionColumns } from '../_lib/columns';
import { type CommissionRule } from '../_lib/types';

export function CommissionTable({
  rules,
  onEdit,
  onDelete,
  onToggle,
  togglingId,
}: {
  rules: CommissionRule[];
  onEdit: (rule: CommissionRule) => void;
  onDelete: (rule: CommissionRule) => void;
  onToggle: (rule: CommissionRule) => void;
  togglingId?: string;
}) {
  const columns = commissionColumns({ onEdit, onDelete, onToggle, togglingId });

  return (
    <SectionCard title="Komisyon Kuralları">
      <DataTable
        columns={columns}
        data={rules}
        getRowId={(r) => r.id}
        emptyText="Henüz komisyon kuralı eklenmemiş"
      />
    </SectionCard>
  );
}
