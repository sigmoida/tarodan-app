"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/api";
import {
  Button,
  Checkbox,
  Input,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import {
  ChatBubbleLeftRightIcon,
  UserCircleIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
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

  return (
    <>
      <div className="flex h-[calc(100vh-8rem)]">
        {/* Ticket List */}
        <div
          className={`${selectedTicket ? "w-1/3" : "w-full"} border-r border-gray-200 flex flex-col`}
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-900 mb-4">
              Destek Talepleri
            </h1>

            {/* Search */}
            <div className="relative mb-4">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
              <Input
                type="text"
                placeholder="Ara..."
                value={filters.search}
                onChange={(e) =>
                  setFilters({ ...filters, search: e.target.value })
                }
                className="bg-gray-100 pl-10 pr-4 text-gray-900"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <Select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className="w-auto bg-gray-100"
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
                className="w-auto bg-gray-100"
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
                className="w-auto bg-gray-100"
                selectSize="sm"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Ticket List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Spinner size="lg" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                <ChatBubbleLeftRightIcon className="h-8 w-8 mb-2" />
                <p>Destek talebi bulunamadı</p>
              </div>
            ) : (
              tickets.map((ticket) => (
                <Button
                  variant="secondary"
                  key={ticket.id}
                  onClick={() => loadTicketDetails(ticket.id)}
                  className={`w-full p-4 border-b border-gray-200 text-left hover:bg-gray-100/50 transition-colors ${
                    selectedTicket?.id === ticket.id ? "bg-gray-100" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs text-gray-500">
                      {ticket.ticketNumber}
                    </span>
                    <StatusBadge
                      status={ticket.status}
                      config={supportStatusConfig}
                    />
                  </div>
                  <h3 className="text-gray-900 font-medium mb-1 line-clamp-1">
                    {ticket.subject}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <UserCircleIcon className="h-4 w-4" />
                    <span>{ticket.creator.displayName}</span>
                    <span>•</span>
                    <span>{getCategoryLabel(ticket.category)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <StatusBadge
                      status={ticket.priority}
                      config={priorityConfig}
                    />
                    <span className="text-xs text-gray-500">
                      {formatTime(ticket.createdAt)}
                    </span>
                  </div>
                </Button>
              ))
            )}
          </div>
        </div>

        {/* Ticket Detail */}
        {selectedTicket && (
          <div className="flex-1 flex flex-col">
            {/* Detail Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-gray-500">
                    {selectedTicket.ticketNumber}
                  </span>
                  <StatusBadge
                    status={selectedTicket.status}
                    config={supportStatusConfig}
                  />
                  <StatusBadge
                    status={selectedTicket.priority}
                    config={priorityConfig}
                  />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedTicket.subject}
                </h2>
              </div>
              <Button
                variant="secondary"
                onClick={() => setSelectedTicket(null)}
                className="text-gray-500 hover:text-gray-900 p-2"
              >
                <XMarkIcon className="h-6 w-6" />
              </Button>
            </div>

            {/* Ticket Info */}
            <div className="p-4 border-b border-gray-200 bg-white/50">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Oluşturan</span>
                  <p className="text-gray-900">
                    {selectedTicket.creator.displayName}
                  </p>
                  <p className="text-gray-500 text-xs">
                    {selectedTicket.creator.email}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Kategori</span>
                  <p className="text-gray-900">
                    {getCategoryLabel(selectedTicket.category)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Oluşturulma</span>
                  <p className="text-gray-900">
                    {new Date(selectedTicket.createdAt).toLocaleString("tr-TR")}
                  </p>
                </div>
              </div>

              {/* Status Change */}
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-gray-500">Durum:</span>
                <Select
                  value={selectedTicket.status}
                  onChange={(e) =>
                    handleStatusChange(selectedTicket.id, e.target.value)
                  }
                  className="w-auto bg-gray-100"
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
                      : "bg-gray-100"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <UserCircleIcon className="h-5 w-5 text-gray-500" />
                      <span className="text-gray-900 font-medium">
                        {message.sender.displayName}
                      </span>
                      {message.isInternal && (
                        <span className="text-xs bg-warning-50 text-warning-700 px-2 py-0.5 rounded">
                          İç Not
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="text-gray-600 whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
              ))}
            </div>

            {/* Reply Box */}
            <div className="p-4 border-t border-gray-200">
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
                  className="flex-1 bg-gray-100 px-4 text-gray-900 resize-none"
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
