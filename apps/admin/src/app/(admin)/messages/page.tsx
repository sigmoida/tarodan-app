"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/api";
import { Button, Spinner, StatusBadge } from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import {
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

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

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("pending");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadMessages();
  }, [page, filter]);

  // Map frontend filter values to API status values
  const mapFilterToApiStatus = (f: string) => {
    if (f === "all") return undefined;
    if (f === "pending") return "pending_approval";
    return f; // 'approved' and 'rejected' stay the same
  };

  const loadMessages = async () => {
    setLoading(true);
    try {
      const apiStatus = mapFilterToApiStatus(filter);
      const response = await adminApi.getMessages({
        page,
        limit: 20,
        status: apiStatus,
      });
      const apiMessages = response.data.data || response.data.messages || [];
      const meta = response.data.meta || {};
      const mappedMessages: Message[] = apiMessages.map((m: any) => ({
        id: m.id,
        content: m.content || m.originalContent || "",
        originalContent: m.content || m.originalContent || "",
        senderId: m.senderId || m.sender?.id || "",
        sender: {
          displayName: m.sender?.displayName || m.senderName || "Bilinmeyen",
          email: m.sender?.email || "",
        },
        receiver: {
          displayName:
            m.receiver?.displayName || m.receiverName || "Bilinmeyen",
          email: m.receiver?.email || "",
        },
        status: (m.status === "pending_approval"
          ? "pending"
          : m.status) as Message["status"],
        flaggedReason: m.flaggedReason || "",
        createdAt: m.createdAt,
        threadId: m.threadId || m.thread?.id || "",
      }));
      setMessages(mappedMessages);
      setTotal(meta.total ?? response.data.total ?? 0);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Load messages error:", error);
      toast.error("Mesajlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (messageId: string) => {
    try {
      await adminApi.approveMessage(messageId);
      toast.success("Mesaj onaylandı");
      loadMessages();
    } catch (error) {
      toast.error("İşlem başarısız");
    }
  };

  const handleReject = async (messageId: string) => {
    const reason = prompt("Red nedeni:");
    if (!reason || !reason.trim()) {
      toast.error("Red nedeni gereklidir");
      return;
    }
    try {
      await adminApi.rejectMessage(messageId, reason);
      toast.success("Mesaj reddedildi");
      loadMessages();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "İşlem başarısız");
    }
  };

  const handleBanSender = async (message: Message) => {
    if (!message.senderId) {
      toast.error("Gönderen bilgisi bulunamadı");
      return;
    }
    const reason = window.prompt(
      "Yasaklama sebebi (mesaj ihlali):",
      "Mesaj kuralları ihlali",
    );
    if (reason === null) return;
    try {
      await adminApi.banUser(
        message.senderId,
        reason.trim() || "Mesaj kuralları ihlali",
      );
      toast.success("Gönderen kullanıcı engellendi");
      loadMessages();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "İşlem başarısız");
    }
  };

  const messageStatusConfig: Record<string, StatusConfig> = {
    pending: { label: "Onay Bekliyor", variant: "warning" },
    approved: { label: "Onaylandı", variant: "success" },
    rejected: { label: "Reddedildi", variant: "danger" },
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Mesaj Moderation</h1>
          <p className="text-muted mt-1">
            {filter === "all"
              ? `Toplam ${total} mesaj`
              : filter === "pending"
                ? `${total} mesaj onay bekliyor — Bekleyen mesajları onaylayın, reddedin veya göndereni yasaklayın`
                : filter === "approved"
                  ? `${total} onaylanmış mesaj`
                  : `${total} reddedilen mesaj`}
          </p>
        </div>

        <div className="flex gap-4">
          {(["all", "pending", "approved", "rejected"] as const).map((f) => (
            <Button
              variant="secondary"
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === f
                  ? "bg-primary-500 text-heading"
                  : "bg-surface-alt text-muted hover:text-heading"
              }`}
            >
              {f === "all"
                ? "Tümü"
                : f === "pending"
                  ? "Bekleyenler"
                  : f === "approved"
                    ? "Onaylananlar"
                    : "Reddedilenler"}
            </Button>
          ))}
        </div>

        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Gönderen</th>
                  <th>Alıcı</th>
                  <th>Mesaj</th>
                  <th>Uyarılar</th>
                  <th>Durum</th>
                  <th>Tarih</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8">
                      <Spinner size="lg" className="mx-auto" />
                    </td>
                  </tr>
                ) : messages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted">
                      Mesaj bulunamadı
                    </td>
                  </tr>
                ) : (
                  messages.map((message) => (
                    <tr key={message.id}>
                      <td>
                        <div>
                          <p className="font-medium text-heading">
                            {message.sender.displayName}
                          </p>
                          <p className="text-xs text-muted">
                            {message.sender.email}
                          </p>
                        </div>
                      </td>
                      <td>
                        <div>
                          <p className="font-medium text-heading">
                            {message.receiver.displayName}
                          </p>
                          <p className="text-xs text-muted">
                            {message.receiver.email}
                          </p>
                        </div>
                      </td>
                      <td>
                        <p className="text-sm text-muted line-clamp-2 max-w-md">
                          {message.originalContent || message.content}
                        </p>
                      </td>
                      <td>
                        {message.flaggedReason ? (
                          <span className="badge badge-warning text-xs">
                            {message.flaggedReason}
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge
                          status={message.status}
                          config={messageStatusConfig}
                        />
                      </td>
                      <td className="text-sm text-muted">
                        {new Date(message.createdAt).toLocaleDateString(
                          "tr-TR",
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {message.status === "pending" && (
                            <>
                              <Button
                                variant="secondary"
                                onClick={() => handleApprove(message.id)}
                                className="p-2 text-success-700 hover:bg-success-500/10 rounded-lg"
                                title="Onayla"
                              >
                                <CheckIcon className="h-5 w-5" />
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => handleReject(message.id)}
                                className="p-2 text-danger-600 hover:bg-danger-500/10 rounded-lg"
                                title="Reddet"
                              >
                                <XMarkIcon className="h-5 w-5" />
                              </Button>
                              {message.senderId && (
                                <Button
                                  variant="secondary"
                                  onClick={() => handleBanSender(message)}
                                  className="p-2 text-primary-700 hover:bg-primary-500/10 rounded-lg"
                                  title="Göndereni yasakla (hesap engeli)"
                                >
                                  <NoSymbolIcon className="h-5 w-5" />
                                </Button>
                              )}
                            </>
                          )}
                          <Button
                            variant="secondary"
                            className="p-2 text-muted hover:text-heading hover:bg-surface-alt rounded-lg"
                            title="Detay"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            Sayfa {page} / {Math.ceil(total / 20)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Önceki
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 20)}
            >
              Sonraki
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
