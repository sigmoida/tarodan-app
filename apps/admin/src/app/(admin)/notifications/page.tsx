"use client";

import { useState, useCallback } from "react";
import { adminApi } from "@/lib/api";
import {
  BellIcon,
  PaperAirplaneIcon,
  ClockIcon,
  XCircleIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  UsersIcon,
  UserIcon,
  AdjustmentsHorizontalIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import {
  Button,
  Input,
  Select,
  Textarea,
  enumLabel,
  notificationChannelConfig,
  deliveryStatusConfig,
} from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import { ActionButtons, ActionIconButton } from "@/components/admin-list";
import { PageHeader } from "@/components/admin-list";
import { AdminTabs } from "@/components/AdminTabs";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";
import { useConfirm } from "@/components/ConfirmProvider";

// ─── Tipler ────────────────────────────────────────────────────────────────

interface NotificationLog {
  id: string;
  userId: string;
  channel: string;
  type: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
  user?: {
    displayName: string;
    email: string;
  };
}

interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  channels: string[];
  targetType: string;
  scheduledFor: string;
  status: string;
  createdAt: string;
}

type TabType = "send" | "scheduled" | "history";

// ─── Sabitler ──────────────────────────────────────────────────────────────

const TABS = [
  { key: "send", label: "Bildirim Gönder", icon: PaperAirplaneIcon },
  { key: "scheduled", label: "Zamanlanmış", icon: ClockIcon },
  { key: "history", label: "Geçmiş", icon: BellIcon },
];

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<TabType>("send");

  // ── Gönderim formu ────────────────────────────────────────────────────────
  const [sendForm, setSendForm] = useState({
    title: "",
    body: "",
    channels: ["push"] as string[],
    targetType: "all" as "all" | "segment" | "user_ids",
    userIds: "",
    isSeller: undefined as boolean | undefined,
    membershipTier: "",
  });
  const [sending, setSending] = useState(false);

  // ── Zamanlama modalı ──────────────────────────────────────────────────────
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // ── useAdminResource — tek çağrı; queryKey + fetcher activeTab'a göre branşlar ──
  // "send" sekmesinde list API çağrısı yapılmaz (fetcher null-safe boş yanıt döner).
  // "scheduled" sekmesinde getScheduledNotifications, "history" sekmesinde getNotificationHistory.
  // History sekmesinde başlık/içerik/kullanıcı araması desteklenir (backend search).
  const {
    rows,
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
  } = useAdminResource<ScheduledNotification | NotificationLog>({
    queryKey: `notifications-${activeTab}`,
    fetcher: (params) => {
      if (activeTab === "scheduled") {
        return adminApi.getScheduledNotifications({ status: "pending" });
      }
      if (activeTab === "history") {
        return adminApi.getNotificationHistory({
          page: params.page,
          limit: params.limit,
          channel: params.channel || undefined,
          status: params.status || undefined,
          search: params.search || undefined,
        });
      }
      // "send" sekmesinde liste fetch yapılmaz — boş yanıt
      return Promise.resolve({ data: { data: [], meta: { total: 0 } } } as any);
    },
    limit: activeTab === "history" ? 20 : 100,
    initialFilters: activeTab === "history" ? { channel: "", status: "" } : {},
    errorMessage:
      activeTab === "scheduled"
        ? "Zamanlanmış bildirimler yüklenemedi"
        : "Bildirim geçmişi yüklenemedi",
  });

  // ── İptal aksiyonu ────────────────────────────────────────────────────────
  const handleCancelScheduled = useCallback(
    async (id: string) => {
      if (
        !(await confirm({
          description:
            "Bu zamanlanmış bildirimi iptal etmek istiyor musunuz?",
          destructive: true,
        }))
      )
        return;

      try {
        await adminApi.cancelScheduledNotification(id);
        toast.success("Bildirim iptal edildi");
        refetch();
      } catch (error: any) {
        toast.error(error.response?.data?.message || "İptal başarısız");
      }
    },
    [confirm, refetch],
  );

  // ── Kolon tanımları ────────────────────────────────────────────────────────

  const scheduledColumns: ColumnDef<ScheduledNotification, any>[] = [
    {
      header: "Başlık",
      cell: ({ row }) => (
        <span className="font-medium text-heading">
          {(row.original as ScheduledNotification).title}
        </span>
      ),
    },
    {
      header: "Kanallar",
      cell: ({ row }) => (
        <span className="text-muted">
          {(row.original as ScheduledNotification).channels?.join(", ")}
        </span>
      ),
    },
    {
      header: "Hedef",
      cell: ({ row }) => (
        <span className="text-muted">
          {(row.original as ScheduledNotification).targetType}
        </span>
      ),
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="text-muted">
          {new Date(
            (row.original as ScheduledNotification).scheduledFor,
          ).toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <span className="badge badge-warning">
          {enumLabel(
            deliveryStatusConfig,
            (row.original as ScheduledNotification).status,
          )}
        </span>
      ),
    },
    {
      id: "actions",
      header: "İşlem",
      cell: ({ row }) => (
        <ActionButtons>
          <ActionIconButton
            icon={XCircleIcon}
            onClick={() =>
              handleCancelScheduled((row.original as ScheduledNotification).id)
            }
            title="İptal Et"
            variant="danger"
          />
        </ActionButtons>
      ),
    },
  ];

  const historyColumns: ColumnDef<NotificationLog, any>[] = [
    {
      header: "Kullanıcı",
      cell: ({ row }) => (
        <span className="text-heading">
          {(row.original as NotificationLog).user?.displayName ||
            (row.original as NotificationLog).userId}
        </span>
      ),
    },
    {
      header: "Kanal",
      cell: ({ row }) => (
        <span className="text-muted">
          {enumLabel(
            notificationChannelConfig,
            (row.original as NotificationLog).channel,
          )}
        </span>
      ),
    },
    {
      header: "Başlık",
      cell: ({ row }) => (
        <span className="text-heading">
          {(row.original as NotificationLog).title}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => {
        const status = (row.original as NotificationLog).status;
        return (
          <span
            className={`badge ${
              status === "sent" || status === "delivered"
                ? "badge-success"
                : status === "failed"
                  ? "badge-danger"
                  : "badge-warning"
            }`}
          >
            {enumLabel(deliveryStatusConfig, status)}
          </span>
        );
      },
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="text-muted">
          {new Date(
            (row.original as NotificationLog).createdAt,
          ).toLocaleString("tr-TR")}
        </span>
      ),
    },
  ];

  // ── Aktif sekme: liste prop'ları ──────────────────────────────────────────
  const activeColumns =
    activeTab === "scheduled"
      ? (scheduledColumns as ColumnDef<any, any>[])
      : activeTab === "history"
        ? (historyColumns as ColumnDef<any, any>[])
        : ([] as ColumnDef<any, any>[]);

  const activeEmptyText =
    activeTab === "scheduled"
      ? "Zamanlanmış bildirim yok"
      : activeTab === "history"
        ? "Bildirim geçmişi boş"
        : undefined;

  // History filtreler (channel + status); search yok
  const historyFilters =
    activeTab === "history" ? (
      <>
        <Select
          value={filters.channel ?? ""}
          onChange={(e) => setFilter("channel", e.target.value)}
          className="w-48"
        >
          <option value="">Tüm Kanallar</option>
          <option value="push">Push</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </Select>
        <Select
          value={filters.status ?? ""}
          onChange={(e) => setFilter("status", e.target.value)}
          className="w-48"
        >
          <option value="">Tüm Durumlar</option>
          <option value="pending">Beklemede</option>
          <option value="sent">Gönderildi</option>
          <option value="delivered">Teslim Edildi</option>
          <option value="failed">Başarısız</option>
        </Select>
      </>
    ) : undefined;

  // ── Gönderim formu yardımcıları ───────────────────────────────────────────

  const toggleChannel = (channel: string) => {
    setSendForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));
  };

  const handleSendNotification = async () => {
    if (!sendForm.title || !sendForm.body) {
      toast.error("Başlık ve içerik zorunludur");
      return;
    }
    if (sendForm.channels.length === 0) {
      toast.error("En az bir kanal seçmelisiniz");
      return;
    }

    const data: any = {
      title: sendForm.title,
      body: sendForm.body,
      channels: sendForm.channels,
      targetType: sendForm.targetType,
    };

    if (sendForm.targetType === "user_ids") {
      data.userIds = sendForm.userIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (data.userIds.length === 0) {
        toast.error("En az bir kullanıcı ID girin");
        return;
      }
    }

    if (sendForm.targetType === "segment") {
      data.segmentCriteria = {};
      if (sendForm.isSeller !== undefined)
        data.segmentCriteria.isSeller = sendForm.isSeller;
      if (sendForm.membershipTier)
        data.segmentCriteria.membershipTier = sendForm.membershipTier;
    }

    setSending(true);
    try {
      const response = await adminApi.sendNotification(data);
      toast.success(response.data?.message || "Bildirim gönderildi");
      setSendForm({
        title: "",
        body: "",
        channels: ["push"],
        targetType: "all",
        userIds: "",
        isSeller: undefined,
        membershipTier: "",
      });
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Gönderim başarısız");
    } finally {
      setSending(false);
    }
  };

  const handleScheduleNotification = async () => {
    if (!scheduleDate) {
      toast.error("Tarih seçmelisiniz");
      return;
    }

    const data: any = {
      title: sendForm.title,
      body: sendForm.body,
      channels: sendForm.channels,
      targetType: sendForm.targetType,
      scheduledFor: new Date(scheduleDate).toISOString(),
    };

    if (sendForm.targetType === "user_ids") {
      data.userIds = sendForm.userIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (sendForm.targetType === "segment") {
      data.segmentCriteria = {};
      if (sendForm.isSeller !== undefined)
        data.segmentCriteria.isSeller = sendForm.isSeller;
      if (sendForm.membershipTier)
        data.segmentCriteria.membershipTier = sendForm.membershipTier;
    }

    setScheduling(true);
    try {
      await adminApi.scheduleNotification(data);
      toast.success("Bildirim zamanlandı");
      setShowScheduleModal(false);
      setScheduleDate("");
      // Zamanlanmış sekmesine geç (refetch queryKey değişimiyle otomatik gerçekleşir)
      setActiveTab("scheduled");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Zamanlama başarısız");
    } finally {
      setScheduling(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Kanal meta
  const channelMeta = [
    { key: "push", label: "Push", icon: DevicePhoneMobileIcon, desc: "Mobil uygulama" },
    { key: "email", label: "E-posta", icon: EnvelopeIcon, desc: "E-posta gelen kutusu" },
    { key: "sms", label: "SMS", icon: ChatBubbleLeftRightIcon, desc: "Kısa mesaj" },
  ];

  // Hedef meta
  const targetMeta = [
    { key: "all", label: "Tüm Kullanıcılar", icon: UsersIcon, desc: "Platforma kayıtlı herkes" },
    { key: "segment", label: "Segment", icon: AdjustmentsHorizontalIcon, desc: "Satıcı/alıcı, üyelik tipi" },
    { key: "user_ids", label: "Belirli Kullanıcılar", icon: UserIcon, desc: "ID listesiyle hedefleme" },
  ];

  const titleOk = sendForm.title.length > 0 && sendForm.title.length <= 65;
  const bodyOk = sendForm.body.length > 0 && sendForm.body.length <= 240;
  const canSend = titleOk && bodyOk && sendForm.channels.length > 0;

  // "send" sekmesi: liste değil, form içeriği → ResourceListPage kullanılmaz;
  // PageHeader + AdminTabs + form manuel render edilir.
  if (activeTab === "send") {
    return (
      <>
        <div className="space-y-6">
          <PageHeader
            title="Bildirim Yönetimi"
            description="Push, email ve SMS bildirimleri gönderin ve yönetin"
          />

          <AdminTabs
            tabs={TABS}
            value={activeTab}
            onChange={(k) => setActiveTab(k as TabType)}
          />

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
            {/* ── Sol: Form ── */}
            <div className="xl:col-span-3 space-y-5">

              {/* Mesaj içeriği */}
              <div className="admin-card p-6 space-y-5">
                <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">
                  Mesaj
                </h2>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-body">Başlık <span className="text-danger-500">*</span></label>
                    <span className={`text-xs ${sendForm.title.length > 65 ? "text-danger-500 font-medium" : "text-muted"}`}>
                      {sendForm.title.length}/65
                    </span>
                  </div>
                  <Input
                    type="text"
                    value={sendForm.title}
                    onChange={(e) => setSendForm({ ...sendForm, title: e.target.value })}
                    placeholder="Bildirim başlığı"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-body">İçerik <span className="text-danger-500">*</span></label>
                    <span className={`text-xs ${sendForm.body.length > 240 ? "text-danger-500 font-medium" : "text-muted"}`}>
                      {sendForm.body.length}/240
                    </span>
                  </div>
                  <Textarea
                    value={sendForm.body}
                    onChange={(e) => setSendForm({ ...sendForm, body: e.target.value })}
                    rows={4}
                    placeholder="Kullanıcılara gösterilecek bildirim metni"
                  />
                </div>
              </div>

              {/* Kanal seçimi */}
              <div className="admin-card p-6 space-y-4">
                <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">
                  Gönderim Kanalı
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  {channelMeta.map(({ key, label, icon: Icon, desc }) => {
                    const active = sendForm.channels.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleChannel(key)}
                        className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all ${
                          active
                            ? "border-primary-500 bg-primary-50 text-primary-700"
                            : "border-border bg-surface hover:border-border-strong text-muted hover:text-body"
                        }`}
                      >
                        {active && (
                          <CheckCircleIcon className="absolute top-2 right-2 w-4 h-4 text-primary-500" />
                        )}
                        <Icon className={`w-6 h-6 ${active ? "text-primary-500" : "text-subtle"}`} />
                        <span className="text-sm font-medium">{label}</span>
                        <span className={`text-xs leading-tight ${active ? "text-primary-600" : "text-muted"}`}>{desc}</span>
                      </button>
                    );
                  })}
                </div>
                {sendForm.channels.length === 0 && (
                  <p className="text-xs text-danger-500">En az bir kanal seçmelisiniz.</p>
                )}
              </div>

              {/* Hedef kitle */}
              <div className="admin-card p-6 space-y-4">
                <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">
                  Hedef Kitle
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  {targetMeta.map(({ key, label, icon: Icon, desc }) => {
                    const active = sendForm.targetType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSendForm({ ...sendForm, targetType: key as any })}
                        className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all ${
                          active
                            ? "border-primary-500 bg-primary-50 text-primary-700"
                            : "border-border bg-surface hover:border-border-strong text-muted hover:text-body"
                        }`}
                      >
                        {active && (
                          <CheckCircleIcon className="absolute top-2 right-2 w-4 h-4 text-primary-500" />
                        )}
                        <Icon className={`w-6 h-6 ${active ? "text-primary-500" : "text-subtle"}`} />
                        <span className="text-sm font-medium">{label}</span>
                        <span className={`text-xs leading-tight ${active ? "text-primary-600" : "text-muted"}`}>{desc}</span>
                      </button>
                    );
                  })}
                </div>

                {sendForm.targetType === "user_ids" && (
                  <div className="pt-1">
                    <label className="block text-sm font-medium text-body mb-1.5">
                      Kullanıcı ID&apos;leri
                      <span className="text-muted font-normal ml-1">(virgülle ayırın)</span>
                    </label>
                    <Input
                      type="text"
                      value={sendForm.userIds}
                      onChange={(e) => setSendForm({ ...sendForm, userIds: e.target.value })}
                      placeholder="uuid1, uuid2, uuid3"
                    />
                  </div>
                )}

                {sendForm.targetType === "segment" && (
                  <div className="grid grid-cols-2 gap-4 pt-1 p-4 bg-surface-alt rounded-xl border border-border">
                    <div>
                      <label className="block text-sm font-medium text-body mb-1.5">Satıcı Durumu</label>
                      <Select
                        value={sendForm.isSeller === undefined ? "" : sendForm.isSeller ? "true" : "false"}
                        onChange={(e) =>
                          setSendForm({
                            ...sendForm,
                            isSeller: e.target.value === "" ? undefined : e.target.value === "true",
                          })
                        }
                      >
                        <option value="">Hepsi</option>
                        <option value="true">Sadece Satıcılar</option>
                        <option value="false">Sadece Alıcılar</option>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-body mb-1.5">Üyelik Tipi</label>
                      <Select
                        value={sendForm.membershipTier}
                        onChange={(e) => setSendForm({ ...sendForm, membershipTier: e.target.value })}
                      >
                        <option value="">Hepsi</option>
                        <option value="free">Free</option>
                        <option value="premium">Premium</option>
                        <option value="business">Business</option>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Aksiyon butonları */}
              <div className="flex gap-3">
                <Button
                  onClick={handleSendNotification}
                  disabled={sending || !canSend}
                  className="flex-1 justify-center"
                >
                  <PaperAirplaneIcon className="h-4 w-4 mr-2 shrink-0" />
                  {sending ? "Gönderiliyor..." : "Şimdi Gönder"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowScheduleModal(true)}
                  disabled={!canSend}
                  className="flex-1 justify-center"
                >
                  <ClockIcon className="h-4 w-4 mr-2 shrink-0" />
                  Zamanla
                </Button>
              </div>
            </div>

            {/* ── Sağ: Önizleme ── */}
            <div className="xl:col-span-2">
              <div className="admin-card p-6 space-y-5 sticky top-6">
                <h2 className="text-sm font-semibold text-heading uppercase tracking-wide">
                  Canlı Önizleme
                </h2>

                {/* Push önizleme */}
                {sendForm.channels.includes("push") && (
                  <div>
                    <p className="text-xs text-muted mb-2 flex items-center gap-1">
                      <DevicePhoneMobileIcon className="w-3.5 h-3.5" /> Push bildirimi
                    </p>
                    <div className="rounded-2xl bg-neutral-900 p-4 shadow-lg">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center shrink-0">
                          <BellIcon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {sendForm.title || <span className="text-neutral-500 font-normal italic">Başlık girin…</span>}
                          </p>
                          <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2 leading-relaxed">
                            {sendForm.body || <span className="italic">İçerik girin…</span>}
                          </p>
                        </div>
                        <span className="text-xs text-neutral-500 shrink-0">şimdi</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* E-posta önizleme */}
                {sendForm.channels.includes("email") && (
                  <div>
                    <p className="text-xs text-muted mb-2 flex items-center gap-1">
                      <EnvelopeIcon className="w-3.5 h-3.5" /> E-posta
                    </p>
                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                      <div className="bg-surface-alt px-4 py-2.5 border-b border-border">
                        <p className="text-xs text-muted">Konu:</p>
                        <p className="text-sm font-medium text-heading truncate">
                          {sendForm.title || <span className="text-subtle italic">Başlık girin…</span>}
                        </p>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-sm text-body leading-relaxed line-clamp-3">
                          {sendForm.body || <span className="text-subtle italic">İçerik girin…</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* SMS önizleme */}
                {sendForm.channels.includes("sms") && (
                  <div>
                    <p className="text-xs text-muted mb-2 flex items-center gap-1">
                      <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> SMS
                    </p>
                    <div className="flex">
                      <div className="bg-success-100 text-success-900 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-xs shadow-sm text-sm leading-relaxed">
                        {sendForm.title && sendForm.body
                          ? `${sendForm.title}: ${sendForm.body}`
                          : <span className="text-muted italic">Mesaj önizlemesi…</span>
                        }
                      </div>
                    </div>
                  </div>
                )}

                {sendForm.channels.length === 0 && (
                  <div className="text-center py-8 text-muted">
                    <BellIcon className="w-10 h-10 mx-auto mb-2 text-subtle" />
                    <p className="text-sm">Önizleme için kanal seçin</p>
                  </div>
                )}

                {/* Özet */}
                <div className="pt-2 border-t border-border space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Hedef</span>
                    <span className="font-medium text-body">
                      {sendForm.targetType === "all" && "Tüm kullanıcılar"}
                      {sendForm.targetType === "segment" && "Segment"}
                      {sendForm.targetType === "user_ids" && "Belirli kullanıcılar"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Kanallar</span>
                    <span className="font-medium text-body">
                      {sendForm.channels.length === 0
                        ? "—"
                        : sendForm.channels.map((c) => channelMeta.find((m) => m.key === c)?.label).join(", ")}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Durum</span>
                    <span className={`font-medium ${canSend ? "text-success-600" : "text-warning-600"}`}>
                      {canSend ? "Gönderime hazır" : "Eksik alanlar var"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Zamanlama modalı */}
        {showScheduleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-heading/60">
            <div className="bg-surface-elevated rounded-xl border border-border w-full max-w-md px-6 pb-6 pt-5">
              <h2 className="text-xl font-bold text-heading mb-4 leading-tight">
                Bildirimi Zamanla
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Gönderim Tarihi ve Saati
                  </label>
                  <Input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                  >
                    İptal
                  </Button>
                  <Button
                    onClick={handleScheduleNotification}
                    disabled={scheduling || !scheduleDate}
                  >
                    {scheduling ? "Kaydediliyor..." : "Zamanla"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // "scheduled" veya "history" sekmesi — ResourceListPage liste çatısı
  return (
    <ResourceListPage<any>
      title="Bildirim Yönetimi"
      description="Push, email ve SMS bildirimleri gönderin ve yönetin"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(k) => setActiveTab(k as TabType)}
      // Arama yalnız history sekmesinde (backend getNotificationHistory search destekliyor);
      // scheduled sekmesinde arama yok.
      search={activeTab === "history" ? { placeholder: "Başlık, içerik veya kullanıcı ara..." } : undefined}
      searchValue={activeTab === "history" ? search : undefined}
      onSearchChange={activeTab === "history" ? setSearch : undefined}
      onSearchSubmit={activeTab === "history" ? onSearchSubmit : undefined}
      filters={historyFilters}
      columns={activeColumns}
      data={rows}
      loading={isLoading}
      emptyText={activeEmptyText}
      getRowId={(r) => (r as any).id}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
