"use client";

import { useEffect, useRef } from "react";
import {
  XMarkIcon,
  PhotoIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Alert, Button, Textarea, IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";

/** Yazı alanının büyüyebileceği en fazla satır sayısı; sonrası kayar. */
const MAX_COMPOSER_LINES = 4;

export default function MessageComposer({
  newMessage,
  attachedUrls,
  contentWarning,
  maxMessageLength,
  sending,
  attaching,
  onMessageChange,
  onAttachImage,
  onRemoveAttachment,
  onSend,
}: {
  newMessage: string;
  attachedUrls: string[];
  contentWarning: string | null;
  maxMessageLength: number;
  sending: boolean;
  attaching: boolean;
  onMessageChange: (text: string) => void;
  onAttachImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (index: number) => void;
  onSend: () => void;
}) {
  const t = useTranslations();
  const atLengthLimit = newMessage.length >= maxMessageLength;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Tek satır başlar, içerik uzadıkça EN FAZLA 4 satıra kadar büyür, sonrası
   * kendi içinde kayar.
   *
   * Sınır sabit bir piksel değeri değil, ölçülen satır yüksekliğinden türetilir:
   * yazı tipi/ölçek değiştiğinde 128px kimi temada 3, kimi temada 5 satıra denk
   * geliyordu.
   */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const chrome =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom) +
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);
    const maxHeight = lineHeight * MAX_COMPOSER_LINES + chrome;

    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [newMessage]);

  return (
    <div className="flex-shrink-0 px-6 py-3 bg-surface-elevated border-t border-border">
      {contentWarning && (
        <Alert
          variant="warning"
          icon={
            <ExclamationTriangleIcon className="h-5 w-5 text-warning-600" />
          }
          title="Uyarı"
          className="mb-3"
        >
          {contentWarning}
        </Alert>
      )}
      {attachedUrls.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachedUrls.map((url, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="w-14 h-14 object-cover rounded-lg border border-border"
              />
              <IconButton
                size="xs"
                aria-label={t("message.removeImage")}
                onClick={() => onRemoveAttachment(i)}
                className="absolute -top-1 -right-1 rounded-full bg-danger-600 text-inverted hover:bg-danger-700"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={onAttachImage}
        />
        <IconButton
          variant="outline"
          aria-label={t("message.attachImage")}
          onClick={() => fileInputRef.current?.click()}
          isLoading={attaching}
          disabled={attaching}
          className="flex-shrink-0 rounded-xl"
        >
          <PhotoIcon className="w-5 h-5" />
        </IconButton>
        <Textarea
          ref={textareaRef}
          rows={1}
          value={newMessage}
          onChange={(e) => onMessageChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={t("message.typeMessage")}
          maxLength={maxMessageLength}
          className={`flex-1 resize-none rounded-xl ${contentWarning ? "border-warning-400 focus:border-warning-400 focus:ring-warning-400" : ""}`}
        />
        <Button
          type="button"
          variant="primary"
          size="md"
          className="flex-shrink-0 rounded-xl shadow-sm"
          onClick={onSend}
          isLoading={sending}
          disabled={(!newMessage.trim() && !attachedUrls.length) || sending}
        >
          {t("common.send")}
        </Button>
      </div>
      {/* Sürekli görünen bir karakter sayacı yerine yalnız sınıra gelince
          uyarı: sayaç her tuşta dikkat çekiyor ama neredeyse hiçbir mesaj
          sınıra yaklaşmıyordu. */}
      {atLengthLimit && (
        <p className="mt-1.5 text-xs text-warning-600">
          {t("message.lengthLimitReached", { max: maxMessageLength })}
        </p>
      )}
    </div>
  );
}
