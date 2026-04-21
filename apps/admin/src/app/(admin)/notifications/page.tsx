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
  Spinner,
  Textarea,
} from "@tarodan/ui";

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
    if (!confirm("Bu zamanlanmış bildirimi iptal etmek istiyor musunuz?"))
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

  const tabs = [
    { key: "send", label: "Bildirim Gönder", icon: PaperAirplaneIcon },
    { key: "scheduled", label: "Zamanlanmış", icon: ClockIcon },
    { key: "history", label: "Geçmiş", icon: BellIcon },
  ];

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bildirim Yönetimi
          </h1>
          <p className="text-gray-500 mt-1">
            Push, email ve SMS bildirimleri gönderin ve yönetin
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
          {tabs.map((tab) => (
            <Button
              variant="secondary"
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabType)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                activeTab === tab.key
                  ? "bg-primary-500 text-gray-900"
                  : "bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Send Tab */}
        {activeTab === "send" && (
          <div className="admin-card p-6 max-w-2xl">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
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
                <label className="block text-sm font-medium text-gray-600 mb-2">
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
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Kanallar
                </label>
                <div className="flex gap-4">
                  {["push", "email", "sms"].map((channel) => (
                    <Checkbox
                      key={channel}
                      checked={sendForm.channels.includes(channel)}
                      onChange={() => toggleChannel(channel)}
                      label={<span className="capitalize">{channel}</span>}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
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
                  <label className="block text-sm font-medium text-gray-600 mb-2">
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
                <div className="space-y-4 p-4 bg-gray-100 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
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
                    <label className="block text-sm font-medium text-gray-600 mb-2">
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
                  <PaperAirplaneIcon className="h-5 w-5 mr-2" />
                  {sending ? "Gönderiliyor..." : "Şimdi Gönder"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowScheduleModal(true)}
                  disabled={!sendForm.title || !sendForm.body}
                >
                  <ClockIcon className="h-5 w-5 mr-2" />
                  Zamanla
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Scheduled Tab */}
        {activeTab === "scheduled" && (
          <div className="admin-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Başlık</th>
                    <th>Kanallar</th>
                    <th>Hedef</th>
                    <th>Tarih</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingScheduled ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8">
                        <Spinner size="lg" className="mx-auto" />
                      </td>
                    </tr>
                  ) : scheduled.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center py-8 text-gray-500"
                      >
                        Zamanlanmış bildirim yok
                      </td>
                    </tr>
                  ) : (
                    scheduled.map((item) => (
                      <tr key={item.id}>
                        <td className="font-medium text-gray-900">
                          {item.title}
                        </td>
                        <td className="text-gray-500">
                          {item.channels?.join(", ")}
                        </td>
                        <td className="text-gray-500">{item.targetType}</td>
                        <td className="text-gray-500">
                          {new Date(item.scheduledFor).toLocaleString("tr-TR")}
                        </td>
                        <td>
                          <span className="badge badge-warning">
                            {item.status}
                          </span>
                        </td>
                        <td>
                          <Button
                            variant="secondary"
                            onClick={() => handleCancelScheduled(item.id)}
                            className="p-2 text-danger-600 hover:text-danger-300 hover:bg-danger-500/10 rounded-lg"
                          >
                            <XCircleIcon className="h-5 w-5" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
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

            <div className="admin-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Kullanıcı</th>
                      <th>Kanal</th>
                      <th>Başlık</th>
                      <th>Durum</th>
                      <th>Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingHistory ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8">
                          <Spinner size="lg" className="mx-auto" />
                        </td>
                      </tr>
                    ) : history.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="text-center py-8 text-gray-500"
                        >
                          Bildirim geçmişi boş
                        </td>
                      </tr>
                    ) : (
                      history.map((log) => (
                        <tr key={log.id}>
                          <td className="text-gray-900">
                            {log.user?.displayName || log.userId}
                          </td>
                          <td className="text-gray-500 uppercase">
                            {log.channel}
                          </td>
                          <td className="text-gray-900">{log.title}</td>
                          <td>
                            <span
                              className={`badge ${
                                log.status === "sent" ||
                                log.status === "delivered"
                                  ? "badge-success"
                                  : log.status === "failed"
                                    ? "badge-danger"
                                    : "badge-warning"
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="text-gray-500">
                            {new Date(log.createdAt).toLocaleString("tr-TR")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalHistory > historyFilters.limit && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Bildirimi Zamanla
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
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
