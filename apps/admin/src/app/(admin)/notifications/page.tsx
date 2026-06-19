"use client";

import { useState, useCallback } from "react";
import { adminApi } from "@/lib/api";
import {
  BellIcon,
  PaperAirplaneIcon,
  ClockIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import {
  Button,
  Checkbox,
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
  // History sekmesinde search desteklenmiyor → search prop'u ResourceListPage'e verilmez.
  const {
    rows,
    page,
    setPage,
    totalPages,
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

          {/* Gönderim formu */}
          <div className="admin-card p-6 max-w-2xl">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Başlık *
                </label>
                <Input
                  type="text"
                  value={sendForm.title}
                  onChange={(e) =>
                    setSendForm({ ...sendForm, title: e.target.value })
                  }
                  placeholder="Bildirim başlığı"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  İçerik *
                </label>
                <Textarea
                  value={sendForm.body}
                  onChange={(e) =>
                    setSendForm({ ...sendForm, body: e.target.value })
                  }
                  rows={4}
                  placeholder="Bildirim içeriği"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Kanallar
                </label>
                <div className="flex gap-4">
                  {["push", "email", "sms"].map((channel) => (
                    <Checkbox
                      key={channel}
                      checked={sendForm.channels.includes(channel)}
                      onChange={() => toggleChannel(channel)}
                      label={
                        <span>
                          {enumLabel(notificationChannelConfig, channel)}
                        </span>
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Hedef
                </label>
                <Select
                  value={sendForm.targetType}
                  onChange={(e) =>
                    setSendForm({
                      ...sendForm,
                      targetType: e.target.value as any,
                    })
                  }
                >
                  <option value="all">Tüm Kullanıcılar</option>
                  <option value="segment">Segment</option>
                  <option value="user_ids">Belirli Kullanıcılar</option>
                </Select>
              </div>

              {sendForm.targetType === "user_ids" && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Kullanıcı ID&apos;leri (virgülle ayırın)
                  </label>
                  <Input
                    type="text"
                    value={sendForm.userIds}
                    onChange={(e) =>
                      setSendForm({ ...sendForm, userIds: e.target.value })
                    }
                    placeholder="uuid1, uuid2, uuid3"
                  />
                </div>
              )}

              {sendForm.targetType === "segment" && (
                <div className="space-y-4 p-4 bg-surface-alt rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-muted mb-2">
                      Satıcı Durumu
                    </label>
                    <Select
                      value={
                        sendForm.isSeller === undefined
                          ? ""
                          : sendForm.isSeller
                            ? "true"
                            : "false"
                      }
                      onChange={(e) =>
                        setSendForm({
                          ...sendForm,
                          isSeller:
                            e.target.value === ""
                              ? undefined
                              : e.target.value === "true",
                        })
                      }
                    >
                      <option value="">Hepsi</option>
                      <option value="true">Sadece Satıcılar</option>
                      <option value="false">Sadece Alıcılar</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-2">
                      Üyelik Tipi
                    </label>
                    <Select
                      value={sendForm.membershipTier}
                      onChange={(e) =>
                        setSendForm({
                          ...sendForm,
                          membershipTier: e.target.value,
                        })
                      }
                    >
                      <option value="">Hepsi</option>
                      <option value="free">Free</option>
                      <option value="premium">Premium</option>
                      <option value="business">Business</option>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <Button onClick={handleSendNotification} disabled={sending}>
                  <PaperAirplaneIcon className="h-5 w-5 mr-2 shrink-0" />
                  {sending ? "Gönderiliyor..." : "Şimdi Gönder"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowScheduleModal(true)}
                  disabled={!sendForm.title || !sendForm.body}
                >
                  <ClockIcon className="h-5 w-5 mr-2 shrink-0" />
                  Zamanla
                </Button>
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
      // Arama yok (backend desteklemiyor); sadece filtreler (history sekmesinde)
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
