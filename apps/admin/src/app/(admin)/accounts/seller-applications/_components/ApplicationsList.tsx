'use client';

import { useState } from 'react';
import { Button, StatusBadge } from '@tarodan/ui';
import {
  CheckCircleIcon,
  XCircleIcon,
  BuildingOfficeIcon,
  PhoneIcon,
  CalendarIcon,
  HashtagIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { col } from '@/components/table';
import { useConfirm } from '@/provider/ConfirmProvider';
import { usePrompt } from '@/provider/PromptProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { type Application, businessStatusConfig } from '../_lib/types';

/** The applications list for one status tab — expandable rows + approve/reject. */
export function ApplicationsList({ status }: { status: string }) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const approve = useAdminMutation(
    (id: string) => adminApi.approveSellerApplication(id),
    {
      invalidates: ['seller-applications'],
      successMessage: 'Başvuru onaylandı',
      errorMessage: 'Onaylama sırasında hata oluştu',
      onSuccess: () => setExpandedId(null),
    },
  );
  const reject = useAdminMutation(
    (v: { id: string; reason: string }) =>
      adminApi.rejectSellerApplication(v.id, v.reason),
    {
      invalidates: ['seller-applications'],
      successMessage: 'Başvuru reddedildi',
      errorMessage: 'Red işlemi sırasında hata oluştu',
      onSuccess: () => setExpandedId(null),
    },
  );

  const onApprove = async (app: Application) => {
    const ok = await confirm({
      description: `"${app.companyName}" başvurusunu onaylamak istediğinize emin misiniz? Hesap aktif satıcı olarak işaretlenecek.`,
    });
    if (ok) approve.mutate(app.id);
  };

  const onReject = async (app: Application) => {
    const reason = await prompt({
      title: 'Başvuruyu Reddet',
      description: 'Red nedeni (kullanıcıya gönderilecek):',
      placeholder: 'Lütfen red nedenini açıklayın...',
    });
    if (reason === null) return;
    reject.mutate({ id: app.id, reason });
  };

  const columns = [
    col.user<Application>('Firma', (a) => ({
      name: a.companyName,
      secondary: a.email,
    })),
    col.muted<Application>('Yetkili', (a) => a.displayName),
    col.badge<Application>('Durum', (a) => (
      <StatusBadge status={a.businessStatus ?? 'pending'} config={businessStatusConfig} />
    )),
    col.date<Application>('Başvuru Tarihi', (a) => a.createdAt),
  ];

  const renderExpanded = (app: Application) => (
    <div className="grid grid-cols-1 gap-6 border-t border-border bg-surface-alt/40 p-6 md:grid-cols-3">
      <div>
        <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <BuildingOfficeIcon className="h-4 w-4" /> Firma Bilgileri
        </h4>
        <div className="space-y-2 text-sm">
          <div>
            <span className="block text-xs text-muted">Firma Adı</span>
            <span className="font-medium text-heading">{app.companyName}</span>
          </div>
          {app.taxId && (
            <div>
              <span className="flex items-center gap-1 text-xs text-muted">
                <HashtagIcon className="h-3 w-3" />
                Vergi No
              </span>
              <span className="font-medium text-heading">{app.taxId}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-xs font-semibold text-muted">İletişim</h4>
        <div className="space-y-2 text-sm">
          <div>
            <span className="block text-xs text-muted">E-posta</span>
            <span className="text-heading">{app.email}</span>
          </div>
          {app.phone && (
            <div>
              <span className="flex items-center gap-1 text-xs text-muted">
                <PhoneIcon className="h-3 w-3" />
                Telefon
              </span>
              <span className="text-heading">{app.phone}</span>
            </div>
          )}
          <div>
            <span className="flex items-center gap-1 text-xs text-muted">
              <CalendarIcon className="h-3 w-3" />
              Başvuru Tarihi
            </span>
            <span className="text-heading">
              {new Date(app.createdAt).toLocaleString('tr-TR')}
            </span>
          </div>
        </div>
      </div>

      {app.businessStatus === 'pending' && (
        <div className="flex flex-col justify-start gap-2 md:items-end">
          <h4 className="mb-1 text-xs font-semibold text-muted md:text-right">İşlemler</h4>
          <Button
            variant="success"
            leftIcon={<CheckCircleIcon className="h-4 w-4" />}
            onClick={() => onApprove(app)}
            isLoading={approve.isPending && approve.variables === app.id}
          >
            Onayla
          </Button>
          <Button
            variant="outline"
            leftIcon={<XCircleIcon className="h-4 w-4" />}
            onClick={() => onReject(app)}
          >
            Reddet
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <ResourceList<Application>
      resource="seller-applications"
      fetcher={(params) => adminApi.getSellerApplications(params)}
      getRowId={(a) => a.id}
      syncUrl
      initialFilters={{ status }}
      errorMessage="Başvurular yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search placeholder="Firma adı veya e-posta ara..." />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={columns}
        emptyText="Başvuru bulunamadı"
        onRowClick={(a) => setExpandedId((prev) => (prev === a.id ? null : a.id))}
        expandedId={expandedId}
        renderExpanded={renderExpanded}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
