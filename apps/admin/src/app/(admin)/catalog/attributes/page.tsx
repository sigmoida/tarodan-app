"use client";

import { Button, Spinner } from "@tarodan/ui";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  Squares2X2Icon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { extractList } from "@/lib/extract";
import { clientListFetcher } from "@/lib/query/client-list";
import { ResourceList } from "@/components/list";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { SectionCard } from "@/components/detail/SectionCard";
import { ActiveBadge } from "@/components/ActiveBadge";
import { ActionIconButton } from "@/components/AdminList";
import { useAttributesPage } from "./_lib/useAttributesPage";
import type { AttributeGroup } from "./_lib/types";
import { AttributeGroupFormModal } from "./_modals/AttributeGroupFormModal";
import { AttributeFormModal } from "./_modals/AttributeFormModal";

const attributeGroupsFetcher = clientListFetcher<AttributeGroup>(
  () => adminApi.getAttributeGroups({ limit: 250 }),
  (raw) => extractList<AttributeGroup>(raw),
  {
    // No searchFields → full-content search across all displayed columns (#378).
    filter: (group) => group.slug !== "vehicle_type",
  },
);

export default function AttributesPage() {
  return (
    <ResourceList<AttributeGroup>
      resource="attribute-groups"
      fetcher={attributeGroupsFetcher}
      getRowId={(group) => group.id}
      syncUrl
    >
      <AttributesPageContent />
    </ResourceList>
  );
}

function AttributesPageContent() {
  const {
    t,
    selectedId,
    selectGroup,
    groups,
    selectedGroup,
    attributes,
    loadingAttrs,
    attributesError,
    attributesRetrying,
    retryAttributes,
    groupModal,
    setGroupModal,
    attrModal,
    setAttrModal,
    onDeleteGroup,
    onDeleteAttribute,
    deletingGroupId,
    deletingAttributeId,
  } = useAttributesPage();

  return (
    <>
      <ResourceList.Header
        title={t("admin.catalog.attributes.title")}
        description={t("admin.catalog.attributes.subtitle")}
        actions={
          <Button
            variant="primary"
            leftIcon={<PlusIcon className="h-5 w-5" />}
            onClick={() => setGroupModal({})}
          >
            {t("admin.catalog.attributes.newGroup")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
        {/* Groups */}
        <SectionCard
          title={t("admin.catalog.attributes.groups")}
          bodyClassName="space-y-2"
        >
          <ResourceList.Search
            placeholder={t("admin.catalog.attributes.searchGroup")}
          />
          {groups.length === 0 ? (
            <div className="py-8 text-center text-muted">
              {t("admin.catalog.attributes.noMatchingGroup")}
            </div>
          ) : (
            groups.map((g) => (
              <div
                key={g.id}
                onClick={() => selectGroup(g.id)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg p-3 ${
                  selectedId === g.id
                    ? "border border-primary-600 bg-primary-50"
                    : "bg-surface-alt"
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
                  <ActionIconButton
                    icon={PencilIcon}
                    onClick={() => setGroupModal({ group: g })}
                    title={t("common.edit")}
                  />
                  <ActionIconButton
                    icon={TrashIcon}
                    onClick={() => onDeleteGroup(g)}
                    title={t("common.delete")}
                    variant="danger"
                    isLoading={deletingGroupId === g.id}
                  />
                  <ChevronRightIcon className="h-4 w-4 text-muted" />
                </div>
              </div>
            ))
          )}
        </SectionCard>

        {/* Attributes */}
        <div className="md:col-span-2">
          {attributesError ? (
            <QueryErrorCard
              onRetry={() => void retryAttributes()}
              isRetrying={attributesRetrying}
            />
          ) : !selectedGroup ? (
            <SectionCard>
              <div className="py-12 text-center text-muted">
                {t("admin.catalog.attributes.selectGroupHint")}
              </div>
            </SectionCard>
          ) : (
            <SectionCard
              title={t("admin.catalog.attributes.groupValues", {
                name: selectedGroup.name,
              })}
              actions={
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<PlusIcon className="h-4 w-4" />}
                  onClick={() => setAttrModal({})}
                >
                  {t("admin.catalog.attributes.addValue")}
                </Button>
              }
            >
              {loadingAttrs ? (
                <div className="py-8 text-center">
                  <Spinner size="md" className="mx-auto" />
                </div>
              ) : attributes.length === 0 ? (
                <div className="py-8 text-center text-muted">
                  {t("admin.catalog.attributes.noValues")}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {attributes.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-surface-alt p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {a.color && (
                          <span
                            className="h-4 w-4 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: a.color }}
                          />
                        )}
                        <span className="truncate text-heading">
                          {a.displayValue || a.value}
                        </span>
                        {!a.isActive && <ActiveBadge active={false} />}
                      </div>
                      <div className="flex flex-shrink-0 gap-1">
                        <ActionIconButton
                          icon={PencilIcon}
                          onClick={() => setAttrModal({ attribute: a })}
                          title={t("common.edit")}
                        />
                        <ActionIconButton
                          icon={TrashIcon}
                          onClick={() => onDeleteAttribute(a)}
                          title={t("common.delete")}
                          variant="danger"
                          isLoading={deletingAttributeId === a.id}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      </div>

      <ResourceList.Pagination />

      {groupModal && (
        <AttributeGroupFormModal
          key={groupModal.group?.id ?? "new"}
          open
          onClose={() => setGroupModal(null)}
          group={groupModal.group}
        />
      )}
      {attrModal && selectedGroup && (
        <AttributeFormModal
          key={attrModal.attribute?.id ?? "new"}
          open
          onClose={() => setAttrModal(null)}
          attribute={attrModal.attribute}
          groupId={selectedGroup.id}
        />
      )}
    </>
  );
}
