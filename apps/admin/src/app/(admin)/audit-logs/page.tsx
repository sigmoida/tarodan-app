'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { PageHeader, FilterToolbar, ActionButtons, ActionIconButton } from '@/components/admin-list';
import {
  EyeIcon,
  CalendarIcon,
  UserIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Button, Input, Select } from '@tarodan/ui';

interface AuditLog {
  id: string;
  adminId: string;
  adminName?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
  createdAt: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    action: '',
    entityType: '',
    adminId: '',
    fromDate: '',
    toDate: '',
  });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadLogs();
  }, [page, filters]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params: any = {
        page,
        limit: 20,
      };
      if (filters.search) params.search = filters.search;
      if (filters.action) params.action = filters.action;
      if (filters.entityType) params.entityType = filters.entityType;
      if (filters.adminId) params.adminId = filters.adminId;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;

      const response = await adminApi.getAuditLogs(params);
      const data = response.data.data || response.data.logs || [];
      setLogs(data);
      setTotal(response.data.meta?.total || response.data.total || 0);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Load audit logs error:', error);
      toast.error(error.response?.data?.message || 'Audit loglar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      user_ban: 'Kullanıcı Banlandı',
      user_unban: 'Kullanıcı Banı Kaldırıldı',
      product_approve: 'Ürün Onaylandı',
      product_reject: 'Ürün Reddedildi',
      product_delete: 'Ürün Silindi',
      order_update: 'Sipariş Güncellendi',
      payment_refund: 'Ödeme İade Edildi',
      category_create: 'Kategori Oluşturuldu',
      category_update: 'Kategori Güncellendi',
      category_delete: 'Kategori Silindi',
      commission_rule_create: 'Komisyon Kuralı Oluşturuldu',
      commission_rule_update: 'Komisyon Kuralı Güncellendi',
      commission_rule_delete: 'Komisyon Kuralı Silindi',
      trade_resolve: 'Takas Çözümlendi',
      message_approve: 'Mesaj Onaylandı',
      message_reject: 'Mesaj Reddedildi',
      support_ticket_update: 'Destek Talebi Güncellendi',
      support_ticket_reply: 'Destek Talebine Yanıt Verildi',
      membership_tier_update: 'Üyelik Seviyesi Güncellendi',
    };
    return labels[action] || action;
  };

  const getEntityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      User: 'Kullanıcı',
      Product: 'Ürün',
      Order: 'Sipariş',
      Payment: 'Ödeme',
      Category: 'Kategori',
      CommissionRule: 'Komisyon Kuralı',
      Trade: 'Takas',
      Message: 'Mesaj',
      SupportTicket: 'Destek Talebi',
      MembershipTier: 'Üyelik Seviyesi',
    };
    return labels[type] || type;
  };

  const columns: ColumnDef<AuditLog, any>[] = [
    {
      header: 'Tarih',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-muted" />
          <span className="text-sm">
            {new Date(row.original.createdAt).toLocaleString('tr-TR')}
          </span>
        </div>
      ),
    },
    {
      header: 'Admin',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-muted" />
          <span className="text-sm">
            {row.original.adminName || row.original.adminId.substring(0, 8)}
          </span>
        </div>
      ),
    },
    {
      header: 'İşlem',
      cell: ({ row }) => (
        <span className="badge badge-info">
          {getActionLabel(row.original.action)}
        </span>
      ),
    },
    {
      header: 'Tip',
      cell: ({ row }) => (
        <span className="text-sm text-muted">
          {getEntityTypeLabel(row.original.entityType)}
        </span>
      ),
    },
    {
      header: 'Entity ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted">
          {row.original.entityId.substring(0, 8)}...
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'İşlemler',
      cell: ({ row }) => (
        <ActionButtons>
          <ActionIconButton
            icon={EyeIcon}
            onClick={() => setSelectedLog(row.original)}
            title="Detay"
          />
        </ActionButtons>
      ),
    },
  ];

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader title="Audit Logs" description="Sistem işlem geçmişi" />

        {/* Filters */}
        <div className="admin-card">
          <FilterToolbar
            search={filters.search}
            onSearchChange={(v) => setFilters({ ...filters, search: v })}
          >
            <Select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="sm:w-48"
            >
              <option value="">Tüm İşlemler</option>
              <option value="user_ban">Kullanıcı Ban</option>
              <option value="product_approve">Ürün Onay</option>
              <option value="order_update">Sipariş Güncelle</option>
              <option value="payment_refund">Ödeme İade</option>
            </Select>
            <Select
              value={filters.entityType}
              onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
              className="sm:w-48"
            >
              <option value="">Tüm Tipler</option>
              <option value="User">Kullanıcı</option>
              <option value="Product">Ürün</option>
              <option value="Order">Sipariş</option>
              <option value="Payment">Ödeme</option>
            </Select>
          </FilterToolbar>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-sm text-muted mb-1">Başlangıç Tarihi</label>
              <Input type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Bitiş Tarihi</label>
              <Input type="date"
                value={filters.toDate}
                onChange={(e) => setFilters({ ...filters, toDate: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="admin-card overflow-hidden">
          <DataTable
            columns={columns}
            data={logs}
            loading={loading}
            emptyText="Log bulunamadı"
            getRowId={(log) => log.id}
          />

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <span className="text-sm text-muted">
                Toplam {total} log
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="py-1 text-muted rounded hover:bg-surface-alt disabled:opacity-50">
                  Önceki
                </Button>
                <span className="px-3 py-1 text-muted">
                  Sayfa {page} / {Math.ceil(total / 20)}
                </span>
                <Button variant="secondary" onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(total / 20)}
                  className="py-1 text-muted rounded hover:bg-surface-alt disabled:opacity-50">
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-2xl w-full mx-4 border border-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-semibold text-heading leading-tight truncate min-w-0">Audit Log Detayı</h2>
              <Button variant="secondary" onClick={() => setSelectedLog(null)}
                className="text-muted hover:text-heading shrink-0">
                <DocumentTextIcon className="w-6 h-6" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-sm text-muted">İşlem:</span>
                <p className="text-heading font-medium">{getActionLabel(selectedLog.action)}</p>
              </div>
              <div>
                <span className="text-sm text-muted">Tip:</span>
                <p className="text-heading">{getEntityTypeLabel(selectedLog.entityType)}</p>
              </div>
              <div>
                <span className="text-sm text-muted">Entity ID:</span>
                <p className="text-heading font-mono text-sm">{selectedLog.entityId}</p>
              </div>
              <div>
                <span className="text-sm text-muted">Admin:</span>
                <p className="text-heading">{selectedLog.adminName || selectedLog.adminId}</p>
              </div>
              <div>
                <span className="text-sm text-muted">Tarih:</span>
                <p className="text-heading">
                  {new Date(selectedLog.createdAt).toLocaleString('tr-TR')}
                </p>
              </div>
              {selectedLog.oldValues && (
                <div>
                  <span className="text-sm text-muted">Eski Değerler:</span>
                  <pre className="mt-2 p-3 bg-surface-alt rounded text-xs text-muted overflow-x-auto">
                    {JSON.stringify(selectedLog.oldValues, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.newValues && (
                <div>
                  <span className="text-sm text-muted">Yeni Değerler:</span>
                  <pre className="mt-2 p-3 bg-surface-alt rounded text-xs text-muted overflow-x-auto">
                    {JSON.stringify(selectedLog.newValues, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.metadata && (
                <div>
                  <span className="text-sm text-muted">Metadata:</span>
                  <pre className="mt-2 p-3 bg-surface-alt rounded text-xs text-muted overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="mt-6">
              <Button variant="secondary" onClick={() => setSelectedLog(null)}
                className="w-full px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 transition-colors">
                Kapat
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
