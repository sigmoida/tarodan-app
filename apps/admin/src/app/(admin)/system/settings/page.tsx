'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Spinner } from '@tarodan/ui';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/admin-list';
import { AdminTabs } from '@/components/AdminTabs';
import { SectionCard } from '@/components/detail/SectionCard';
import { useTabParam } from '@/hooks/useTabParam';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import {
  type Settings,
  type SettingsTab,
  SETTINGS_TABS,
  TAB_TITLE,
  TAB_FIELDS,
  parseSettings,
} from './_lib/settings';

export default function SettingsPage() {
  const [tab, setTab] = useTabParam('listing');
  const [values, setValues] = useState<Settings | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const res = await adminApi.getSettings();
      return parseSettings(res.data?.data ?? res.data ?? []);
    },
  });
  useEffect(() => {
    if (data) setValues(data);
  }, [data]);

  const save = useAdminMutation(
    (activeTab: SettingsTab) =>
      Promise.all(
        TAB_FIELDS[activeTab].map((f) =>
          adminApi.updateSetting(f.backendKey, String(values?.[f.key] ?? '')),
        ),
      ),
    { invalidates: ['platform-settings'], successMessage: 'Ayarlar kaydedildi' },
  );

  if (isLoading || !values) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <SectionCard>
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <ExclamationTriangleIcon className="h-12 w-12 shrink-0 text-danger-500" />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-heading">Ayarlar yüklenemedi</p>
            <p className="mt-1 text-sm text-muted">
              Oturumun sona ermiş olabilir. Tekrar dene; sürerse çıkış yapıp yeniden giriş yap.
            </p>
          </div>
          <Button onClick={() => refetch()}>Tekrar Dene</Button>
        </div>
      </SectionCard>
    );
  }

  const activeTab = tab as SettingsTab;

  return (
    <AdminPage>
      <PageHeader title="Sistem Ayarları" description="Sistem yapılandırmasını yönetin" />

      <AdminTabs tabs={SETTINGS_TABS} value={tab} onChange={setTab} />

      <SectionCard title={TAB_TITLE[activeTab]}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {TAB_FIELDS[activeTab].map((f) => (
            <Input
              key={f.key}
              type="number"
              label={f.label}
              helperText={f.helper}
              min={f.min}
              step={f.step}
              value={values[f.key]}
              onChange={(e) => setValues({ ...values, [f.key]: Number(e.target.value) })}
            />
          ))}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate(activeTab)} isLoading={save.isPending}>
          Ayarları Kaydet
        </Button>
      </div>
    </AdminPage>
  );
}
