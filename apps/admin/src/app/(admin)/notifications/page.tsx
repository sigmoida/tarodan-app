"use client";

import { useState, useEffect, useCallback } from "react";
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
import { AdminTabs } from "@/components/AdminTabs";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { PageHeader, ActionButtons, ActionIconButton } from "@/components/admin-list";
import { useConfirm } from "@/components/ConfirmProvider";

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

export default function NotificationsPage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<TabType>("send");

  // Send notification state
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

  // Scheduled notifications state
  const [scheduled, setScheduled] = useState<ScheduledNotification[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);

  // History state
  const [history, setHistory] = useState<NotificationLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    page: 1,
    limit: 20,
    channel: "",
    status: "",
  });
  const [totalHistory, setTotalHistory] = useState(0);

  // Schedule modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const loadScheduled = useCallback(async () => {
    setLoadingScheduled(true);
    try {
      const response = await adminApi.getScheduledNotifications({
        status: "pending",
      });
      setScheduled(response.data?.data || []);
    } catch (error: any) {
      toast.error("Zamanlanmış bildirimler yüklenemedi");
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await adminApi.getNotificationHistory({
        page: historyFilters.page,
        limit: historyFilters.limit,
        channel: historyFilters.channel || undefined,
        status: historyFilters.status || undefined,
      });
      setHistory(response.data?.data || []);
      setTotalHistory(response.data?.meta?.total || 0);
    } catch (error: any) {
      toast.error("Bildirim geçmişi yüklenemedi");
    } finally {
      setLoadingHistory(false);
    }
  }, [historyFilters]);

  useEffect(() => {
    if (activeTab === "scheduled") loadScheduled();
    if (activeTab === "history") loadHistory();
  }, [activeTab, loadScheduled, loadHistory]);

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
      loadScheduled();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Zamanlama başarısız");
    } finally {
      setScheduling(false);
    }
  };

  const handleCancelScheduled = async (id: string) => {
    if (!(await confirm({ description: "Bu zamanlanmış bildirimi iptal etmek istiyor musunuz?", destructive: true })))
      return;

    try {
      await adminApi.cancelScheduledNotification(id);
      toast.success("Bildirim iptal edildi");
      loadScheduled();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "İptal başarısız");
    }
  };

  const toggleChannel = (channel: string) => {
    setSendForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));
  };

  const scheduledColumns: ColumnDef<ScheduledNotification, any>[] = [
    {
      header: "Başlık",
      cell: ({ row }) => (
        <span className="font-medium text-heading">{row.original.title}</span>
      ),
    },
    {
      header: "Kanallar",
      cell: ({ row }) => (
        <span className="text-muted">{row.original.channels?.join(", ")}</span>
      ),
    },
    {
      header: "Hedef",
      cell: ({ row }) => (
        <span className="text-muted">{row.original.targetType}</span>
      ),
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="text-muted">
          {new Date(row.original.scheduledFor).toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <span className="badge badge-warning">
          {enumLabel(deliveryStatusConfig, row.original.status)}
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
            onClick={() => handleCancelScheduled(row.original.id)}
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
          {row.original.user?.displayName || row.original.userId}
        </span>
      ),
    },
    {
      header: "Kanal",
      cell: ({ row }) => (
        <span className="text-muted">
          {enumLabel(notificationChannelConfig, row.original.channel)}
        </span>
      ),
    },
    {
      header: "Başlık",
      cell: ({ row }) => (
        <span className="text-heading">{row.original.title}</span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <span
          className={`badge ${
            row.original.status === "sent" ||
            row.original.status === "delivered"
              ? "badge-success"
              : row.original.status === "failed"
                ? "badge-danger"
                : "badge-warning"
          }`}
        >
          {enumLabel(deliveryStatusConfig, row.original.status)}
        </span>
      ),
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="text-muted">
          {new Date(row.original.createdAt).toLocaleString("tr-TR")}
        </span>
      ),
    },
  ];

  const tabs = [
    { key: "send", label: "Bildirim Gönder", icon: PaperAirplaneIcon },
    { key: "scheduled", label: "Zamanlanmış", icon: ClockIcon },
    { key: "history", label: "Geçmiş", icon: BellIcon },
  ];

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Bildirim Yönetimi"
          description="Push, email ve SMS bildirimleri gönderin ve yönetin"
        />

        {/* Tabs */}
        <AdminTabs
          tabs={tabs}
          value={activeTab}
          onChange={(k) => setActiveTab(k as TabType)}
        />

        {/* Send Tab */}
        {activeTab === "send" && (
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
                      label={<span>{enumLabel(notificationChannelConfig, channel)}</span>}
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
                    Kullanıcı ID'leri (virgülle ayırın)
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
        )}

        {/* Scheduled Tab */}
        {activeTab === "scheduled" && (
          <DataTable
            columns={scheduledColumns}
            data={scheduled}
            loading={loadingScheduled}
            emptyText="Zamanlanmış bildirim yok"
            getRowId={(r) => r.id}
          />
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="flex gap-4 items-center">
              <Select
                value={historyFilters.channel}
                onChange={(e) =>
                  setHistoryFilters({
                    ...historyFilters,
                    channel: e.target.value,
                    page: 1,
                  })
                }
                className="w-48"
              >
                <option value="">Tüm Kanallar</option>
                <option value="push">Push</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </Select>
              <Select
                value={historyFilters.status}
                onChange={(e) =>
                  setHistoryFilters({
                    ...historyFilters,
                    status: e.target.value,
                    page: 1,
                  })
                }
                className="w-48"
              >
                <option value="">Tüm Durumlar</option>
                <option value="pending">Beklemede</option>
                <option value="sent">Gönderildi</option>
                <option value="delivered">Teslim Edildi</option>
                <option value="failed">Başarısız</option>
              </Select>
            </div>

            <DataTable
              columns={historyColumns}
              data={history}
              loading={loadingHistory}
              emptyText="Bildirim geçmişi boş"
              getRowId={(r) => r.id}
            />

            {/* Pagination */}
            {totalHistory > historyFilters.limit && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">
                  Sayfa {historyFilters.page} /{" "}
                  {Math.ceil(totalHistory / historyFilters.limit)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setHistoryFilters({
                        ...historyFilters,
                        page: historyFilters.page - 1,
                      })
                    }
                    disabled={historyFilters.page === 1}
                  >
                    Önceki
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setHistoryFilters({
                        ...historyFilters,
                        page: historyFilters.page + 1,
                      })
                    }
                    disabled={
                      historyFilters.page >=
                      Math.ceil(totalHistory / historyFilters.limit)
                    }
                  >
                    Sonraki
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedule Modal */}
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
