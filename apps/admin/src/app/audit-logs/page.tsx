'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import {
  MagnifyingGlassIcon,
  EyeIcon,
  CalendarIcon,
  UserIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

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
      console.error('Load audit logs error:', error);
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
          <p className="text-gray-400 mt-1">Sistem işlem geçmişi</p>
        </div>

        {/* Filters */}
        <div className="admin-card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Ara..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="admin-input pl-10"
              />
            </div>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="admin-input"
            >
              <option value="">Tüm İşlemler</option>
              <option value="user_ban">Kullanıcı Ban</option>
              <option value="product_approve">Ürün Onay</option>
              <option value="order_update">Sipariş Güncelle</option>
              <option value="payment_refund">Ödeme İade</option>
            </select>
            <select
              value={filters.entityType}
              onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
              className="admin-input"
            >
              <option value="">Tüm Tipler</option>
              <option value="User">Kullanıcı</option>
              <option value="Product">Ürün</option>
              <option value="Order">Sipariş</option>
              <option value="Payment">Ödeme</option>
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Başlangıç Tarihi</label>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                className="admin-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Bitiş Tarihi</label>
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                className="admin-input w-full"
              />
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Admin</th>
                  <th>İşlem</th>
                  <th>Tip</th>
                  <th>Entity ID</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      Log bulunamadı
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">
                            {new Date(log.createdAt).toLocaleString('tr-TR')}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">{log.adminName || log.adminId.substring(0, 8)}</span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-info">{getActionLabel(log.action)}</span>
                      </td>
                      <td>
                        <span className="text-sm text-gray-400">{getEntityTypeLabel(log.entityType)}</span>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-gray-400">
                          {log.entityId.substring(0, 8)}...
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg"
                          title="Detay"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-between p-4 border-t border-dark-700">
              <span className="text-sm text-gray-400">
                Toplam {total} log
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-dark-600 text-gray-300 rounded hover:bg-dark-700 disabled:opacity-50"
                >
                  Önceki
                </button>
                <span className="px-3 py-1 text-gray-300">
                  Sayfa {page} / {Math.ceil(total / 20)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(total / 20)}
                  className="px-3 py-1 border border-dark-600 text-gray-300 rounded hover:bg-dark-700 disabled:opacity-50"
                >
                  Sonraki
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-xl p-6 max-w-2xl w-full mx-4 border border-dark-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Audit Log Detayı</h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-white"
              >
                <DocumentTextIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-sm text-gray-400">İşlem:</span>
                <p className="text-white font-medium">{getActionLabel(selectedLog.action)}</p>
              </div>
              <div>
                <span className="text-sm text-gray-400">Tip:</span>
                <p className="text-white">{getEntityTypeLabel(selectedLog.entityType)}</p>
              </div>
              <div>
                <span className="text-sm text-gray-400">Entity ID:</span>
                <p className="text-white font-mono text-sm">{selectedLog.entityId}</p>
              </div>
              <div>
                <span className="text-sm text-gray-400">Admin:</span>
                <p className="text-white">{selectedLog.adminName || selectedLog.adminId}</p>
              </div>
              <div>
                <span className="text-sm text-gray-400">Tarih:</span>
                <p className="text-white">
                  {new Date(selectedLog.createdAt).toLocaleString('tr-TR')}
                </p>
              </div>
              {selectedLog.oldValues && (
                <div>
                  <span className="text-sm text-gray-400">Eski Değerler:</span>
                  <pre className="mt-2 p-3 bg-dark-700 rounded text-xs text-gray-300 overflow-x-auto">
                    {JSON.stringify(selectedLog.oldValues, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.newValues && (
                <div>
                  <span className="text-sm text-gray-400">Yeni Değerler:</span>
                  <pre className="mt-2 p-3 bg-dark-700 rounded text-xs text-gray-300 overflow-x-auto">
                    {JSON.stringify(selectedLog.newValues, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.metadata && (
                <div>
                  <span className="text-sm text-gray-400">Metadata:</span>
                  <pre className="mt-2 p-3 bg-dark-700 rounded text-xs text-gray-300 overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="mt-6">
              <button
                onClick={() => setSelectedLog(null)}
                className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
