'use client';

import { useState } from 'react';
import { Button, Textarea } from '@tarodan/ui';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function RichTextEditor({ value, onChange, placeholder, className = '' }: RichTextEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  return (
    <div className={className}>
      <div className="flex gap-2 mb-2">
        <Button variant="secondary" type="button"
          onClick={() => setActiveTab('edit')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'edit' ? 'bg-primary-500 text-heading' : 'bg-surface-alt text-muted hover:text-body'}`}>
          Düzenle
        </Button>
        <Button variant="secondary" type="button"
          onClick={() => setActiveTab('preview')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'preview' ? 'bg-primary-500 text-heading' : 'bg-surface-alt text-muted hover:text-body'}`}>
          Önizleme
        </Button>
      </div>
      {activeTab === 'edit' ? (
        <Textarea value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={14}
          className="bg-surface-alt text-body font-mono placeholder-muted"
          spellCheck={false} />
      ) : (
        <div
          className="bg-surface-alt min-h-[200px] text-body prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: value || '<span class="text-muted">İçerik yok</span>' }}
        />
      )}
      <p className="text-xs text-muted mt-1">
        HTML kullanabilirsiniz: &lt;h1&gt;, &lt;p&gt;, &lt;strong&gt;, &lt;a href=&quot;...&quot;&gt;, &lt;ul&gt;&lt;li&gt;
      </p>
    </div>
  );
}
