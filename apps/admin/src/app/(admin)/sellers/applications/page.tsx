"use client";

import { useState } from "react";
import { Button, Textarea, enumLabel, sellerTypeConfig } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { PageHeader } from "@/components/admin-list";
import {
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  BuildingOfficeIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/ConfirmProvider";

// Mock data based on User model structure
const PENDING_APPLICATIONS = [
  {
    id: "1",
    displayName: "Teknoloji Dünyası",
    email: "info@teknodunya.com",
    companyName: "Tekno Ltd. Şti.",
    taxId: "1234567890",
    appliedAt: "2024-02-09T10:30:00Z",
    type: "business",
    documents: [
      { name: "Vergi Levhası", url: "#" },
      { name: "İmza Sirküleri", url: "#" },
    ],
  },
  {
    id: "2",
    displayName: "Moda Butik",
    email: "satis@modabutik.com",
    companyName: "Moda Giyim A.Ş.",
    taxId: "9876543210",
    appliedAt: "2024-02-08T15:20:00Z",
    type: "verified",
    documents: [{ name: "Kimlik Fotokopisi", url: "#" }],
  },
  {
    id: "3",
    displayName: "Kitap Kurdu",
    email: "ali@kitapkurdu.com",
    companyName: null,
    taxId: null,
    appliedAt: "2024-02-07T09:15:00Z",
    type: "individual",
    documents: [],
  },
];

export default function SellerApplicationsPage() {
  const confirm = useConfirm();
  const [applications, setApplications] = useState(PENDING_APPLICATIONS);
  const [selectedApplication, setSelectedApplication] = useState<any>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const handleApprove = async (id: string) => {
    if (await confirm({ description: "Bu satıcı başvurusunu onaylamak istediğinize emin misiniz?" })) {
      // API call would go here
      setApplications((prev) => prev.filter((app) => app.id !== id));
      toast.success("Satıcı başvurusu onaylandı");
      if (selectedApplication?.id === id) setSelectedApplication(null);
    }
  };

  const openRejectModal = (app: any) => {
    setSelectedApplication(app);
    setRejectReason("");
    setIsRejectModalOpen(true);
  };

  const handleReject = (e: React.FormEvent) => {
    e.preventDefault();
    // API call would go here
    setApplications((prev) =>
      prev.filter((app) => app.id !== selectedApplication.id),
    );
    toast.success("Satıcı başvurusu reddedildi");
    setIsRejectModalOpen(false);
    setSelectedApplication(null);
  };

  type Application = (typeof PENDING_APPLICATIONS)[number];

  const columns: ColumnDef<Application, any>[] = [
    {
      header: "Tip",
      cell: ({ row }) => (
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            row.original.type === "business"
              ? "bg-primary-500/10 text-primary-700"
              : row.original.type === "verified"
                ? "bg-info-500/10 text-info-700"
                : "bg-success-500/10 text-success-700"
          }`}
        >
          {row.original.type === "business"
            ? "Kurumsal"
            : row.original.type === "verified"
              ? "Onaylı Satıcı"
              : "Bireysel"}
        </span>
      ),
    },
    {
      header: "Başvuran",
      cell: ({ row }) => (
        <>
          <h3 className="font-semibold text-heading">{row.original.displayName}</h3>
          <p className="text-sm text-muted">{row.original.email}</p>
        </>
      ),
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="text-xs text-muted">
          {new Date(row.original.appliedAt).toLocaleDateString("tr-TR")}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Satıcı Başvuruları"
          description="Bekleyen satıcı doğrulama ve onay taleplerini yönetin"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Applications List */}
          <div className="lg:col-span-1">
            <DataTable
              columns={columns}
              data={applications}
              emptyText="Bekleyen başvuru yok"
              getRowId={(app) => app.id}
              onRowClick={(app) => setSelectedApplication(app)}
              rowClassName={(app) => (app.id === selectedApplication?.id ? "bg-primary-50" : "")}
            />
          </div>

          {/* Application Detail */}
          <div className="lg:col-span-2">
            {selectedApplication ? (
              <div className="admin-card h-full">
                <div className="flex justify-between items-start gap-3 mb-6 border-b border-border pb-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-heading truncate">
                      {selectedApplication.displayName}
                    </h2>
                    <p className="text-muted truncate">{selectedApplication.email}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => openRejectModal(selectedApplication)}
                    >
                      <XCircleIcon className="w-5 h-5 mr-2" />
                      Reddet
                    </Button>
                    <Button
                      variant="success"
                      size="md"
                      onClick={() => handleApprove(selectedApplication.id)}
                    >
                      <CheckCircleIcon className="w-5 h-5 mr-2" />
                      Onayla
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-muted uppercase mb-4">
                      Başvuru Bilgileri
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-muted block">
                          Başvuru Tipi
                        </label>
                        <p className="text-heading font-medium">
                          {enumLabel(sellerTypeConfig, selectedApplication.type)}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-muted block">
                          Başvuru Tarihi
                        </label>
                        <p className="text-heading font-medium">
                          {new Date(
                            selectedApplication.appliedAt,
                          ).toLocaleString("tr-TR")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted uppercase mb-4">
                      Firma Bilgileri
                    </h3>
                    {selectedApplication.companyName ? (
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs text-muted block flex items-center gap-1">
                            <BuildingOfficeIcon className="w-4 h-4 shrink-0" /> Firma Adı
                          </label>
                          <p className="text-heading font-medium">
                            {selectedApplication.companyName}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs text-muted block">
                            Vergi Numarası
                          </label>
                          <p className="text-heading font-medium">
                            {selectedApplication.taxId}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted italic">
                        Bireysel satıcı başvurusu - firma bilgisi yok.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-8">
                  <h3 className="text-sm font-medium text-muted uppercase mb-4">
                    Belgeler
                  </h3>
                  {selectedApplication.documents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedApplication.documents.map(
                        (doc: any, idx: number) => (
                          <a
                            key={idx}
                            href={doc.url}
                            className="items-center p-3 bg-surface-alt/50 hover:bg-surface-alt group"
                          >
                            <DocumentTextIcon className="w-8 h-8 text-primary-600 mr-3 group-hover:text-primary-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-heading group-hover:text-primary-400 transition-colors truncate">
                                {doc.name}
                              </p>
                              <p className="text-xs text-muted">
                                Görüntülemek için tıklayın
                              </p>
                            </div>
                          </a>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-muted italic">
                      Bu başvuru için yüklenen belge bulunmamaktadır.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="admin-card h-full flex flex-col items-center justify-center text-center p-12 opacity-50">
                <UserIcon className="w-16 h-16 text-muted mb-4" />
                <h3 className="text-xl font-medium text-muted">
                  Başvuru Seçin
                </h3>
                <p className="text-muted">
                  Detayları görüntülemek için soldaki listeden bir başvuru
                  seçin.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Reject Modal */}
        {isRejectModalOpen && (
          <div className="fixed inset-0 bg-heading/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-surface-elevated rounded-xl max-w-md w-full border border-border shadow-2xl">
              <div className="px-6 pb-6 pt-5">
                <h3 className="text-xl font-bold text-heading mb-4 leading-tight">
                  Başvuruyu Reddet
                </h3>
                <form onSubmit={handleReject}>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-muted mb-2">
                      Red Nedeni
                    </label>
                    <Textarea
                      required
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={4}
                      placeholder="Lütfen reddetme nedenini açıklayın (bu kullanıcıya gönderilecek)"
                    />
                  </div>
                  <div className="flex gap-3 justify-end">
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => setIsRejectModalOpen(false)}
                    >
                      İptal
                    </Button>
                    <Button variant="danger" size="md" type="submit">
                      Reddet
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
