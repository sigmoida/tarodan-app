"use client";

import { useEffect, useRef } from "react";
import { XMarkIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { Button, Textarea, IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the composer with content, up to a max height; resets when the
  // draft is cleared (e.g. after send).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [newMessage]);

  return (
    <div className="flex-shrink-0 px-6 py-3 bg-surface-elevated border-t border-border">
      {contentWarning && (
        <div className="mb-3 px-3 py-2 bg-warning-50 border border-warning-200 rounded-lg text-warning-800 text-xs">
          {contentWarning}
        </div>
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
          className={`flex-1 resize-none rounded-xl max-h-32 ${contentWarning ? "border-warning-400 focus:border-warning-400 focus:ring-warning-400" : ""}`}
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
      <p className="text-xs text-muted mt-1.5">
        {newMessage.length}/{maxMessageLength}
      </p>
    </div>
  );
}
