'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Spinner } from '@tarodan/ui';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  Squares2X2Icon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { SectionCard } from '@/components/detail/SectionCard';
import { ActiveBadge } from '@/components/ActiveBadge';
import { PageHeader, ActionIconButton } from '@/components/AdminList';
import { useConfirm } from '@/provider/ConfirmProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import type { AttributeGroup, Attribute } from './_lib/types';
import { AttributeGroupFormModal } from './_modals/AttributeGroupFormModal';
import { AttributeFormModal } from './_modals/AttributeFormModal';

export default function AttributesPage() {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('groupId'));
  const [groupModal, setGroupModal] = useState<{ group?: AttributeGroup } | null>(null);
  const [attrModal, setAttrModal] = useState<{ attribute?: Attribute } | null>(null);

  // Gruplar tek seferde (limit 100) yüklenir; arama istemci tarafında anlık
  // filtreler — her tuşta sunucuya gitmez, performanslı.
  const { data: groups = [], isLoading: loadingGroups } = useQuery<AttributeGroup[]>({
    queryKey: ['attribute-groups'],
    queryFn: async () => (await adminApi.getAttributeGroups({ limit: 100 })).data.data ?? [],
  });
  const { data: attributes = [], isLoading: loadingAttrs } = useQuery<Attribute[]>({
    queryKey: ['attributes', selectedId],
    enabled: !!selectedId,
    queryFn: async () =>
      (await adminApi.getAttributes({ groupId: selectedId!, limit: 100 })).data.data ?? [],
  });

  const q = search.trim().toLocaleLowerCase('tr');
  const visibleGroups = groups.filter(
    (g) =>
      g.slug !== 'vehicle_type' &&
      (!q || [g.name, g.slug, g.description].some((f) => f?.toLocaleLowerCase('tr').includes(q))),
  );
  const selectedGroup = groups.find((g) => g.id === selectedId) ?? null;

  const delGroup = useAdminMutation((id: string) => adminApi.deleteAttributeGroup(id), {
    invalidates: ['attribute-groups', 'attributes'],
    successMessage: 'Grup silindi',
    onSuccess: () => setSelectedId(null),
  });
  const delAttr = useAdminMutation((id: string) => adminApi.deleteAttribute(id), {
    invalidates: ['attributes'],
    successMessage: 'Değer silindi',
  });

  const onDeleteGroup = async (g: AttributeGroup) => {
    if (await confirm({ title: 'Grubu Sil', description: 'Silmek istediğinizden emin misiniz?', destructive: true }))
      delGroup.mutate(g.id);
  };
  const onDeleteAttr = async (a: Attribute) => {
    if (await confirm({ title: 'Değeri Sil', description: 'Silmek istediğinizden emin misiniz?', destructive: true }))
      delAttr.mutate(a.id);
  };

  return (
    <AdminPage>
      <PageHeader title="Ürün Özellikleri" description="Özellik grupları ve değerleri">
        <Button variant="primary" leftIcon={<PlusIcon className="h-5 w-5" />} onClick={() => setGroupModal({})}>
          Yeni Grup
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
        {/* Groups */}
        <SectionCard title="Gruplar" bodyClassName="space-y-2">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Grup ara..."
              className="pl-10"
            />
          </div>
          {loadingGroups ? (
            <div className="py-8 text-center">
              <Spinner size="md" className="mx-auto" />
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="py-8 text-center text-muted">
              {q ? 'Eşleşen grup yok' : 'Grup yok'}
            </div>
          ) : (
            visibleGroups.map((g) => (
              <div
                key={g.id}
                onClick={() => setSelectedId(g.id)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg p-3 ${
                  selectedId === g.id ? 'border border-primary-600 bg-primary-50' : 'bg-surface-alt'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Squares2X2Icon className="h-5 w-5 flex-shrink-0 text-muted" />
                  <span className="truncate text-heading">{g.name}</span>
                  {!g.isActive && <ActiveBadge active={false} />}
                </div>
                <div
                  className="flex flex-shrink-0 items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ActionIconButton icon={PencilIcon} onClick={() => setGroupModal({ group: g })} title="Düzenle" />
                  <ActionIconButton icon={TrashIcon} onClick={() => onDeleteGroup(g)} title="Sil" variant="danger" />
                  <ChevronRightIcon className="h-4 w-4 text-muted" />
                </div>
              </div>
            ))
          )}
        </SectionCard>

        {/* Attributes */}
        <div className="md:col-span-2">
          {!selectedGroup ? (
            <SectionCard>
              <div className="py-12 text-center text-muted">Değerleri görmek için bir grup seçin</div>
            </SectionCard>
          ) : (
            <SectionCard
              title={`${selectedGroup.name} Değerleri`}
              actions={
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<PlusIcon className="h-4 w-4" />}
                  onClick={() => setAttrModal({})}
                >
                  Değer Ekle
                </Button>
              }
            >
              {loadingAttrs ? (
                <div className="py-8 text-center">
                  <Spinner size="md" className="mx-auto" />
                </div>
              ) : attributes.length === 0 ? (
                <div className="py-8 text-center text-muted">Değer yok</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {attributes.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-surface-alt p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {selectedGroup.manufacturerSlug && a.color && (
                          <span
                            className="h-4 w-4 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: a.color }}
                          />
                        )}
                        <span className="truncate text-heading">{a.displayValue || a.value}</span>
                        {!a.isActive && <ActiveBadge active={false} />}
                      </div>
                      <div className="flex flex-shrink-0 gap-1">
                        <ActionIconButton icon={PencilIcon} onClick={() => setAttrModal({ attribute: a })} title="Düzenle" />
                        <ActionIconButton icon={TrashIcon} onClick={() => onDeleteAttr(a)} title="Sil" variant="danger" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      </div>

      {groupModal && (
        <AttributeGroupFormModal
          key={groupModal.group?.id ?? 'new'}
          open
          onClose={() => setGroupModal(null)}
          group={groupModal.group}
        />
      )}
      {attrModal && selectedGroup && (
        <AttributeFormModal
          key={attrModal.attribute?.id ?? 'new'}
          open
          onClose={() => setAttrModal(null)}
          attribute={attrModal.attribute}
          groupId={selectedGroup.id}
          showColor={!!selectedGroup.manufacturerSlug}
        />
      )}
    </AdminPage>
  );
}
