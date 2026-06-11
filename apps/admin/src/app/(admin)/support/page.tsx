"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/api";
import {
  Button,
  Checkbox,
  Select,
  StatusBadge,
  Textarea,
  enumLabel,
  ticketStatusConfig,
  ticketPriorityConfig,
  ticketCategoryConfig,
} from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { PageHeader, FilterToolbar } from "@/components/admin-list";
import {
  UserCircleIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  FunnelIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  creator: {
    id: string;
    displayName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
  messages?: TicketMessage[];
}

interface TicketMessage {
  id: string;
  content: string;
  isInternal: boolean;
  sender: {
    id: string;
    displayName: string;
  };
  createdAt: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "Tüm Durumlar" },
  { value: "open", label: "Açık" },
  { value: "in_progress", label: "İşlemde" },
  { value: "waiting_customer", label: "Müşteri Bekleniyor" },
  { value: "resolved", label: "Çözüldü" },
  { value: "closed", label: "Kapatıldı" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "Tüm Öncelikler" },
  { value: "low", label: "Düşük" },
  { value: "medium", label: "Orta" },
  { value: "high", label: "Yüksek" },
  { value: "urgent", label: "Acil" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Tüm Kategoriler" },
  { value: "payment", label: "Ödeme" },
  { value: "shipping", label: "Kargo" },
  { value: "trade", label: "Takas" },
  { value: "account", label: "Hesap" },
  { value: "product", label: "Ürün" },
  { value: "technical", label: "Teknik" },
  { value: "other", label: "Diğer" },
];

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(
    null,
  );
  const [replyContent, setReplyContent] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [filters, setFilters] = useState({
    status: "",
    priority: "",
    category: "",
    search: "",
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadTickets();
  }, [filters, page]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        limit: 20,
      };
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      if (filters.category) params.category = filters.category;
      if (filters.search) params.search = filters.search;

      const response = await adminApi.getTickets(params);
      const data = response.data;
      setTickets(data.data || data.tickets || []);
      setTotalPages(data.meta?.totalPages || 1);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to load tickets:", error);
      // Use mock data for display
      setTickets([
        {
          id: "1",
          ticketNumber: "TKT-001",
          subject: "Ödeme işlemim gerçekleşmedi",
          category: "payment",
          priority: "high",
          status: "open",
          creator: {
            id: "1",
            displayName: "Ahmet Yılmaz",
            email: "ahmet@example.com",
          },
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 1800000).toISOString(),
        },
        {
          id: "2",
          ticketNumber: "TKT-002",
          subject: "Kargo takip numarası hatalı",
          category: "shipping",
          priority: "medium",
          status: "in_progress",
          creator: {
            id: "2",
            displayName: "Mehmet Demir",
            email: "mehmet@example.com",
          },
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: "3",
          ticketNumber: "TKT-003",
          subject: "Takas teklifim reddedildi ama sebep belirtilmedi",
          category: "trade",
          priority: "low",
          status: "waiting_customer",
          creator: {
            id: "3",
            displayName: "Ayşe Kaya",
            email: "ayse@example.com",
          },
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 43200000).toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadTicketDetails = async (ticketId: string) => {
    try {
      const response = await adminApi.getTicket(ticketId);
      setSelectedTicket(response.data);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to load ticket details:", error);
      // Mock data for selected ticket
      const ticket = tickets.find((t) => t.id === ticketId);
      if (ticket) {
        setSelectedTicket({
          ...ticket,
          messages: [
            {
              id: "1",
              content:
                "Merhaba, ödeme işlemim gerçekleşmedi. Kartımdan para çekildi ama sipariş oluşmadı.",
              isInternal: false,
              sender: ticket.creator,
              createdAt: ticket.createdAt,
            },
          ],
        });
      }
    }
  };

  const handleReply = async () => {
    if (!selectedTicket || !replyContent.trim()) return;

    try {
      await adminApi.replyToTicket(selectedTicket.id, replyContent);
      toast.success("Yanıt gönderildi");
      setReplyContent("");
      loadTicketDetails(selectedTicket.id);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to send reply:", error);
      toast.error("Yanıt gönderilemedi");
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      await adminApi.updateTicket(ticketId, { status: newStatus });
      toast.success("Durum güncellendi");
      loadTickets();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status: newStatus });
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to update status:", error);
      toast.error("Durum güncellenemedi");
    }
  };

  const supportStatusConfig: Record<string, StatusConfig> = {
    open: { label: "Açık", variant: "info" },
    in_progress: { label: "İşlemde", variant: "warning" },
    waiting_customer: { label: "Müşteri Bekleniyor", variant: "secondary" },
    resolved: { label: "Çözüldü", variant: "success" },
    closed: { label: "Kapatıldı", variant: "default" },
  };

  const priorityConfig: Record<string, StatusConfig> = {
    low: { label: "Düşük", variant: "secondary" },
    medium: { label: "Orta", variant: "info" },
    high: { label: "Yüksek", variant: "warning" },
    urgent: { label: "Acil", variant: "danger" },
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      payment: "Ödeme",
      shipping: "Kargo",
      trade: "Takas",
      account: "Hesap",
      product: "Ürün",
      technical: "Teknik",
      other: "Diğer",
    };
    return labels[category] || category;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 1) return "Az önce";
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    return date.toLocaleDateString("tr-TR");
  };

  const columns: ColumnDef<SupportTicket, any>[] = [
    {
      header: "Talep No",
      cell: ({ row }) => (
        <span className="text-xs text-muted">{row.original.ticketNumber}</span>
      ),
    },
    {
      header: "Konu",
      cell: ({ row }) => (
        <span className="text-heading font-medium line-clamp-1">
          {row.original.subject}
        </span>
      ),
    },
    {
      id: "creator",
      header: () => (
        <span className="flex items-center gap-1">
          <UserCircleIcon className="h-4 w-4" />
          Oluşturan
        </span>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted">
          {row.original.creator.displayName}
        </span>
      ),
    },
    {
      header: "Kategori",
      cell: ({ row }) => (
        <span className="text-sm text-muted">
          {enumLabel(ticketCategoryConfig, row.original.category, row.original.category)}
        </span>
      ),
    },
    {
      header: "Öncelik",
      cell: ({ row }) => (
        <StatusBadge status={row.original.priority} config={priorityConfig} />
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} config={supportStatusConfig} />
      ),
    },
    {
      header: "Oluşturma",
      cell: ({ row }) => (
        <span className="text-xs text-muted">
          {formatTime(row.original.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="flex h-[calc(100vh-8rem)]">
        {/* Ticket List */}
        <div
          className={`${selectedTicket ? "w-1/3" : "w-full"} border-r border-border flex flex-col`}
        >
          {/* Header */}
          <div className="p-4 border-b border-border space-y-4">
            <PageHeader title="Destek Talepleri" />

            {/* Search + Filters */}
            <FilterToolbar
              search={filters.search}
              onSearchChange={(v) => setFilters({ ...filters, search: v })}
            >
              <Select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className="w-auto bg-surface-alt"
                selectSize="sm"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <Select
                value={filters.priority}
                onChange={(e) =>
                  setFilters({ ...filters, priority: e.target.value })
                }
                className="w-auto bg-surface-alt"
                selectSize="sm"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <Select
                value={filters.category}
                onChange={(e) =>
                  setFilters({ ...filters, category: e.target.value })
                }
                className="w-auto bg-surface-alt"
                selectSize="sm"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FilterToolbar>
          </div>

          {/* Ticket List */}
          <div className="flex-1 overflow-y-auto p-4">
            <DataTable
              columns={columns}
              data={tickets}
              loading={loading}
              emptyText="Destek talebi bulunamadı"
              getRowId={(t) => t.id}
              onRowClick={(t) => loadTicketDetails(t.id)}
            />
          </div>
        </div>

        {/* Ticket Detail */}
        {selectedTicket && (
          <div className="flex-1 flex flex-col">
            {/* Detail Header */}
            <div className="p-4 border-b border-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-muted shrink-0">
                    {selectedTicket.ticketNumber}
                  </span>
                  <span className="shrink-0">
                    <StatusBadge
                      status={selectedTicket.status}
                      config={supportStatusConfig}
                    />
                  </span>
                  <span className="shrink-0">
                    <StatusBadge
                      status={selectedTicket.priority}
                      config={priorityConfig}
                    />
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-heading truncate">
                  {selectedTicket.subject}
                </h2>
              </div>
              <Button
                variant="secondary"
                onClick={() => setSelectedTicket(null)}
                className="text-muted hover:text-heading p-2 shrink-0"
              >
                <XMarkIcon className="h-6 w-6" />
              </Button>
            </div>

            {/* Ticket Info */}
            <div className="p-4 border-b border-border bg-surface-elevated/50">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="min-w-0">
                  <span className="text-muted">Oluşturan</span>
                  <p className="text-heading truncate">
                    {selectedTicket.creator.displayName}
                  </p>
                  <p className="text-muted text-xs truncate">
                    {selectedTicket.creator.email}
                  </p>
                </div>
                <div>
                  <span className="text-muted">Kategori</span>
                  <p className="text-heading">
                    {getCategoryLabel(selectedTicket.category)}
                  </p>
                </div>
                <div>
                  <span className="text-muted">Oluşturulma</span>
                  <p className="text-heading">
                    {new Date(selectedTicket.createdAt).toLocaleString("tr-TR")}
                  </p>
                </div>
              </div>

              {/* Status Change */}
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-muted">Durum:</span>
                <Select
                  value={selectedTicket.status}
                  onChange={(e) =>
                    handleStatusChange(selectedTicket.id, e.target.value)
                  }
                  className="w-auto bg-surface-alt"
                  selectSize="sm"
                >
                  {STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedTicket.messages?.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg p-4 ${
                    message.isInternal
                      ? "bg-warning-900/20 border border-warning-700"
                      : "bg-surface-alt"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserCircleIcon className="h-5 w-5 text-muted shrink-0" />
                      <span className="text-heading font-medium truncate">
                        {message.sender.displayName}
                      </span>
                      {message.isInternal && (
                        <span className="shrink-0 text-xs bg-warning-50 text-warning-700 px-2 py-0.5 rounded">
                          İç Not
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted shrink-0">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="text-muted whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
              ))}
            </div>

            {/* Reply Box */}
            <div className="p-4 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  id="internalNote"
                  checked={isInternalNote}
                  onChange={(e) => setIsInternalNote(e.target.checked)}
                  label="İç not olarak ekle (kullanıcı göremez)"
                />
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Yanıtınızı yazın..."
                  rows={3}
                  className="flex-1 bg-surface-alt px-4 text-heading resize-none"
                />
                <Button
                  onClick={handleReply}
                  disabled={!replyContent.trim()}
                  className="self-end"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
