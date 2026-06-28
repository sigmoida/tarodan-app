"use client";

import { adminApi } from "@/lib/api";
import { Button, StatusBadge } from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import { ActionButtons, ActionIconButton } from "@/components/admin-list";
import {
  CheckIcon,
  XMarkIcon,
  NoSymbolIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";
import { usePrompt } from "@/components/PromptProvider";
import { useMemo } from "react";
import { useRouter } from "next/navigation";

// ─── Tipler ────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  content: string;
  originalContent: string;
  senderId: string;
  sender: { displayName: string; email: string };
  receiver: { displayName: string; email: string };
  status: "pending" | "approved" | "rejected";
  flaggedReason: string;
  createdAt: string;
  threadId: string;
}

// ─── Sabitler ──────────────────────────────────────────────────────────────

const filterOptions = [
  { value: "all", label: "Tümü" },
  { value: "pending", label: "Bekleyenler" },
  { value: "approved", label: "Onaylananlar" },
  { value: "rejected", label: "Reddedilenler" },
] as const;

/** Frontend filtre değerini API status değerine çevirir */
function mapFilterToApiStatus(f: string): string | undefined {
  if (f === "all") return undefined;
  if (f === "pending") return "pending_approval";
  return f; // 'approved' ve 'rejected' olduğu gibi kalır
}

/** Ham API satırını Message tipine dönüştürür */
function mapMessage(m: any): Message {
  return {
    id: m.id,
    content: m.content || m.originalContent || "",
    originalContent: m.content || m.originalContent || "",
    senderId: m.senderId || m.sender?.id || "",
    sender: {
      displayName: m.sender?.displayName || m.senderName || "Bilinmeyen",
      email: m.sender?.email || "",
    },
    receiver: {
      displayName: m.receiver?.displayName || m.receiverName || "Bilinmeyen",
      email: m.receiver?.email || "",
    },
    status: (m.status === "pending_approval"
      ? "pending"
      : m.status) as Message["status"],
    flaggedReason: m.flaggedReason || "",
    createdAt: m.createdAt,
    threadId: m.threadId || m.thread?.id || "",
  };
}

