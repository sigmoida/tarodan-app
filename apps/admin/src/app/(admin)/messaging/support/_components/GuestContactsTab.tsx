'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { clientListFetcher } from '@/lib/query/client-list';
import { guestColumns } from '../_lib/columns';
import { type GuestContact } from '../_lib/types';
import { GuestContactModal } from './GuestContactModal';

/** Guest contact messages — full-load API paginated client-side; row opens modal. */
export function GuestContactsTab() {
  const [selected, setSelected] = useState<GuestContact | null>(null);

  return (
    <>
      <ResourceList<GuestContact>
        resource="guest-contacts"
        fetcher={clientListFetcher<GuestContact>(
          () => adminApi.getGuestContacts(),
          (raw) => (Array.isArray(raw) ? raw : raw?.data ?? []),
          { searchFields: ['referenceNumber', 'name', 'email', 'subject'] },
        )}
        getRowId={(g) => g.referenceNumber}
        syncUrl
        errorMessage="Misafir mesajları yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search placeholder="Referans, ad, e-posta veya konu ara..." />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={guestColumns}
          onRowClick={(g) => setSelected(g)}
          emptyText="Misafir mesajı bulunamadı"
        />
        <ResourceList.Pagination />
      </ResourceList>

      {selected && (
        <GuestContactModal contact={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
