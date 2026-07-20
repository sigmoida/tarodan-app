"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useResourceList } from "@/components/list";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import type { Attribute, AttributeGroup } from "./types";

export function useAttributesPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { rows: groups } = useResourceList<AttributeGroup>();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("groupId"),
  );
  const [groupModal, setGroupModal] = useState<{
    group?: AttributeGroup;
  } | null>(null);
  const [attrModal, setAttrModal] = useState<{
    attribute?: Attribute;
  } | null>(null);

  const selectedGroupParam = searchParams.get("groupId");
  useEffect(() => setSelectedId(selectedGroupParam), [selectedGroupParam]);

  const selectGroup = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("groupId", id);
      else params.delete("groupId");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const { data: attributes = [], isLoading: loadingAttrs } = useQuery<
    Attribute[]
  >({
    queryKey: adminKeys.detail("attributes", selectedId ?? ""),
    enabled: !!selectedId,
    queryFn: async () =>
      (await adminApi.getAttributes({ groupId: selectedId!, limit: 100 })).data
        .data ?? [],
  });

  const selectedGroup = groups.find((group) => group.id === selectedId) ?? null;

  const deleteGroup = useAdminMutation(
    (id: string) => adminApi.deleteAttributeGroup(id),
    {
      invalidates: ["attribute-groups", "attributes"],
      successMessage: t("admin.catalog.attributes.groupDeleted"),
      onSuccess: () => selectGroup(null),
    },
  );
  const deleteAttribute = useAdminMutation(
    (id: string) => adminApi.deleteAttribute(id),
    {
      invalidates: ["attributes"],
      successMessage: t("admin.catalog.attributes.valueDeleted"),
    },
  );

  const onDeleteGroup = async (group: AttributeGroup) => {
    await confirm({
      title: t("admin.catalog.attributes.deleteGroupTitle"),
      description: t("admin.catalog.attributes.confirmDelete"),
      destructive: true,
      onConfirm: () => deleteGroup.mutateAsync(group.id),
    });
  };

  const onDeleteAttribute = async (attribute: Attribute) => {
    await confirm({
      title: t("admin.catalog.attributes.deleteValueTitle"),
      description: t("admin.catalog.attributes.confirmDelete"),
      destructive: true,
      onConfirm: () => deleteAttribute.mutateAsync(attribute.id),
    });
  };

  return {
    t,
    selectedId,
    selectGroup,
    groups,
    selectedGroup,
    attributes,
    loadingAttrs,
    groupModal,
    setGroupModal,
    attrModal,
    setAttrModal,
    onDeleteGroup,
    onDeleteAttribute,
    deletingGroupId: deleteGroup.isPending ? deleteGroup.variables : undefined,
    deletingAttributeId: deleteAttribute.isPending
      ? deleteAttribute.variables
      : undefined,
  };
}
