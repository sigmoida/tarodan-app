'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, Button, Input, Textarea, Checkbox, IconButton } from '@tarodan/ui';
import {
  XMarkIcon,
  CheckIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useConfirm } from '@/provider/ConfirmProvider';
import {
  PREDEFINED_PAGES,
  DEFAULT_CONTENT,
  buildPreviewDoc,
  type PredefinedSlug,
  type StaticPage,
  type EditorForm,
} from '../_lib/content';

const EMPTY: EditorForm = {
  title: '',
  content: '',
  metaTitle: '',
  metaDescription: '',
  metaKeywords: '',
  isPublished: true,
};

export function PageEditorModal({
  slug,
  existing,
  onClose,
}: {
  slug: PredefinedSlug;
  existing?: StaticPage;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const meta = PREDEFINED_PAGES.find((p) => p.slug === slug)!;

  const [form, setForm] = useState<EditorForm>(EMPTY);
  const [seoOpen, setSeoOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const pageQuery = useQuery({
    queryKey: ['page-detail', existing?.id],
    queryFn: async () => (await adminApi.getPageById(existing!.id)).data as StaticPage,
    enabled: !!existing,
  });

  // Fill the form from server data (edit) or defaults (new).
  useEffect(() => {
    let initial: EditorForm;
    if (existing) {
      if (!pageQuery.data) return;
      const p = pageQuery.data;
      initial = {
        title: p.title,
        content: p.content ?? '',
        metaTitle: p.metaTitle ?? '',
        metaDescription: p.metaDescription ?? '',
        metaKeywords: p.metaKeywords ?? '',
        isPublished: p.isPublished,
      };
    } else {
      const def = DEFAULT_CONTENT[slug];
      initial = { ...EMPTY, title: def.title, content: def.content };
    }
    setForm(initial);
    setPreviewHtml(buildPreviewDoc(initial.content));
  }, [slug, existing, pageQuery.data]);

  // Close the modal on load error (legacy behavior).
  useEffect(() => {
    if (pageQuery.isError) {
      toast.error('Sayfa yüklenemedi');
      onClose();
    }
  }, [pageQuery.isError, onClose]);

  // Clear the debounce timer on unmount.
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const onContentChange = (v: string) => {
    setForm((f) => ({ ...f, content: v }));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPreviewHtml(buildPreviewDoc(v)), 600);
  };

  const onTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ta = e.currentTarget;
    const s = ta.selectionStart;
    const end = ta.selectionEnd;
    onContentChange(ta.value.substring(0, s) + '  ' + ta.value.substring(end));
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = s + 2;
    });
  };

  const save = useAdminMutation(
    (v: EditorForm) =>
      existing ? adminApi.updatePage(existing.id, v) : adminApi.createPage({ slug, ...v }),
    {
      successMessage: 'Sayfa kaydedildi',
      errorMessage: 'Kaydetme başarısız',
      onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pages'] }),
    },
  );
  const saving = save.isPending;
  const onSave = () => save.mutate(form);

  const onReset = async () => {
    const ok = await confirm({
      title: 'Varsayılana Sıfırla',
      description: `"${meta.title}" sayfasının içeriği varsayılan metinle değiştirilecek. Mevcut içerik kaybolacak. Emin misiniz?`,
      confirmLabel: 'Sıfırla',
      destructive: true,
    });
    if (!ok) return;
    setResetting(true);
    try {
      const def = DEFAULT_CONTENT[slug];
      setForm((f) => ({ ...f, title: def.title, content: def.content }));
      setPreviewHtml(buildPreviewDoc(def.content));
      toast.success('Varsayılan içerik yüklendi — kaydetmek için "Kaydet" butonuna tıklayın');
    } finally {
      setResetting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} closeOnBackdrop={false} maxWidth="max-w-2xl" className="max-w-6xl">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <DocumentTextIcon className="h-5 w-5 shrink-0 text-primary-500" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-heading">{meta.title}</h2>
            <p className="font-mono text-xs text-muted">{meta.url}</p>
          </div>
          {existing?.isPublished && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-500/10 px-2 py-0.5 text-xs font-medium text-success-600">
              <GlobeAltIcon className="h-3 w-3" /> Yayında
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
          <Input
            label="Sayfa Başlığı"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Başlık"
          />

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">HTML İçerik</span>
              <span className="text-xs text-subtle">
                {form.content.length > 0 ? `${form.content.length} karakter` : 'Boş'}
              </span>
            </div>
            <Textarea
              bare
              id="page-editor"
              value={form.content}
              onChange={(e) => onContentChange(e.target.value)}
              onKeyDown={onTabKey}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="min-h-[300px] flex-1 resize-none rounded-lg border border-border bg-heading p-3 font-mono text-xs leading-relaxed text-inverted"
              placeholder="HTML içerik yazın. Örnek: <h2>Başlık</h2><p>Paragraf.</p>"
            />
            <p className="mt-1 text-xs text-subtle">
              Desteklenen etiketler: h1–h4, p, strong, em, a, ul, ol, li, blockquote, code
            </p>
          </div>

          {/* SEO */}
          <div className="overflow-hidden rounded-lg border border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSeoOpen((o) => !o)}
              className="h-auto w-full justify-between px-3 py-2.5 text-xs font-semibold text-muted"
            >
              <span>SEO Ayarları</span>
              <ChevronDownIcon className={`h-4 w-4 transition-transform ${seoOpen ? 'rotate-180' : ''}`} />
            </Button>
            {seoOpen && (
              <div className="space-y-3 border-t border-border p-3">
                <Input
                  label="Meta Başlık"
                  value={form.metaTitle}
                  onChange={(e) => setForm((f) => ({ ...f, metaTitle: e.target.value }))}
                  placeholder="Tarayıcı sekme başlığı"
                />
                <Textarea
                  label="Meta Açıklama"
                  value={form.metaDescription}
                  onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
                  placeholder="Arama sonuçlarında görünen açıklama (150-160 karakter)"
                  rows={2}
                />
                <Input
                  label="Anahtar Kelimeler"
                  value={form.metaKeywords}
                  onChange={(e) => setForm((f) => ({ ...f, metaKeywords: e.target.value }))}
                  placeholder="kelime1, kelime2, kelime3"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-2">
            <Checkbox
              checked={form.isPublished}
              onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
              label="Yayında — web sitesinde görünür"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={onSave}
                isLoading={saving}
                leftIcon={<CheckIcon className="h-4 w-4" />}
              >
                Kaydet
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onReset}
                isLoading={resetting}
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                className="border-danger-300 text-danger-600 hover:bg-danger-50"
              >
                Varsayılana sıfırla
              </Button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-alt/20">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-elevated px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Önizleme</span>
            <span className="rounded bg-warning-500/10 px-1.5 py-0.5 text-xs text-warning-700">Canlı</span>
          </div>
          <iframe
            srcDoc={previewHtml}
            className="w-full flex-1 border-0 bg-surface-elevated"
            title="Sayfa önizlemesi"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </Modal>
  );
}
