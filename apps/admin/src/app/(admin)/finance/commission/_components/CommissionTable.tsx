'use client';

import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { SectionCard } from '@/components/detail/SectionCard';
import { DataTable } from '@/components/DataTable';
import { col } from '@/components/table';
import { ActionButtons, ActionIconButton } from '@/components/admin-list';
import { StatusToggle } from '@/components/ActiveBadge';
import {
  type CommissionRule,
  sellerTypeLabel,
  appliesToLabel,
} from '../_lib/types';

const rate = (v: number | null) => (v !== null ? `%${v.toFixed(2)}` : '—');

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
  const columns = [
    col.text<CommissionRule>('Kural Adı', (r) => r.name),
    col.muted<CommissionRule>('Kategori', (r) => r.categoryName || 'Tümü'),
    col.muted<CommissionRule>('Satıcı Tipi', (r) => sellerTypeLabel(r.sellerType)),
    col.muted<CommissionRule>('Uygulanan', (r) => appliesToLabel(r.appliesTo)),
    col.custom<CommissionRule>('Satıcı Oranı', (r) => (
      <span className="font-semibold text-primary-700">{rate(r.sellerRate)}</span>
    )),
    col.custom<CommissionRule>('Alıcı Oranı', (r) => (
      <span className="font-semibold text-primary-700">{rate(r.buyerRate)}</span>
    )),
    col.custom<CommissionRule>('Durum', (r) => (
      <StatusToggle
        active={r.isActive}
        busy={togglingId === r.id}
        onToggle={() => onToggle(r)}
      />
    )),
    col.actions<CommissionRule>(
      (r) => (
        <ActionButtons>
          <ActionIconButton icon={PencilIcon} onClick={() => onEdit(r)} title="Düzenle" />
          <ActionIconButton
            icon={TrashIcon}
            onClick={() => onDelete(r)}
            title="Sil"
            variant="danger"
          />
        </ActionButtons>
      ),
      { header: 'İşlemler' },
    ),
  ];

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
