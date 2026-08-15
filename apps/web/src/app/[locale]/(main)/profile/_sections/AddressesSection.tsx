/** @format */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, IconButton } from "@tarodan/ui";
import SectionCard from "@/components/ui/SectionCard";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAuthStore } from "@/stores/authStore";
import {
  useAddresses,
  useDeleteAddress,
  useSetDefaultAddress,
  type Address,
} from "../_hooks/useAddresses";
import AddressFormModal from "../_modals/AddressFormModal";

const MAX_ADDRESSES = 10;

export default function AddressesSection() {
  const t = useTranslations();
  const { isAuthenticated } = useAuthStore();
  const confirm = useConfirm();
  const { addresses, isLoading } = useAddresses(isAuthenticated);
  const removeAddress = useDeleteAddress();
  const setDefault = useSetDefaultAddress();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (address: Address) => {
    setEditing(address);
    setModalOpen(true);
  };

  const onDelete = async (id: string) => {
    const ok = await confirm({
      title: t("address.deleteAddress"),
      description: t("address.deleteConfirm"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (ok) removeAddress.mutate(id);
  };

  return (
    <SectionCard
      title={t("address.myAddresses")}
      badge={
        <Badge variant="secondary" size="sm">
          {addresses.length}/{MAX_ADDRESSES}
        </Badge>
      }
      action={
        addresses.length < MAX_ADDRESSES ? (
          <Button type="button" size="sm" onClick={openAdd} className="gap-1">
            <PlusIcon className="h-4 w-4" />
            {t("address.newAddress")}
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : addresses.length === 0 ? (
        <div className="rounded-lg bg-surface py-10 text-center">
          <p className="mb-4 text-muted">{t("address.noAddresses")}</p>
          <Button type="button" onClick={openAdd}>
            {t("address.addFirstAddress")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <div
              key={address.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-border-subtle p-4"
            >
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  {address.title && (
                    <span className="font-semibold text-heading">
                      {address.title}
                    </span>
                  )}
                  {address.isDefault && (
                    <Badge variant="primary" size="sm">
                      {t("address.default")}
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-medium text-heading">
                  {address.fullName}
                </p>
                <p className="text-sm text-muted">{address.phone}</p>
                <p className="mt-1 text-sm text-muted">
                  {address.address}, {address.district}, {address.city}
                  {address.zipCode ? ` ${address.zipCode}` : ""}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-1">
                {!address.isDefault && (
                  <IconButton
                    aria-label={t("address.makeDefault")}
                    variant="ghost"
                    size="sm"
                    onClick={() => setDefault.mutate(address.id)}
                  >
                    <CheckIcon className="h-5 w-5 text-primary-500" />
                  </IconButton>
                )}
                <IconButton
                  aria-label={t("common.edit")}
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(address)}
                >
                  <PencilIcon className="h-5 w-5" />
                </IconButton>
                <IconButton
                  aria-label={t("common.delete")}
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(address.id)}
                >
                  <TrashIcon className="h-5 w-5 text-danger-500" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddressFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        address={editing}
      />
    </SectionCard>
  );
}