const messageStatusConfig: Record<string, StatusConfig> = {
  sent: { label: "Gönderildi", variant: "default" },
  pending: { label: "Onay Bekliyor", variant: "warning" },
  pending_approval: { label: "Onay Bekliyor", variant: "warning" },
  approved: { label: "Onaylandı", variant: "success" },
  rejected: { label: "Reddedildi", variant: "danger" },
};

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const {
    rows: rawRows,
    total,
    page,
    setPage,
    totalPages,
    search,
    setSearch,
    onSearchSubmit,
    filters,
    setFilter,
    isLoading,
    refetch,
  } = useAdminResource<any>({
    queryKey: "messages",
    fetcher: (params) => {
      const { status: filterStatus, ...rest } = params;
      const apiStatus = mapFilterToApiStatus(filterStatus ?? "all");
      return adminApi.getMessages({
        ...rest,
        status: apiStatus,
      });
    },
    limit: 20,
    syncUrl: true,
    initialFilters: { status: "pending" },
    errorMessage: "Mesajlar yüklenemedi",
  });

  const messages: Message[] = useMemo(
    () => rawRows.map(mapMessage),
    [rawRows],
  );

  const prompt = usePrompt();
  const router = useRouter();

  // ── Aksiyonlar ─────────────────────────────────────────────────────────────

  const handleApprove = async (messageId: string) => {
    try {
      await adminApi.approveMessage(messageId);
      toast.success("Mesaj onaylandı");
      refetch();
    } catch {
      toast.error("İşlem başarısız");
    }
  };

  const handleRevert = async (messageId: string) => {
    try {
      await adminApi.revertMessage(messageId);
      toast.success("Mesaj bekleyene alındı");
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "İşlem başarısız");
    }
  };

  const handleReject = async (messageId: string) => {
    try {
      await adminApi.rejectMessage(messageId);
      toast.success("Mesaj reddedildi");
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "İşlem başarısız");
    }
  };

  const handleBanSender = async (message: Message) => {
    if (!message.senderId) {
      toast.error("Gönderen bilgisi bulunamadı");
      return;
    }
    const reason = await prompt({
      title: "Göndereni Yasakla",
      label: "Yasaklama sebebi (mesaj ihlali)",
      defaultValue: "Mesaj kuralları ihlali",
      confirmLabel: "Yasakla",
      destructive: true,
      required: false,
    });
    if (reason === null) return;
    try {
      await adminApi.banUser(
        message.senderId,
        reason.trim() || "Mesaj kuralları ihlali",
      );
      toast.success("Gönderen kullanıcı engellendi");
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "İşlem başarısız");
    }
  };

  // ── Kolon tanımları ────────────────────────────────────────────────────────

  const columns: ColumnDef<Message, any>[] = [
    {
      header: "Gönderen",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-heading">
            {row.original.sender.displayName}
          </p>
          <p className="text-xs text-muted">{row.original.sender.email}</p>
        </div>
      ),
    },
    {
      header: "Alıcı",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-heading">
            {row.original.receiver.displayName}
          </p>
          <p className="text-xs text-muted">{row.original.receiver.email}</p>
        </div>
      ),
    },
    {
      header: "Mesaj",
      cell: ({ row }) => (
        <p className="text-sm text-muted line-clamp-2 max-w-md">
          {row.original.originalContent || row.original.content}
        </p>
      ),
    },
    {
      header: "Uyarılar",
      cell: ({ row }) =>
        row.original.flaggedReason ? (
          <span className="badge badge-warning text-xs">
            {row.original.flaggedReason}
          </span>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          config={messageStatusConfig}
        />
      ),
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="text-sm text-muted">
          {new Date(row.original.createdAt).toLocaleDateString("tr-TR")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => {
        const message = row.original;
        return (
          <ActionButtons>
            {(message.status === "pending" || message.status === "rejected") && (
              <ActionIconButton
                icon={CheckIcon}
                onClick={() => handleApprove(message.id)}
                title="Onayla"
                variant="success"
              />
            )}
            {message.status === "rejected" ? (
              <ActionIconButton
                icon={ArrowUturnLeftIcon}
                onClick={() => handleRevert(message.id)}
                title="Geri Al (Bekleyene çevir)"
                variant="primary"
              />
            ) : (
              <ActionIconButton
                icon={XMarkIcon}
                onClick={() => handleReject(message.id)}
                title="Reddet"
                variant="danger"
              />
            )}
            {message.senderId && (
              <ActionIconButton
                icon={NoSymbolIcon}
                onClick={() => handleBanSender(message)}
                title="Göndereni yasakla"
                variant="primary"
              />
            )}
          </ActionButtons>
        );
      },
    },
  ];

  // ── Filtre butonları ───────────────────────────────────────────────────────

  const currentFilter = filters.status ?? "pending";

  const filterButtons = (
    <div className="flex gap-4">
      {filterOptions.map((opt) => (
        <Button
          variant="secondary"
          key={opt.value}
          onClick={() => setFilter("status", opt.value)}
          className={`px-4 py-2 rounded-lg transition-colors ${
            currentFilter === opt.value
              ? "bg-primary-500 text-heading"
              : "bg-surface-alt text-muted hover:text-heading"
          }`}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );

  // ── Description ────────────────────────────────────────────────────────────

  const description =
    currentFilter === "all"
      ? `Toplam ${total} mesaj`
      : currentFilter === "pending"
        ? `${total} mesaj onay bekliyor — Bekleyen mesajları onaylayın, reddedin veya göndereni yasaklayın`
        : currentFilter === "approved"
          ? `${total} onaylanmış mesaj`
          : `${total} reddedilen mesaj`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ResourceListPage<Message>
      title="Mesaj Moderation"
      description={description}
      search={{ placeholder: "Mesaj içeriği, gönderen/alıcı ara..." }}
      searchValue={search}
      onSearchChange={setSearch}
      onSearchSubmit={onSearchSubmit}
      filters={filterButtons}
      columns={columns}
      data={messages}
      loading={isLoading}
      emptyText="Mesaj bulunamadı"
      getRowId={(m) => m.id}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      onRowClick={(m) => router.push(`/messages/${m.id}`)}
    />
  );
}
