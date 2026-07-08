'use client';

import { useRef, useState } from 'react';
import { useController } from 'react-hook-form';
import { Button } from '../Button';
import { FormField } from '../FormField';

export interface FormImageUploadProps {
  /** Field name — holds the uploaded image URL (string). */
  name: string;
  label?: string;
  /**
   * Async uploader → resolves the stored URL. Injected by the app so this
   * component stays free of any API client (keeps `@tarodan/ui` app-agnostic).
   */
  upload: (file: File) => Promise<string>;
  /** Accepted MIME types. Default: common image formats. */
  accept?: string;
  /** Max file size in MB. Default: 5. */
  maxSizeMb?: number;
  className?: string;
}

/**
 * RHF-wired image upload. The field value is a URL set asynchronously after the
 * upload resolves, so it uses `useController` (not `register`). Validation errors
 * surface inline via FormField (no toast). The raw `<input type="file">` is the
 * sanctioned exception to the no-raw-input rule.
 */
export function FormImageUpload({
  name,
  label,
  upload,
  accept = 'image/jpeg,image/png,image/webp',
  maxSizeMb = 5,
  className,
}: FormImageUploadProps) {
  const { field, fieldState } = useController({ name });
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentUrl = (field.value as string) || '';
  const error = (fieldState.error?.message as string | undefined) ?? localError ?? undefined;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    const allowed = accept.split(',').map((t) => t.trim());
    if (!allowed.includes(file.type)) {
      setLocalError('Yalnızca görsel dosyaları yüklenebilir');
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      setLocalError(`Dosya boyutu ${maxSizeMb}MB'ı geçemez`);
      return;
    }
    setUploading(true);
    try {
      const url = await upload(file);
      field.onChange(url);
    } catch {
      setLocalError('Görsel yüklenemedi, tekrar deneyin');
    } finally {
      setUploading(false);
    }
  };

  const remove = () => {
    field.onChange('');
    setLocalError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <FormField label={label} error={error} className={className}>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
          {currentUrl ? (
            <img src={currentUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg
              className="h-7 w-7 text-subtle"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 14.25V3.75a1.5 1.5 0 0 0-1.5-1.5h-13.5a1.5 1.5 0 0 0-1.5 1.5v16.5a1.5 1.5 0 0 0 1.5 1.5h10.5"
              />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {currentUrl ? 'Değiştir' : 'Yükle'}
          </Button>
          {currentUrl && !uploading && (
            <Button type="button" variant="ghost" size="sm" onClick={remove}>
              Kaldır
            </Button>
          )}
        </div>
      </div>
    </FormField>
  );
}
