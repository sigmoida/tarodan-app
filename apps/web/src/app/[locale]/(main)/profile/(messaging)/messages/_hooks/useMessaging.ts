"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { messagesApi, listingsApi, api, mediaApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useConfirm } from "@/components/ConfirmProvider";
import { useLocale, useTranslations } from "next-intl";
import { useMessagingSocket } from "@/hooks/useMessagingSocket";
import {
  checkContentFilter,
  type Message,
  type MessageThread,
} from "../_lib/messages";

const INITIAL_THREADS = 6;

type Draft = { text: string; urls: string[] };
const EMPTY_DRAFT: Draft = { text: "", urls: [] };

/**
 * View-model for the two-pane chat: threads + active conversation + composer.
 * Owns every query (settings/threads/messages), the messaging socket, the
 * draft-per-thread state, thread creation from `?user=`/`?listing=`, and the
 * send/attach/scroll logic — so the page stays a thin layout.
 */
export function useMessaging(enabled: boolean) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const locale = useLocale();
  const confirm = useConfirm();
  const { user } = useAuthStore();

  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(
    null,
  );
  /** Taslak sohbet bazında: sohbet değişince yazı/resim eski sohbette kalır */
  const [draftsByThreadId, setDraftsByThreadId] = useState<
    Record<string, Draft>
  >({});
  // Product context (from `?listing=`) to attach to the NEXT message sent in a
  // thread, so opening the same seller from a different listing switches context.
  const [pendingProductByThreadId, setPendingProductByThreadId] = useState<
    Record<string, string>
  >({});
  const [sending, setSending] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  const [threadsExpanded, setThreadsExpanded] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  // Bildirim linkinden (/messages?thread=<id>) gelen thread'i bir kez otomatik açmak için.
  const autoSelectedThreadRef = useRef<string | null>(null);

  const sellerId = searchParams.get("user");
  const productId = searchParams.get("listing");

  const currentDraft = selectedThread
    ? (draftsByThreadId[selectedThread.id] ?? EMPTY_DRAFT)
    : EMPTY_DRAFT;
  const newMessage = currentDraft.text;
  const attachedUrls = currentDraft.urls;
  const contentWarning =
    currentDraft.text.length > 5
      ? (checkContentFilter(currentDraft.text, locale).warning ?? null)
      : null;

  const messageSettingsQuery = useQuery({
    queryKey: queryKeys.messages.settings(),
    queryFn: async () => {
      const response = await api.get("/admin/settings/public");
      return response.data || {};
    },
    enabled,
    meta: { page: "message-settings" },
  });
  const maxMessageLength =
    messageSettingsQuery.data?.max_message_length ?? 1000;

  const threadsQuery = useQuery({
    queryKey: queryKeys.messages.threads(),
    queryFn: async (): Promise<MessageThread[]> => {
      const response = await messagesApi.getThreads();
      const rawThreads = response.data.data || response.data.threads || [];
      const userLabel = t("common.user");
      const productLabel = t("order.product");
      return rawThreads.map((t: any) => {
        if (t.otherUser) return t;
        const isParticipant1 = t.participant1Id === user?.id;
        return {
          ...t,
          otherUser: {
            id: isParticipant1 ? t.participant2Id : t.participant1Id,
            displayName: isParticipant1
              ? t.participant2Name || userLabel
              : t.participant1Name || userLabel,
            avatarUrl: isParticipant1
              ? t.participant2AvatarUrl || null
              : t.participant1AvatarUrl || null,
          },
          lastMessage: t.lastMessage
            ? {
                ...t.lastMessage,
                isFromMe: t.lastMessage.senderId === user?.id,
              }
            : undefined,
          product: t.productId
            ? {
                id: t.productId,
                title: t.productTitle || productLabel,
                imageUrl: t.productImage,
              }
            : undefined,
        };
      });
    },
    enabled,
    meta: { page: "message-threads" },
  });
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);
  const loading = threadsQuery.isLoading;

  const visibleThreads = threadsExpanded
    ? threads
    : threads.slice(0, INITIAL_THREADS);
  const hasMoreThreads = threads.length > INITIAL_THREADS && !threadsExpanded;
  const remainingCount = threads.length - INITIAL_THREADS;

  const messagesQuery = useQuery({
    queryKey: queryKeys.messages.thread(selectedThread?.id),
    queryFn: async (): Promise<Message[]> => {
      const response = await messagesApi.getMessages(selectedThread!.id);
      const messages = response.data.data || response.data.messages || [];
      return [...messages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    },
    enabled: enabled && !!selectedThread?.id,
    meta: { page: "messages" },
  });
  const messages = messagesQuery.data ?? [];

  const { typingUserIds } = useMessagingSocket({
    activeThreadId: selectedThread?.id,
  });

  useEffect(() => {
    if (selectedThread?.id && messagesQuery.isSuccess) {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.threads() });
    }
  }, [selectedThread?.id, messagesQuery.isSuccess, queryClient]);

  const scrollChatToBottom = () => {
    requestAnimationFrame(() => {
      const el = messagesScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };
  useEffect(() => {
    if (selectedThread && messages.length >= 0) {
      const timer = setTimeout(scrollChatToBottom, 80);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, selectedThread?.id]);

  // Yeni mesaj bildirimine tıklayınca gelinen /messages?thread=<id> linkindeki
  // sohbeti otomatik aç (bir kez; kullanıcı sonradan başka sohbet seçerse ezme).
  useEffect(() => {
    const threadIdParam = searchParams.get("thread");
    if (!threadIdParam || threads.length === 0) return;
    if (autoSelectedThreadRef.current === threadIdParam) return;
    const found = threads.find((thr) => thr.id === threadIdParam);
    if (found) {
      setSelectedThread(found);
      autoSelectedThreadRef.current = threadIdParam;
    }
  }, [searchParams, threads]);

  const prefilledFor = (productTitle: string) =>
    t("message.prefilledInquiry", { title: productTitle });

  const handleCreateThreadForProduct = async () => {
    if (!sellerId || creatingThread) return;

    // Fetch product details if productId is provided
    let productTitle = "";
    if (productId) {
      try {
        const productResponse = await listingsApi.getOne(productId);
        const product = productResponse.data.product || productResponse.data;
        productTitle = product.title || t("order.product");
      } catch (error) {
        if (process.env.NODE_ENV === "development")
          console.error("Failed to fetch product:", error);
      }
    }

    // Scenario B: one thread per seller — reuse it regardless of which product
    // the buyer opened it from (the product becomes per-message/latest context).
    const existingThread = threads.find((t) => t.otherUser?.id === sellerId);

    if (existingThread) {
      setSelectedThread(existingThread);
      if (productId) {
        setPendingProductByThreadId((prev) => ({
          ...prev,
          [existingThread.id]: productId,
        }));
      }
      if (productTitle) {
        const prefilled = prefilledFor(productTitle);
        setDraftsByThreadId((prev) => {
          const existing = prev[existingThread.id];
          if (existing?.text) return prev;
          return {
            ...prev,
            [existingThread.id]: {
              text: prefilled,
              urls: existing?.urls ?? [],
            },
          };
        });
      }
      window.history.replaceState({}, "", "/profile/messages");
      return;
    }

    // Create a new thread
    setCreatingThread(true);
    try {
      const response = await messagesApi.createThread({
        participantId: sellerId,
        productId: productId || undefined,
      });

      const newThread = response.data.thread || response.data;

      // Transform the thread to match our interface.
      // Backend createThread yanıtı otherUser DEĞİL, participant1/2 şeklinde döner;
      // karşı taraf (sellerId) hangi participant ise onun adını/avatarını al.
      const sellerIsP1 = newThread.participant1Id === sellerId;
      const otherName = sellerIsP1
        ? newThread.participant1Name
        : newThread.participant2Name;
      const otherAvatar = sellerIsP1
        ? newThread.participant1AvatarUrl
        : newThread.participant2AvatarUrl;
      const transformedThread: MessageThread = {
        id: newThread.id,
        otherUser: {
          id: sellerId,
          displayName:
            newThread.otherUser?.displayName ||
            otherName ||
            t("product.seller"),
          avatarUrl: newThread.otherUser?.avatarUrl || otherAvatar,
        },
        unreadCount: 0,
        product: productId
          ? {
              id: productId,
              title: productTitle || t("order.product"),
            }
          : undefined,
      };

      await queryClient.invalidateQueries({
        queryKey: queryKeys.messages.threads(),
      });
      setSelectedThread(transformedThread);
      if (productId) {
        setPendingProductByThreadId((prev) => ({
          ...prev,
          [transformedThread.id]: productId,
        }));
      }
      if (productTitle) {
        const prefilled = prefilledFor(productTitle);
        setDraftsByThreadId((prev) => ({
          ...prev,
          [transformedThread.id]: { text: prefilled, urls: [] },
        }));
      }
      window.history.replaceState({}, "", "/profile/messages");
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to create thread:", error);
      if (error.response?.status === 409) {
        await queryClient.refetchQueries({
          queryKey: queryKeys.messages.threads(),
        });
        const list =
          (queryClient.getQueryData(queryKeys.messages.threads()) as
            MessageThread[] | undefined) ?? [];
        const existingThread = list.find((t) => t.otherUser?.id === sellerId);
        if (existingThread) {
          setSelectedThread(existingThread);
          if (productTitle) {
            const prefilled = prefilledFor(productTitle);
            setDraftsByThreadId((prev) => ({
              ...prev,
              [existingThread.id]: { text: prefilled, urls: [] },
            }));
          }
        }
      } else {
        toast.error(t("common.operationFailed"));
      }
    } finally {
      setCreatingThread(false);
    }
  };

  useEffect(() => {
    if (sellerId && enabled && !threadsQuery.isLoading && !creatingThread) {
      handleCreateThreadForProduct();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, enabled, threadsQuery.isLoading]);

  const handleMessageChange = (text: string) => {
    if (!selectedThread) return;
    setDraftsByThreadId((prev) => ({
      ...prev,
      [selectedThread.id]: {
        ...(prev[selectedThread.id] ?? EMPTY_DRAFT),
        text,
      },
    }));
  };

  const handleAttachImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || attaching || !selectedThread) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      toast.error(t("message.selectImageFile"));
      return;
    }
    setAttaching(true);
    try {
      const res = await mediaApi.uploadMessageImage(file);
      const url = res.data?.url;
      if (url) {
        setDraftsByThreadId((prev) => ({
          ...prev,
          [selectedThread.id]: {
            ...(prev[selectedThread.id] ?? EMPTY_DRAFT),
            urls: [...(prev[selectedThread.id]?.urls ?? []), url],
          },
        }));
      }
    } catch (err: any) {
      // Sunucu mesajını göster (örn. AI: "Yüklediğiniz resim uygun değildir")
      const raw = err?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(" • ") : raw;
      toast.error(
        typeof msg === "string" && msg ? msg : t("message.imageUploadFailed"),
      );
    } finally {
      setAttaching(false);
      e.target.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    if (!selectedThread) return;
    setDraftsByThreadId((prev) => ({
      ...prev,
      [selectedThread.id]: {
        ...(prev[selectedThread.id] ?? EMPTY_DRAFT),
        urls: (prev[selectedThread.id]?.urls ?? []).filter(
          (_, j) => j !== index,
        ),
      },
    }));
  };

  const sendMessage = async () => {
    const text = newMessage.trim();
    const hasAttachments = attachedUrls.length > 0;
    if (!selectedThread || (!text && !hasAttachments) || sending) return;

    const contentToSend =
      text +
      (hasAttachments
        ? "\n\n" + attachedUrls.map((u) => `[IMG:${u}]`).join("\n")
        : "");

    // Check message length (content includes attachment markers)
    if (contentToSend.length > maxMessageLength) {
      toast.error(
        t("message.tooLong", {
          max: maxMessageLength,
          current: newMessage.length,
        }),
      );
      return;
    }

    // Final content filter check (text only)
    const filterResult = text
      ? checkContentFilter(text, locale)
      : { passed: true };
    if (!filterResult.passed) {
      const proceed = await confirm({
        title: t("message.contentWarning"),
        description: t("message.stillSend", {
          warning: filterResult.warning ?? "",
        }),
        confirmLabel: t("common.send"),
        cancelLabel: t("trade.dispute.cancelCta"),
      });
      if (!proceed) return;
    }

    setSending(true);
    try {
      const productContextId = pendingProductByThreadId[selectedThread.id];
      const response = await messagesApi.sendMessage(
        selectedThread.id,
        contentToSend,
        productContextId,
      );
      const sentMessage = response.data.message || response.data;

      // Check if message was filtered by backend
      if (sentMessage.isFiltered || sentMessage.status === "pending") {
        toast(t("message.sentForReview"), { icon: "⚠️" });
      }

      setDraftsByThreadId((prev) => {
        const next = { ...prev };
        delete next[selectedThread.id];
        return next;
      });
      setPendingProductByThreadId((prev) => {
        if (!(selectedThread.id in prev)) return prev;
        const next = { ...prev };
        delete next[selectedThread.id];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.thread(selectedThread.id),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.threads(),
        }),
      ]);

      setTimeout(scrollChatToBottom, 80);
    } catch (error: any) {
      if (error.response?.data?.requiresApproval) {
        toast(t("message.sentForReview"), { icon: "⚠️" });
      } else if (error.response?.data?.filtered) {
        toast.error(t("message.blockedContent"));
      } else {
        toast.error(error.response?.data?.message || t("message.sendFailed"));
      }
    } finally {
      setSending(false);
    }
  };

  return {
    // Thread list
    loading,
    visibleThreads,
    hasMoreThreads,
    remainingCount,
    expandThreads: () => setThreadsExpanded(true),
    selectedThread,
    selectThread: setSelectedThread,
    // Conversation
    messages,
    currentUserId: user?.id,
    typing: typingUserIds.length > 0,
    messagesScrollRef,
    // Composer
    newMessage,
    attachedUrls,
    contentWarning,
    maxMessageLength,
    sending,
    attaching,
    onMessageChange: handleMessageChange,
    onAttachImage: handleAttachImage,
    onRemoveAttachment: removeAttachment,
    onSend: sendMessage,
  };
}

export type MessagingVM = ReturnType<typeof useMessaging>;
