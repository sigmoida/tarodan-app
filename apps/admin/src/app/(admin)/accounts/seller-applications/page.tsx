"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button, StatusBadge } from "@tarodan/ui";
import { ResourceListPage } from "@/components/ResourceListPage";
import { type ColumnDef } from "@/components/DataTable";
import { useAdminResource } from "@/hooks/useAdminResource";
import { useConfirm } from "@/components/ConfirmProvider";
import { usePrompt } from "@/components/PromptProvider";
import { adminApi } from "@/lib/api";
import toast from "react-hot-toast";
import {
  CheckCircleIcon,
  XCircleIcon,
  BuildingOfficeIcon,
  PhoneIcon,
  CalendarIcon,
  HashtagIcon,
} from "@heroicons/react/24/outline";

const STATUS_TABS = [
  { key: "pending", label: "Bekleyenler" },
  { key: "approved", label: "Onaylananlar" },
  { key: "rejected", label: "Reddedilenler" },
];

const businessStatusConfig = {
  pending:  { label: "Bekliyor",    variant: "warning"  as const },
  approved: { label: "Onaylandı",   variant: "success"  as const },
  rejected: { label: "Reddedildi",  variant: "danger"   as const },
};

type Application = {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  companyName: string;
  taxId: string | null;
  businessStatus: "pending" | "approved" | "rejected" | null;
  isSeller: boolean;
  createdAt: string;
};

const VALID_APP_TABS = ["pending", "approved", "rejected"];

export default function SellerApplicationsPage() {
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // URL'den ilk tab değeri; geçersiz değer 'pending'e düşer
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get("tab");
    return VALID_APP_TABS.includes(t ?? "") ? t! : "pending";
  });

  const resource = useAdminResource<Application>({
    queryKey: `seller-applications-${activeTab}`,
    fetcher: (params) => adminApi.getSellerApplications({ ...params, status: activeTab }),
    syncUrl: true,
  });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setExpandedId(null);
    resource.setTabUrl(tab, { defaultTab: "pending" });
  };

  const handleRowClick = (app: Application) => {
    setExpandedId((prev) => (prev === app.id ? null : app.id));
  };

  const handleApprove = async (app: Application) => {
    if (
      !(await confirm({
        description: `"${app.companyName}" başvurusunu onaylamak istediğinize emin misiniz? Hesap aktif satıcı olarak işaretlenecek.`,
      }))
    )
      return;
    try {
      await adminApi.approveSellerApplication(app.id);
      toast.success("Başvuru onaylandı");
      setExpandedId(null);
      resource.refetch();
      queryClient.invalidateQueries({ queryKey: ["seller-applications-approved"] });
    } catch {
      toast.error("Onaylama sırasında hata oluştu");
    }
  };

  const handleReject = async (app: Application) => {
    const reason = await prompt({
      title: "Başvuruyu Reddet",
      description: "Red nedeni (kullanıcıya gönderilecek):",
      placeholder: "Lütfen red nedenini açıklayın...",
    });
    if (reason === null) return;
    try {
      await adminApi.rejectSellerApplication(app.id, reason);
      toast.success("Başvuru reddedildi");
      setExpandedId(null);
      resource.refetch();
      queryClient.invalidateQueries({ queryKey: ["seller-applications-rejected"] });
    } catch {
      toast.error("Red işlemi sırasında hata oluştu");
    }
  };

  const columns: ColumnDef<Application, any>[] = [
    {
      header: "Firma",
      cell: ({ row }) => (
        <>
          <p className="font-semibold text-heading">{row.original.companyName}</p>
          <p className="text-xs text-muted">{row.original.email}</p>
        </>
      ),
    },
    {
      header: "Yetkili",
      cell: ({ row }) => (
        <span className="text-sm text-muted">{row.original.displayName}</span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => {
        const s = row.original.businessStatus ?? "pending";
        return <StatusBadge status={s} config={businessStatusConfig} />;
      },
    },
    {
      header: "Başvuru Tarihi",
      cell: ({ row }) => (
        <span className="text-xs text-muted">
          {new Date(row.original.createdAt).toLocaleDateString("tr-TR")}
        </span>
      ),
    },
  ];

  const renderExpanded = (app: Application) => (
    <div className="p-6 bg-surface-alt/40 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Firma bilgileri */}
      <div>
        <h4 className="text-xs font-semibold text-muted uppercase mb-3 flex items-center gap-1.5">
          <BuildingOfficeIcon className="w-4 h-4" /> Firma Bilgileri
        </h4>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted block text-xs">Firma Adı</span>
            <span className="text-heading font-medium">{app.companyName}</span>
          </div>
          {app.taxId && (
            <div>
              <span className="text-muted block text-xs flex items-center gap-1"><HashtagIcon className="w-3 h-3" />Vergi No</span>
              <span className="text-heading font-medium">{app.taxId}</span>
            </div>
          )}
        </div>
      </div>

      {/* İletişim */}
      <div>
        <h4 className="text-xs font-semibold text-muted uppercase mb-3">İletişim</h4>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted block text-xs">E-posta</span>
            <span className="text-heading">{app.email}</span>
          </div>
          {app.phone && (
            <div>
              <span className="text-muted block text-xs flex items-center gap-1"><PhoneIcon className="w-3 h-3" />Telefon</span>
              <span className="text-heading">{app.phone}</span>
            </div>
          )}
          <div>
            <span className="text-muted block text-xs flex items-center gap-1"><CalendarIcon className="w-3 h-3" />Başvuru Tarihi</span>
            <span className="text-heading">{new Date(app.createdAt).toLocaleString("tr-TR")}</span>
          </div>
        </div>
      </div>

      {/* Aksiyonlar */}
      {app.businessStatus === "pending" && (
        <div className="flex flex-col gap-2 justify-start md:items-end">
          <h4 className="text-xs font-semibold text-muted uppercase mb-1 md:text-right">İşlemler</h4>
          <Button variant="success" size="md" onClick={() => handleApprove(app)}>
            <CheckCircleIcon className="w-4 h-4 mr-2" />
            Onayla
          </Button>
          <Button variant="outline" size="md" onClick={() => handleReject(app)}>
            <XCircleIcon className="w-4 h-4 mr-2" />
            Reddet
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <ResourceListPage
      title="Kurumsal Satıcı Başvuruları"
      description="Kurumsal hesap açma taleplerini inceleyin ve onaylayın"
      tabs={STATUS_TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      search={{ placeholder: "Firma adı veya e-posta ara..." }}
      searchValue={resource.search}
      onSearchChange={resource.setSearch}
      onSearchSubmit={resource.onSearchSubmit}
      columns={columns}
      data={resource.rows}
      loading={resource.isLoading}
      getRowId={(r) => r.id}
      onRowClick={handleRowClick}
      expandedId={expandedId}
      renderExpanded={renderExpanded}
      emptyText="Başvuru bulunamadı"
      page={resource.page}
      totalPages={resource.totalPages}
      onPageChange={resource.setPage}
    />
  );
}
