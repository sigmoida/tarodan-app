'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Modal, Button, Input, Textarea, IconButton } from '@tarodan/ui';
import {
  XMarkIcon,
  PaperAirplaneIcon,
  CheckIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { useQueryClient } from '@tanstack/react-query';
import { SAMPLE_DATA } from '../_lib/sampleData';
import { makeSourceData, type TemplateDetail } from '../_lib/types';

export function EmailTemplateEditorModal({
  templateKey,
  onClose,
}: {
  templateKey: string;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [form, setForm] = useState({ name: '', subject: '', bodyHtml: '' });
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const refreshList = () => queryClient.invalidateQueries({ queryKey: ['email-templates'] });

  const loadPreview = useCallback(
    async (draftHtml?: string, draftSubject?: string) => {
      setPreviewLoading(true);
      setPreviewError(false);
      try {
        const sample = SAMPLE_DATA[templateKey] || {};
        const res = await adminApi.previewEmailTemplate(templateKey, sample as Record<string, any>, {
          html: draftHtml,
          subject: draftSubject,
        });
        setPreview(res.data);
      } catch {
        setPreviewError(true);
      } finally {
        setPreviewLoading(false);
      }
    },
    [templateKey],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await adminApi.getEmailTemplate(templateKey);
        if (!alive) return;
        const d: TemplateDetail = res.data;
        setDetail(d);
        if (d.bodyHtml) {
          setForm({ name: d.name || templateKey, subject: d.subject || '', bodyHtml: d.bodyHtml });
          loadPreview(d.bodyHtml, d.subject || undefined);
        } else {
          const sourceData = makeSourceData(SAMPLE_DATA[templateKey] || {});
          const sourceRes = await adminApi.previewEmailTemplate(
            templateKey,
            sourceData as Record<string, any>,
          );
          if (!alive) return;
          setForm({ name: d.name || templateKey, subject: d.subject || '', bodyHtml: sourceRes.data?.html || '' });
          loadPreview();
        }
      } catch {
        toast.error('Şablon yüklenemedi');
        onClose();
      }
    })();
    return () => {
      alive = false;
      clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  const debouncedPreview = (html?: string, subject?: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadPreview(html, subject), 1200);
  };

  const onBodyChange = (value: string) => {
    setForm((f) => ({ ...f, bodyHtml: value }));
    debouncedPreview(value || undefined, form.subject || undefined);
  };
  const onSubjectChange = (value: string) => {
    setForm((f) => ({ ...f, subject: value }));
    debouncedPreview(form.bodyHtml || undefined, value || undefined);
  };

  const onTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    onBodyChange(ta.value.substring(0, start) + '  ' + ta.value.substring(end));
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + 2;
    });
  };

  const insertVar = (v: string) => {
    const ta = document.getElementById('html-editor') as HTMLTextAreaElement | null;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const ins = `{{${v}}}`;
    onBodyChange(form.bodyHtml.substring(0, s) + ins + form.bodyHtml.substring(e));
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = s + ins.length;
      ta.focus();
    });
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateEmailTemplate(templateKey, form);
      toast.success('Şablon kaydedildi');
      refreshList();
      loadPreview(form.bodyHtml || undefined, form.subject || undefined);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Kaydetme başarısız');
    } finally {
      setSaving(false);
    }
  };

  const onSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error('E-posta adresi girin');
      return;
    }
    setSendingTest(true);
    try {
      await adminApi.sendTestEmail(templateKey, {
        to: testEmail.trim(),
        templateData: (SAMPLE_DATA[templateKey] || {}) as Record<string, any>,
      });
      toast.success('Test e-postası kuyruğa eklendi');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gönderilemedi');
    } finally {
      setSendingTest(false);
    }
  };

  const onReset = async () => {
    const ok = await confirm({
      title: 'Varsayılana sıfırla',
      description: 'Özel şablon silinecek ve varsayılan sistem şablonuna dönülecek. Emin misiniz?',
      confirmLabel: 'Sıfırla',
      destructive: true,
    });
    if (!ok) return;
    setResetting(true);
    try {
      await adminApi.resetEmailTemplate(templateKey);
      setDetail((d) => (d ? { ...d, bodyHtml: null, subject: null, isCustom: false } : d));
      refreshList();
      const sourceData = makeSourceData(SAMPLE_DATA[templateKey] || {});
      const sourceRes = await adminApi.previewEmailTemplate(templateKey, sourceData as Record<string, any>);
      setForm((f) => ({ ...f, bodyHtml: sourceRes.data?.html || '', subject: '' }));
      loadPreview();
      toast.success('Varsayılan şablona sıfırlandı');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Sıfırlama başarısız');
    } finally {
      setResetting(false);
    }
  };

  const variables = (() => {
    if (detail?.variablesJson) {
      try {
        const o = JSON.parse(detail.variablesJson);
        if (typeof o === 'object' && o !== null) return Object.keys(o);
      } catch {
        /* empty */
      }
    }
    return Object.keys(SAMPLE_DATA[templateKey] || {});
  })();

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdrop={false}
      maxWidth="max-w-2xl"
      className="max-w-6xl"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <EnvelopeIcon className="h-5 w-5 shrink-0 text-primary-500" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-heading">
              {detail?.name || templateKey}
            </h2>
            <p className="font-mono text-xs text-muted">{templateKey}</p>
          </div>
          {detail?.isCustom && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-500/10 px-2 py-0.5 text-xs font-medium text-success-600">
              <CheckIcon className="h-3 w-3" /> Özel
            </span>
          )}
        </div>
        <IconButton aria-label="Kapat" variant="ghost" onClick={onClose}>
          <XMarkIcon className="h-5 w-5" />
        </IconButton>
      </div>

      {/* Split editor / preview */}
      <div className="grid h-[72vh] grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Editor */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          {variables.length > 0 && (
            <div className="rounded-lg border border-primary-500/20 bg-primary-500/5 p-3">
              <p className="mb-1.5 text-xs font-medium text-muted">Kullanılabilir değişkenler</p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <Button
                    key={v}
                    type="button"
                    variant="ghost"
                    onClick={() => insertVar(v)}
                    className="h-auto rounded bg-primary-500/10 px-1.5 py-0.5 font-mono text-xs text-primary-600 hover:bg-primary-500/20"
                  >
                    {`{{${v}}}`}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <Input
            label="Görünen Ad"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="E-posta Konusu"
            value={form.subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="Değişken kullanabilirsiniz: {{orderNumber}}"
          />

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">HTML Gövde</span>
              <span className="text-xs text-subtle">
                {form.bodyHtml.length > 0
                  ? `${form.bodyHtml.length} karakter`
                  : 'Boş (varsayılan kullanılır)'}
              </span>
            </div>
            <Textarea
              bare
              id="html-editor"
              value={form.bodyHtml}
              onChange={(e) => onBodyChange(e.target.value)}
              onKeyDown={onTabKey}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="min-h-[280px] flex-1 resize-none rounded-lg border border-border bg-heading p-3 font-mono text-xs leading-relaxed text-inverted"
              placeholder="Boş bırakırsanız sağdaki önizlemede gözüken varsayılan şablon gönderilir. Özelleştirmek için HTML yazın ve değişkenleri {{değişkenAdı}} formatında kullanın."
            />
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={onSave}
                isLoading={saving}
                leftIcon={<CheckIcon className="h-4 w-4" />}
              >
                Kaydet
              </Button>
              {detail?.isCustom && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={onReset}
                  isLoading={resetting}
                  leftIcon={<TrashIcon className="h-4 w-4" />}
                  className="border-danger-300 text-danger-600 hover:bg-danger-50"
                >
                  Varsayılana sıfırla
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@ornek.com"
                className="flex-1"
              />
              <Button
                variant="secondary"
                type="button"
                onClick={onSendTest}
                isLoading={sendingTest}
                disabled={!testEmail.trim()}
                leftIcon={<PaperAirplaneIcon className="h-4 w-4" />}
              >
                Test gönder
              </Button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-alt/20">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface-elevated px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Önizleme
              </span>
              <span className="rounded bg-warning-500/10 px-1.5 py-0.5 text-xs text-warning-700">
                Örnek veri
              </span>
            </div>
            {previewLoading && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <ArrowPathIcon className="h-3 w-3 animate-spin" /> Güncelleniyor
              </span>
            )}
          </div>

          {previewError ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <p className="text-sm text-muted">Önizleme yüklenemedi.</p>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => loadPreview(form.bodyHtml || undefined, form.subject || undefined)}
                  className="mt-3"
                >
                  Tekrar dene
                </Button>
              </div>
            </div>
          ) : preview ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-border bg-surface-elevated px-4 py-2">
                <p className="text-xs text-muted">
                  <span className="font-medium">Konu:</span>{' '}
                  <span className="text-heading">{preview.subject || '(konu yok)'}</span>
                </p>
              </div>
              <iframe
                key={preview.html.substring(0, 100)}
                srcDoc={preview.html}
                className="w-full flex-1 border-0"
                title="E-posta önizlemesi"
                sandbox="allow-same-origin allow-top-navigation-by-user-activation"
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <ArrowPathIcon className="h-6 w-6 animate-spin text-muted" />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
