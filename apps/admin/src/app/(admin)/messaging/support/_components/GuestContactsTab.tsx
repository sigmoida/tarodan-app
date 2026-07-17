/** @format */

"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { guestColumns } from "../_lib/columns";
import { guestRowMenu } from "../_lib/rowActions";
import { type GuestContact } from "../_lib/types";
import { GuestContactModal } from "./GuestContactModal";

/** Guest contact messages — server-paginated (cache-backed); row opens modal. */
export function GuestContactsTab() {
  const [selected, setSelected] = useState<GuestContact | null>(null);

  return (
    <>
      <ResourceList<GuestContact>
        resource="guest-contacts"
        fetcher={(params) => adminApi.getGuestContacts(params)}
        getRowId={(g) => g.referenceNumber}
        syncUrl
        errorMessage="Misafir mesajları yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={guestColumns(guestRowMenu(setSelected))}
          emptyText="Misafir mesajı bulunamadı"
        />
        <ResourceList.Pagination />
      </ResourceList>

      {selected && (
        <GuestContactModal
          contact={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
