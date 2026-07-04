import { Badge } from '@tarodan/ui';
import { col } from '@/components/table';
import { commissionRowMenu } from './rowActions';
import { type CommissionRule, sellerTypeLabel, appliesToLabel } from './types';

const rate = (v: number | null) => (v !== null ? `%${v.toFixed(2)}` : '—');

export interface CommissionColumnProps {
  onEdit: (r: CommissionRule) => void;
  onDelete: (r: CommissionRule) => void;
  onToggle: (r: CommissionRule) => void;
  togglingId?: string;
}

export function commissionColumns({ onEdit, onDelete, onToggle }: CommissionColumnProps) {
  return [
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
    col.badge<CommissionRule>('Durum', (r) => <Badge active={r.isActive} />),
    col.rowMenu<CommissionRule>(commissionRowMenu({ onEdit, onDelete, onToggle })),
  ];
}
