/** @format */

"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import { Spinner } from "./Spinner";

export interface FileDropzoneLabels {
  /** Dosya seçilmemişken görünen ana metin. */
  idle: string;
  /** Sürükleme alanın üzerindeyken görünen metin. */
  active: string;
  /** Kabul edilen tür/boyut ipucu. */
  hint?: string;
  /** Seçme butonu (dosya yokken). */
  select: string;
  /** Seçme butonu (dosya varken). */
  replace: string;
  /** Kaldır butonunun erişilebilir adı. */
  remove: string;
  /** Yükleme sürerken görünen metin. */
  busy?: string;
}

export interface FileDropzoneProps {
  /** `accept` özniteliği — hem tıkla-seç hem sürükle-bırak doğrulamasında kullanılır. */
  accept: string;
  value: File | null;
  onChange: (file: File | null) => void;
  labels: FileDropzoneLabels;
  /** Aşan dosya reddedilir ve `onReject` çağrılır. */
  maxBytes?: number;
  disabled?: boolean;
  /** Yükleme sürerken alanı kilitler ve spinner gösterir. */
  busy?: boolean;
  /** Tür/boyut nedeniyle reddedilen dosyayı bildirir (mesajı çağıran üretir). */
  onReject?: (file: File, reason: "type" | "size") => void;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Uzantı/MIME listesine göre dosyayı kabul eder. Sürükle-bırakta tarayıcı
 * `accept`'i uygulamaz — kontrolü burada tekrar yaparız.
 */
function matchesAccept(file: File, accept: string): boolean {
  const patterns = accept
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!patterns.length) return true;

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.startsWith(".")) return name.endsWith(pattern);
    if (pattern.endsWith("/*")) return type.startsWith(pattern.slice(0, -1));
    return type === pattern;
  });
}

/**
 * Sürükle-bırak + tıkla-seç dosya alanı.
 *
 * Reklam görseli ve toplu içe aktarma ekranları bu davranışı ayrı ayrı elle
 * yazmıştı; üçüncü bir kopya çıkmadan tek yere alındı. Ham `<input type="file">`
 * ESLint'in tek istisnası olduğu için burada kullanılabilir.
 */
export function FileDropzone({
  accept,
  value,
  onChange,
  labels,
  maxBytes,
  disabled = false,
  busy = false,
  onReject,
  className,
}: FileDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const locked = disabled || busy;

  const accept_ = React.useCallback(
    (file: File) => {
      if (!matchesAccept(file, accept)) {
        onReject?.(file, "type");
        return;
      }
      if (maxBytes != null && file.size > maxBytes) {
        onReject?.(file, "size");
        return;
      }
      onChange(file);
    },
    [accept, maxBytes, onChange, onReject],
  );

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (locked) return;
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (locked) return;
    const file = event.dataTransfer.files?.[0];
    if (file) accept_(file);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragActive ? "border-primary-500 bg-primary-50" : "border-border",
          locked && "opacity-60",
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        data-testid="file-dropzone"
      >
        {busy ? (
          <div className="text-muted">
            <Spinner size="lg" className="mx-auto mb-2" />
            {labels.busy}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">
              {dragActive ? labels.active : labels.idle}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="sr-only"
              disabled={locked}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) accept_(file);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={locked}
              onClick={() => inputRef.current?.click()}
            >
              {value ? labels.replace : labels.select}
            </Button>
            {labels.hint ? (
              <p className="mt-2 text-xs text-muted">{labels.hint}</p>
            ) : null}
          </>
        )}
      </div>

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-heading">
              {value.name}
            </p>
            <p className="text-xs text-muted">{formatSize(value.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked}
            onClick={() => onChange(null)}
          >
            {labels.remove}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
